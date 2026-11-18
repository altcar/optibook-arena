/**
 * Declarative bot validation and runtime.
 *
 * Uploaded bots are data, not executable code. A bot is a JSON spec: a family
 * template plus parameters, risk limits, a universe and (for custom bots) a
 * small rule DSL. The engine interprets the spec every tick, so a submission
 * cannot escape the sandbox or read another account's state.
 */

import {
  STOCK_PAIRS,
  STOCK_SYMBOLS,
  type BotAction,
  type BotFamily,
  type BotRule,
  type BotSpec,
  type BotTrigger,
  type BotValidation,
  type Side,
  type StockSymbol,
} from '../shared/types';
import type { Broker } from './broker';
import type { MarketSim, SimInstrument } from './market';
import type { NewsEngine } from './news';
import { clamp, roundToTick } from './rng';

const FAMILIES: BotFamily[] = [
  'dual-mm',
  'hedge',
  'dual-arb',
  'sentiment-mm',
  'momentum-mm',
  'adaptive-mm',
  'custom',
];

const FIELDS = ['basisBps', 'changePct', 'sentiment', 'momentumBps', 'spreadBps', 'inventory', 'priceVsFairBps'];
const OPS = ['gt', 'lt', 'abs_gt'];
const ACTIONS = ['order', 'pair'];

