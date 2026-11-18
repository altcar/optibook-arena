import { STOCK_PAIRS, STRATEGY_META, type Side } from '../shared/types';
import { clamp, roundToTick } from './rng';

export interface StrategyContext {
  now: number;
  limit: number;
  memo: Map<string, number>;
  sim(id: string): { id: string; mid: number; tick: number; book: { bids: { price: number; size: number }[]; asks: { price: number; size: number }[] } } | undefined;
  history(id: string): number[];
  position(id: string): number;
  room(id: string, side: Side): number;
  cfg(key: string): number;
  sentimentFor(symbol: string): number;
  quote(instrument: string, bid: number, ask: number, qty: number): void;
  take(instrument: string, side: Side, qty: number, edgeTicks?: number): { ok: boolean };
  recordArb(): void;
}

export interface StrategyDef {
  id: string;
  name: string;
  short: string;
  description: string;
  origin: string;
  color: string;
  defaults: Record<string, number>;
  onTick(ctx: StrategyContext): void;
}

const meta = (id: string) => {
  const found = STRATEGY_META.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown strategy meta: ${id}`);
  return found;
};

/**
 * Port of the dual-priced market maker (arbStrat1 / arbStrat2 / final_solution).
 * The stock is quoted around the blended stock + dual mid, skewed by inventory.
 */
const dualMaker: StrategyDef = {
  ...meta('dual-mm'),
  defaults: { spread: 0.14, qty: 20 },
  onTick(e) {
    const spread = e.cfg('spread');
    const qty = e.cfg('qty');
    for (const pair of STOCK_PAIRS) {
      const stock = e.sim(pair.stock);
      const dual = e.sim(pair.dual);
      if (!stock || !dual) continue;
      const pos = e.position(pair.stock);
      const fair = stock.mid * 0.5 + dual.mid * 0.5;
      const skew = -(clamp(pos / e.limit, -1, 1) * spread * 0.9);
      const bid = roundToTick(fair + skew - spread / 2, stock.tick, 'down');
      const ask = roundToTick(fair + skew + spread / 2, stock.tick, 'up');
      if (ask - bid < stock.tick * 2) continue;
      e.quote(pair.stock, bid, ask, qty);
    }
  },
};

/**
 * Port of hedge_strategy.py: keep each stock/dual pair near flat once the
 * combined delta leaves the hedge band.
 */
const pairHedger: StrategyDef = {
  ...meta('hedge'),
  defaults: { threshold: 30, qty: 40 },
  onTick(e) {
    const threshold = e.cfg('threshold');
    const maxQty = e.cfg('qty');
    for (const pair of STOCK_PAIRS) {
      const net = e.position(pair.stock) + e.position(pair.dual);
      if (Math.abs(net) < threshold) continue;
      if (e.now - (e.memo.get(`hedge:${pair.symbol}`) ?? 0) < 900) continue;
      const side: Side = net > 0 ? 'sell' : 'buy';
      const qty = Math.min(Math.abs(net), maxQty);
      const result = e.take(pair.dual, side, qty);
      if (result.ok) e.memo.set(`hedge:${pair.symbol}`, e.now);
    }
  },
};

/**
 * Port of strat_worky/main.py and arbStrat4/hedge_arbitrage.py.
 */
const dualArbitrage: StrategyDef = {
  ...meta('dual-arb'),
  defaults: { edge: 0.05, qty: 10 },
  onTick(e) {
    const edge = e.cfg('edge');
    const size = e.cfg('qty');
    for (const pair of STOCK_PAIRS) {
      const stock = e.sim(pair.stock);
      const dual = e.sim(pair.dual);
      if (!stock || !dual) continue;
      if (e.now - (e.memo.get(`arb:${pair.symbol}`) ?? 0) < 1100) continue;
      const stockBid = stock.book.bids[0]?.price ?? 0;
      const stockAsk = stock.book.asks[0]?.price ?? 0;
      const dualBid = dual.book.bids[0]?.price ?? 0;
      const dualAsk = dual.book.asks[0]?.price ?? 0;
      if (!stockBid || !stockAsk || !dualBid || !dualAsk) continue;

      let first: { id: string; side: Side } | null = null;
      let second: { id: string; side: Side } | null = null;
      if (stockBid - dualAsk > edge) {
        first = { id: pair.stock, side: 'sell' };
        second = { id: pair.dual, side: 'buy' };
      } else if (dualBid - stockAsk > edge) {
        first = { id: pair.dual, side: 'sell' };
        second = { id: pair.stock, side: 'buy' };
      }
      if (!first || !second) continue;
      if (e.room(first.id, first.side) < 1 || e.room(second.id, second.side) < 1) continue;

      const a = e.take(first.id, first.side, size);
      const b = e.take(second.id, second.side, size);
      if (a.ok && b.ok) {
        e.recordArb();
        e.memo.set(`arb:${pair.symbol}`, e.now);
      }
    }
  },
};

/**
 * Port of arbStrat2sentiment / arbStrat3: news scores tilt fair value and
 * strong headlines trigger a small IOC reaction trade.
 */
const sentimentMaker: StrategyDef = {
  ...meta('sentiment-mm'),
  defaults: { spread: 0.16, qty: 15, sensitivity: 1, takeThreshold: 0.4 },
  onTick(e) {
    const baseSpread = e.cfg('spread');
    const qty = e.cfg('qty');
    const sensitivity = e.cfg('sensitivity');
    const takeThreshold = e.cfg('takeThreshold');
    for (const pair of STOCK_PAIRS) {
      const stock = e.sim(pair.stock);
      if (!stock) continue;
      const score = e.sentimentFor(pair.symbol);
      const pos = e.position(pair.stock);
      const spread = baseSpread * (1 + Math.abs(score) * 0.7);
      const fair = stock.mid + stock.mid * score * 0.0016 * sensitivity;
      const skew = -(clamp(pos / e.limit, -1, 1) * spread * 0.8);
      const bid = roundToTick(fair + skew - spread / 2, stock.tick, 'down');
      const ask = roundToTick(fair + skew + spread / 2, stock.tick, 'up');
      if (ask - bid >= stock.tick * 2) e.quote(pair.stock, bid, ask, qty);

      if (Math.abs(score) >= takeThreshold && Math.abs(pos) < e.limit * 0.55) {
        if (e.now - (e.memo.get(`sent:${pair.symbol}`) ?? 0) > 2600) {
          const side: Side = score > 0 ? 'buy' : 'sell';
          const result = e.take(pair.stock, side, Math.min(12, qty));
          if (result.ok) e.memo.set(`sent:${pair.symbol}`, e.now);
        }
      }
    }
  },
};

/**
 * Port of hugoarbones/momentum.py: short-horizon momentum bias, volatility
 * scaling, and inventory-aware sizing.
 */
const momentumMaker: StrategyDef = {
  ...meta('momentum-mm'),
  defaults: { spread: 0.15, qty: 15, horizon: 6, bias: 0.5 },
  onTick(e) {
    const baseSpread = e.cfg('spread');
    const baseQty = e.cfg('qty');
    const horizon = Math.max(2, Math.round(e.cfg('horizon')));
    const bias = e.cfg('bias');
    for (const pair of STOCK_PAIRS) {
      const stock = e.sim(pair.stock);
      if (!stock) continue;
      const history = e.history(pair.stock);
      if (history.length < horizon + 1) continue;
      const last = history[history.length - 1];
      const past = history[history.length - 1 - horizon];
      if (!past) continue;
      const momentum = (last - past) / past;
      const recent = history.slice(-12);
      const changes = recent.slice(1).map((v, i) => Math.abs(v - recent[i]) / Math.max(recent[i], 0.01));
      const vol = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
      const pos = e.position(pair.stock);
      const fair = stock.mid + stock.mid * momentum * bias;
      const spread = baseSpread * (1 + clamp(vol * 260, 0, 1.6));
      const skew = -(clamp(pos / e.limit, -1, 1) * spread * 0.85);
      const bid = roundToTick(fair + skew - spread / 2, stock.tick, 'down');
      const ask = roundToTick(fair + skew + spread / 2, stock.tick, 'up');
      const riskScale = clamp(1 - Math.abs(pos) / e.limit, 0.1, 1);
      const qty = Math.max(1, Math.round(baseQty * riskScale));
      if (ask - bid >= stock.tick * 2) e.quote(pair.stock, bid, ask, qty);
    }
  },
};

/**
 * Port of final_solution/controller.py: tanh inventory skew, a spread that
 * adapts to the live market, and smart dual hedges above a delta threshold.
 */
const adaptiveMaker: StrategyDef = {
  ...meta('adaptive-mm'),
  defaults: { baseSpread: 0.07, qty: 20, hedgeThreshold: 70 },
  onTick(e) {
    const minSpread = e.cfg('baseSpread');
    const qty = e.cfg('qty');
    const hedgeThreshold = e.cfg('hedgeThreshold');
    for (const pair of STOCK_PAIRS) {
      const stock = e.sim(pair.stock);
      if (!stock) continue;
      const pos = e.position(pair.stock);
      const marketSpread = Math.max(stock.tick, stock.book.asks[0].price - stock.book.bids[0].price);
      const base = Math.max(minSpread, marketSpread * 0.55);
      const skew = Math.tanh(pos / e.limit) * 0.3;
      const bid = roundToTick(stock.mid - base * (0.5 + skew), stock.tick, 'down');
      const ask = roundToTick(stock.mid + base * (0.5 - skew), stock.tick, 'up');
      if (ask - bid >= stock.tick * 2) e.quote(pair.stock, bid, ask, qty);

      if (Math.abs(pos) >= hedgeThreshold && Math.abs(pos) < e.limit) {
        if (e.now - (e.memo.get(`adapt:${pair.symbol}`) ?? 0) > 1400) {
          const side: Side = pos > 0 ? 'sell' : 'buy';
          const result = e.take(pair.dual, side, Math.min(25, Math.abs(pos) - hedgeThreshold + 10));
          if (result.ok) e.memo.set(`adapt:${pair.symbol}`, e.now);
        }
      }
    }
  },
};

export const STRATEGIES: StrategyDef[] = [
  dualMaker,
  pairHedger,
  dualArbitrage,
  sentimentMaker,
  momentumMaker,
  adaptiveMaker,
];

export const STRATEGY_DEFAULTS: Record<string, Record<string, number>> = Object.fromEntries(
  STRATEGIES.map((s) => [s.id, { ...s.defaults }]),
);