const KNOWN_PARAMS: Record<BotFamily, string[]> = {
  'dual-mm': ['spread', 'qty'],
  hedge: ['threshold', 'qty'],
  'dual-arb': ['edgeBps', 'qty'],
  'sentiment-mm': ['spread', 'qty', 'takeThreshold'],
  'momentum-mm': ['spread', 'qty', 'horizon', 'bias', 'thresholdBps'],
  'adaptive-mm': ['baseSpread', 'qty', 'hedgeThreshold'],
  custom: ['edgeBps', 'qty', 'cooldownMs'],
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function validateBotSpec(raw: unknown): BotValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const obj = asRecord(raw);
  if (!obj) return { ok: false, errors: ['Bot file must contain a JSON object.'], warnings };

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (name.length < 3 || name.length > 40) errors.push('Name must be 3–40 characters.');

  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  if (description.length > 280) errors.push('Description must be 280 characters or fewer.');

  const family = obj.family as BotFamily;
  if (!FAMILIES.includes(family)) errors.push(`Family must be one of: ${FAMILIES.join(', ')}.`);

  const universeRaw = obj.universe;
  const universe: StockSymbol[] = [];
  if (!Array.isArray(universeRaw) || universeRaw.length < 1 || universeRaw.length > 5) {
    errors.push('Universe must list 1–5 stock symbols.');
  } else {
    for (const symbol of universeRaw) {
      if (typeof symbol !== 'string' || !(STOCK_SYMBOLS as readonly string[]).includes(symbol.toUpperCase())) {
        errors.push(`Unknown universe symbol: ${String(symbol)}.`);
      } else if (!universe.includes(symbol.toUpperCase() as StockSymbol)) {
        universe.push(symbol.toUpperCase() as StockSymbol);
      }
    }
  }

  const paramsObj = asRecord(obj.params) ?? {};
  const params: Record<string, number> = {};
  const allowed = KNOWN_PARAMS[family] ?? [];
  for (const [key, value] of Object.entries(paramsObj)) {
    const parsed = num(value);
    if (parsed === null) {
      errors.push(`Parameter "${key}" must be a finite number.`);
      continue;
    }
    if (parsed < 0 || parsed > 1_000_000) {
      errors.push(`Parameter "${key}" is outside the allowed range.`);
      continue;
    }
    if (allowed.length && !allowed.includes(key)) warnings.push(`Parameter "${key}" is not used by ${family}.`);
    params[key] = parsed;
  }

  const riskObj = asRecord(obj.risk) ?? {};
  const risk = {
    maxPosition: num(riskObj.maxPosition) ?? 40,
    maxGross: num(riskObj.maxGross) ?? 60_000,
    maxOrdersPerMin: num(riskObj.maxOrdersPerMin) ?? 20,
  };
  if (risk.maxPosition < 1 || risk.maxPosition > 100) errors.push('risk.maxPosition must be between 1 and 100.');
  if (risk.maxGross < 1_000 || risk.maxGross > 1_000_000) errors.push('risk.maxGross must be between 1,000 and 1,000,000.');
  if (risk.maxOrdersPerMin < 1 || risk.maxOrdersPerMin > 120) {
    errors.push('risk.maxOrdersPerMin must be between 1 and 120.');
  }
  if (risk.maxPosition > 80) warnings.push('maxPosition above 80 leaves little room for the 100-share venue cap.');
  if (risk.maxOrdersPerMin > 60) warnings.push('High order rates may hit the per-minute action limiter.');

  let rules: BotRule[] | undefined;
  if (family === 'custom') {
    if (!Array.isArray(obj.rules) || obj.rules.length < 1) {
      errors.push('Custom bots require at least one rule.');
    } else if (obj.rules.length > 12) {
      errors.push('Custom bots are limited to 12 rules.');
    } else {
      rules = [];
      obj.rules.forEach((entry, index) => {
        const ruleObj = asRecord(entry);
        if (!ruleObj) {
          errors.push(`Rule ${index + 1} must be an object.`);
          return;
        }
        const whenRaw = ruleObj.when;
        if (!Array.isArray(whenRaw) || whenRaw.length < 1 || whenRaw.length > 4) {
          errors.push(`Rule ${index + 1} needs 1–4 triggers.`);
          return;
        }
        const when: BotTrigger[] = [];
        whenRaw.forEach((triggerRaw, triggerIndex) => {
          const trigger = asRecord(triggerRaw);
          if (!trigger) {
            errors.push(`Rule ${index + 1} trigger ${triggerIndex + 1} must be an object.`);
            return;
          }
          const field = trigger.field as BotTrigger['field'];
          const op = trigger.op as BotTrigger['op'];
          const value = num(trigger.value);
          if (!FIELDS.includes(field)) errors.push(`Rule ${index + 1}: unknown field "${String(trigger.field)}".`);
          if (!OPS.includes(op)) errors.push(`Rule ${index + 1}: op must be gt, lt or abs_gt.`);
          if (value === null) errors.push(`Rule ${index + 1}: trigger value must be a number.`);
          if (trigger.instrument !== undefined && typeof trigger.instrument !== 'string') {
            errors.push(`Rule ${index + 1}: trigger instrument must be a string.`);
          }
          if (value !== null && FIELDS.includes(field) && OPS.includes(op)) {
            when.push({ field, op, value, instrument: typeof trigger.instrument === 'string' ? trigger.instrument : undefined });
          }
        });

        const actionObj = asRecord(ruleObj.action);
        if (!actionObj) {
          errors.push(`Rule ${index + 1} needs an action.`);
          return;
        }
        const type = actionObj.type as BotAction['type'];
        if (!ACTIONS.includes(type)) errors.push(`Rule ${index + 1}: action.type must be order or pair.`);
        const action: BotAction = { type };
        if (type === 'order') {
          if (actionObj.instrument !== undefined) action.instrument = String(actionObj.instrument);
          if (actionObj.side !== 'buy' && actionObj.side !== 'sell') errors.push(`Rule ${index + 1}: side must be buy or sell.`);
          else action.side = actionObj.side as Side;
          const qty = num(actionObj.qty);
          if (qty === null || qty < 1 || qty > 100) errors.push(`Rule ${index + 1}: qty must be between 1 and 100.`);
          else action.qty = Math.floor(qty);
          if (actionObj.orderType !== undefined) {
            if (!['market', 'ioc', 'limit'].includes(String(actionObj.orderType))) {
              errors.push(`Rule ${index + 1}: orderType must be market, ioc or limit.`);
            } else {
              action.orderType = actionObj.orderType as BotAction['orderType'];
            }
          }
          if (actionObj.offsetBps !== undefined) {
            const offset = num(actionObj.offsetBps);
            if (offset === null || offset < 0 || offset > 200) errors.push(`Rule ${index + 1}: offsetBps must be 0–200.`);
            else action.offsetBps = offset;
          }
        } else {
          if (!actionObj.long || !actionObj.short) errors.push(`Rule ${index + 1}: pair actions need long and short instruments.`);
          else {
            action.long = String(actionObj.long);
            action.short = String(actionObj.short);
          }
          const qty = num(actionObj.qty);
          if (qty === null || qty < 1 || qty > 100) errors.push(`Rule ${index + 1}: qty must be between 1 and 100.`);
          else action.qty = Math.floor(qty);
        }
        const cooldown = num(ruleObj.cooldownMs);
        const cooldownMs = cooldown === null ? 1500 : clamp(cooldown, 250, 120_000);
        if (cooldown !== null && (cooldown < 250 || cooldown > 120_000)) {
          warnings.push(`Rule ${index + 1}: cooldown clamped to 250–120,000 ms.`);
        }
        rules?.push({ when, action, cooldownMs });
      });
      if (!rules?.length) errors.push('No valid custom rules were found.');
    }
    if (!Array.isArray(obj.rules)) rules = undefined;
  } else if (obj.rules !== undefined) {
    warnings.push('Rules are ignored unless family is "custom".');
  }

  if (errors.length) return { ok: false, errors, warnings };

  const spec: BotSpec = {
    name,
    description,
    family,
    params,
    risk,
    universe: universe.length ? universe : ['NVDA'],
    rules,
  };
  return { ok: true, errors: [], warnings, spec };
}

export interface BotRuntime {
  market: MarketSim;
  broker: Broker;
  news: NewsEngine;
  now: number;
  tick: number;
  memo: Map<string, number>;
}

function instFor(runtime: BotRuntime, id: string): SimInstrument | undefined {
  return runtime.market.get(id);
}

function signedQty(runtime: BotRuntime, book: string, instrument: string): number {
  return runtime.broker.strategyQty(book, instrument);
}

function grossExposure(runtime: BotRuntime, book: string): number {
  let gross = 0;
  for (const inst of runtime.market.all()) {
    const qty = Math.abs(signedQty(runtime, book, inst.id));
    gross += qty * inst.mid;
  }
  return gross;
}

function canAct(bot: { lastActionAt: number; windowStartedAt: number; windowActions: number }, now: number, maxPerMin: number): boolean {
  if (now - (bot.windowStartedAt || 0) > 60_000) {
    bot.windowStartedAt = now;
    bot.windowActions = 0;
  }
  return bot.windowActions < maxPerMin;
}

function noteAction(bot: { lastActionAt: number; windowStartedAt: number; windowActions: number }, now: number): void {
  bot.lastActionAt = now;
  bot.windowActions++;
}

function positionRoom(runtime: BotRuntime, book: string, instrument: string, side: Side, riskMax: number): number {
  const current = signedQty(runtime, book, instrument);
  const riskRoom = side === 'buy' ? riskMax - current : riskMax + current;
  return Math.max(0, Math.min(riskRoom, runtime.broker.roomFor(instrument, side)));
}

function placeOrder(
  runtime: BotRuntime,
  book: string,
  instrument: string,
  side: Side,
  qty: number,
  type: 'market' | 'ioc' | 'limit',
  price: number | undefined,
  riskMax: number,
): boolean {
  const room = positionRoom(runtime, book, instrument, side, riskMax);
  const size = Math.min(Math.floor(qty), room);
  if (size < 1) return false;
  // An IOC without a limit is just a marketable order; the broker requires a
  // limit for IOC, so use a market order when no price was supplied.
  const actualType = type === 'ioc' && price === undefined ? 'market' : type;
  const result = runtime.broker.place({ book, instrument, side, qty: size, type: actualType, price });
  return result.ok && (result.filled ?? 0) > 0;
}

function quote(
  runtime: BotRuntime,
  book: string,
  instrument: string,
  bid: number,
  ask: number,
  qty: number,
  riskMax: number,
): void {
  const inst = instFor(runtime, instrument);
  if (!inst) return;
  const open = runtime.broker.openOrdersFor(book, instrument);
  const bestBid = inst.book.bids[0]?.price ?? 0;
  const bestAsk = inst.book.asks[0]?.price ?? Number.POSITIVE_INFINITY;
  const valid = bid > 0 && ask > bid && bid < bestAsk && ask > bestBid;
  for (const order of open) {
    const desired = order.side === 'buy' ? bid : ask;
    const shouldCancel =
      !valid || !Number.isFinite(desired) || Math.abs(order.price - desired) > inst.tick / 2;
    if (shouldCancel) runtime.broker.cancel(order.id);
  }
  if (!valid) return;
  const remaining = runtime.broker.openOrdersFor(book, instrument);
  if (!remaining.some((o) => o.side === 'buy')) {
    const room = positionRoom(runtime, book, instrument, 'buy', riskMax);
    if (room > 0) runtime.broker.place({ book, instrument, side: 'buy', qty: Math.min(qty, room), type: 'limit', price: bid });
  }
  if (!remaining.some((o) => o.side === 'sell')) {
    const room = positionRoom(runtime, book, instrument, 'sell', riskMax);
    if (room > 0) runtime.broker.place({ book, instrument, side: 'sell', qty: Math.min(qty, room), type: 'limit', price: ask });
  }
}

function basisBps(stock: SimInstrument, dual: SimInstrument): number {
  return (dual.mid / stock.mid - 1) * 10_000;
}

function momentumBps(runtime: BotRuntime, id: string, horizon: number): number {
  const history = runtime.market.get(id)?.history ?? [];
  if (history.length < horizon + 1) return 0;
  const last = history[history.length - 1];
  const past = history[history.length - 1 - horizon];
  if (!past) return 0;
  return ((last - past) / past) * 10_000;
}

function spreadBps(inst: SimInstrument): number {
  const bid = inst.book.bids[0]?.price ?? inst.mid;
  const ask = inst.book.asks[0]?.price ?? inst.mid;
  return inst.mid ? ((ask - bid) / inst.mid) * 10_000 : 0;
}

function inventory(runtime: BotRuntime, book: string, instrument: string): number {
  return signedQty(runtime, book, instrument);
}

function triggerValue(runtime: BotRuntime, book: string, trigger: BotTrigger, fallback: StockSymbol): number | null {
  const stockId = trigger.instrument?.toUpperCase() ?? fallback;
  const stock = instFor(runtime, stockId);
  if (!stock) return null;
  const dual = instFor(runtime, `${stockId}_DUAL`);
  switch (trigger.field) {
    case 'basisBps':
      return dual ? basisBps(stock, dual) : 0;
    case 'changePct':
      return ((stock.last / stock.prevClose - 1) * 100);
    case 'sentiment':
      return runtime.news.sentimentFor(stock.symbol);
    case 'momentumBps':
      return momentumBps(runtime, stockId, 8);
    case 'spreadBps':
      return spreadBps(stock);
    case 'inventory':
      return inventory(runtime, book, stockId);
    case 'priceVsFairBps':
      return stock.fair ? ((stock.mid - stock.fair) / stock.fair) * 10_000 : 0;
    default:
      return null;
  }
}

function triggerPasses(value: number, trigger: BotTrigger): boolean {
  if (trigger.op === 'gt') return value > trigger.value;
  if (trigger.op === 'lt') return value < trigger.value;
  return Math.abs(value) > Math.abs(trigger.value);
}

function parseInstrument(runtime: BotRuntime, symbol: string, fallback: StockSymbol): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('_DUAL')) {
    const base = upper.slice(0, -5);
    if (runtime.market.get(upper)) return upper;
    if (runtime.market.get(`${base}_DUAL`)) return `${base}_DUAL`;
  }
  if (runtime.market.get(upper)) return upper;
  return fallback;
}

export function runBot(
  bot: {
    id: string;
    userId: string;
    family: BotFamily;
    params: Record<string, number>;
    risk: BotSpec['risk'];
    universe: StockSymbol[];
    rules?: BotRule[];
    lastActionAt: number;
    windowStartedAt: number;
    windowActions: number;
  },
  runtime: BotRuntime,
): void {
  const book = `u:${bot.userId}:bot:${bot.id}`;
  const p = bot.params;
  const maxPos = Math.max(1, Math.min(100, bot.risk.maxPosition || 40));
  const qty = Math.max(1, Math.min(50, Math.floor(p.qty ?? 5)));
  const now = runtime.now;

  if (!canAct(bot, now, bot.risk.maxOrdersPerMin || 20)) return;
  if (grossExposure(runtime, book) > (bot.risk.maxGross || 60_000)) return;

  const traded = (ok: boolean) => {
    if (ok) noteAction(bot, now);
    return ok;
  };

  switch (bot.family) {
    case 'dual-mm': {
      const spread = Math.max(0.02, p.spread ?? 0.14);
      for (const symbol of bot.universe) {
        const stock = instFor(runtime, symbol);
        const dual = instFor(runtime, `${symbol}_DUAL`);
        if (!stock || !dual) continue;
        const fair = (stock.mid + dual.mid) / 2;
        const pos = signedQty(runtime, book, symbol);
        const skew = -(clamp(pos / maxPos, -1, 1) * spread * 0.9);
        const bid = roundToTick(fair + skew - spread / 2, stock.tick, 'down');
        const ask = roundToTick(fair + skew + spread / 2, stock.tick, 'up');
        if (ask - bid >= stock.tick * 2) {
          quote(runtime, book, symbol, bid, ask, qty, maxPos);
          noteAction(bot, now);
        }
      }
      break;
    }
    case 'hedge': {
      const threshold = Math.max(2, p.threshold ?? 30);
      for (const symbol of bot.universe) {
        const net = signedQty(runtime, book, symbol) + signedQty(runtime, book, `${symbol}_DUAL`);
        if (Math.abs(net) < threshold) continue;
        const side: Side = net > 0 ? 'sell' : 'buy';
        traded(placeOrder(runtime, book, `${symbol}_DUAL`, side, Math.min(Math.abs(net), qty), 'ioc', undefined, maxPos));
      }
      break;
    }
    case 'dual-arb': {
      const edge = Math.max(1, p.edgeBps ?? 8);
      for (const symbol of bot.universe) {
        const stock = instFor(runtime, symbol);
        const dual = instFor(runtime, `${symbol}_DUAL`);
        if (!stock || !dual) continue;
        const bps = basisBps(stock, dual);
        if (Math.abs(bps) < edge) continue;
        const cheap = bps > 0 ? symbol : `${symbol}_DUAL`;
        const rich = bps > 0 ? `${symbol}_DUAL` : symbol;
        const a = placeOrder(runtime, book, rich, 'sell', qty, 'ioc', undefined, maxPos);
        const b = placeOrder(runtime, book, cheap, 'buy', qty, 'ioc', undefined, maxPos);
        traded(a || b);
        if (a && b && bps > 0) runtime.broker.arbOps++;
      }
      break;
    }
    case 'sentiment-mm': {
      const threshold = Math.max(0.05, p.takeThreshold ?? 0.4);
      for (const symbol of bot.universe) {
        const stock = instFor(runtime, symbol);
        if (!stock) continue;
        const score = runtime.news.sentimentFor(symbol);
        if (Math.abs(score) < threshold) continue;
        const side: Side = score > 0 ? 'buy' : 'sell';
        traded(placeOrder(runtime, book, symbol, side, qty, 'ioc', undefined, maxPos));
      }
      break;
    }
    case 'momentum-mm': {
      const threshold = Math.max(0.5, p.thresholdBps ?? 1.5);
      const horizon = Math.max(2, Math.round(p.horizon ?? 6));
      for (const symbol of bot.universe) {
        const m = momentumBps(runtime, symbol, horizon);
        if (Math.abs(m) < threshold) continue;
        const side: Side = m > 0 ? 'buy' : 'sell';
        traded(placeOrder(runtime, book, symbol, side, qty, 'ioc', undefined, maxPos));
      }
      break;
    }
    case 'adaptive-mm': {
      const minSpread = Math.max(0.02, p.baseSpread ?? 0.07);
      for (const symbol of bot.universe) {
        const stock = instFor(runtime, symbol);
        if (!stock) continue;
        const pos = signedQty(runtime, book, symbol);
        const marketSpread = Math.max(stock.tick, (stock.book.asks[0]?.price ?? stock.mid) - (stock.book.bids[0]?.price ?? stock.mid));
        const base = Math.max(minSpread, marketSpread * 0.55);
        const skew = Math.tanh(pos / maxPos) * 0.3;
        const bid = roundToTick(stock.mid - base * (0.5 + skew), stock.tick, 'down');
        const ask = roundToTick(stock.mid + base * (0.5 - skew), stock.tick, 'up');
        if (ask - bid >= stock.tick * 2) {
          quote(runtime, book, symbol, bid, ask, qty, maxPos);
          noteAction(bot, now);
        }
      }
      break;
    }
    case 'custom': {
      const rules = bot.rules ?? [];
      for (const symbol of bot.universe) {
        for (let index = 0; index < rules.length; index++) {
          const rule = rules[index];
          const key = `rule:${index}:${symbol}`;
          const memo = runtime.memo;
          if (now - (memo.get(key) ?? 0) < (rule.cooldownMs ?? 1500)) continue;
          const passes = rule.when.every((trigger) => {
            const value = triggerValue(runtime, book, trigger, symbol);
            return value !== null && triggerPasses(value, trigger);
          });
          if (!passes) continue;
          const action = rule.action;
          if (action.type === 'pair') {
            if (!action.long || !action.short) continue;
            const long = parseInstrument(runtime, action.long, symbol);
            const short = parseInstrument(runtime, action.short, symbol);
            const size = Math.max(1, Math.min(50, action.qty ?? qty));
            const a = placeOrder(runtime, book, long, 'buy', size, 'ioc', undefined, maxPos);
            const b = placeOrder(runtime, book, short, 'sell', size, 'ioc', undefined, maxPos);
            if (a || b) {
              memo.set(key, now);
              noteAction(bot, now);
            }
          } else {
            const instrument = parseInstrument(runtime, action.instrument ?? symbol, symbol);
            const side: Side = action.side ?? 'buy';
            const size = Math.max(1, Math.min(50, action.qty ?? qty));
            const type = action.orderType ?? 'market';
            const inst = instFor(runtime, instrument);
            let price: number | undefined;
            if (type === 'limit' && inst) {
              const offset = (action.offsetBps ?? 0) / 10_000;
              price = roundToTick(side === 'buy' ? inst.mid * (1 + offset) : inst.mid * (1 - offset), inst.tick);
            }
            const ok = placeOrder(runtime, book, instrument, side, size, type, price, maxPos);
            if (ok) {
              memo.set(key, now);
              noteAction(bot, now);
            }
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

export function describeFamily(family: BotFamily): string {
  return family;
}

export function universeList(spec: BotSpec): string {
  return spec.universe.join(', ');
}

export const SUPPORTED_BOT_FAMILIES = FAMILIES;
export const RULE_FIELDS = FIELDS;
export const RULE_OPS = OPS;
