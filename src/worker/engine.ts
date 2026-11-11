import { DurableObject } from 'cloudflare:workers';
import {
  STOCK_PAIRS,
  STOCK_SYMBOLS,
  STRATEGY_META,
  type ArenaConfig,
  type ArenaSnapshot,
  type ArenaTick,
  type InstrumentState,
  type InstrumentTick,
  type NewsItem,
  type OrderRow,
  type OrderType,
  type Side,
  type Stats,
  type StrategyInfo,
} from '../shared/types';
import { Broker, type PersistedBroker, type PlaceResult } from './broker';
import type { Env } from './env';
import { MarketSim, type SimInstrument } from './market';
import { NewsEngine } from './news';
import { STRATEGIES, STRATEGY_DEFAULTS } from './strategies';
import { clamp, roundToTick } from './rng';

const TICK_MS = 250;
const BROADCAST_EVERY = 2;
const EQUITY_LIMIT = 300;
const STARTING_CASH = 250_000;
const POSITION_LIMIT = 100;
const DEFAULT_ENABLED = new Set(STRATEGIES.map((s) => s.id));

interface StrategyState {
  enabled: boolean;
  config: Record<string, number>;
}

interface PersistedArena {
  version: 1;
  market: ReturnType<MarketSim['serialize']>;
  broker: PersistedBroker;
  news: ReturnType<NewsEngine['serialize']>;
  strategies: Record<string, StrategyState>;
  config: ArenaConfig;
  seq: number;
  equity: number[];
  startedAt: number;
}

interface PlaceBody {
  instrument?: string;
  side?: Side;
  qty?: number;
  type?: 'market' | 'limit';
  price?: number;
}

interface StrategyBody {
  id?: string;
  enabled?: boolean;
  config?: Record<string, number>;
}

interface NewsBody {
  text?: string;
  tickers?: string[];
  sentiment?: number;
}

export class ArenaEngine extends DurableObject<Env> {
  private market = new MarketSim();
  private broker = new Broker(this.market, POSITION_LIMIT);
  private news = new NewsEngine();
  private config: ArenaConfig = { speed: 1, volatility: 1 };
  private strategies = new Map<string, StrategyState>();
  private sockets = new Set<WebSocket>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private tickMs = 0;
  private startedAt = Date.now();
  private lastActivity = Date.now();
  private lastTickSentTs = 0;
  private equity: number[] = [STARTING_CASH];
  memo = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initStrategies();
    ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<PersistedArena>('arena');
      if (saved?.version === 1) this.restore(saved);
    });
  }

  private initStrategies(): void {
    this.strategies = new Map(
      STRATEGIES.map((def) => [
        def.id,
        {
          enabled: DEFAULT_ENABLED.has(def.id),
          config: { ...STRATEGY_DEFAULTS[def.id] },
        },
      ]),
    );
  }

  private restore(saved: PersistedArena): void {
    try {
      this.market = new MarketSim(saved.market);
      this.market.setConfig(saved.config);
      this.broker = new Broker(this.market, POSITION_LIMIT, saved.broker);
      this.news = new NewsEngine();
      this.news.items = saved.news?.items ?? [];
      this.news.scores = { ...this.news.scores, ...(saved.news?.scores ?? {}) };
      this.config = saved.config ?? this.config;
      this.seq = saved.seq ?? 0;
      this.equity = saved.equity?.length ? saved.equity : [STARTING_CASH];
      this.startedAt = saved.startedAt ?? Date.now();
      this.initStrategies();
      for (const [id, state] of Object.entries(saved.strategies ?? {})) {
        const current = this.strategies.get(id);
        if (!current) continue;
        current.enabled = Boolean(state.enabled);
        current.config = { ...current.config, ...(state.config ?? {}) };
      }
    } catch (error) {
      console.error('Failed to restore arena, starting fresh', error);
      this.market = new MarketSim();
      this.broker = new Broker(this.market, POSITION_LIMIT);
      this.news = new NewsEngine();
      this.initStrategies();
      this.equity = [STARTING_CASH];
    }
  }

  private startLoop(): void {
    this.lastActivity = Date.now();
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const start = performance.now();
    // Stop burning CPU if nobody has used the arena for two minutes.
    if (!this.sockets.size && Date.now() - this.lastActivity > 120_000) {
      this.stopLoop();
      void this.persist();
      return;
    }

    try {
      this.seq++;
      this.market.tick();
      this.news.tick(this.market);

      for (const def of STRATEGIES) {
        const state = this.strategies.get(def.id);
        if (!state) continue;
        if (!state.enabled) {
          this.broker.cancelAll(def.id);
          continue;
        }
        try {
          def.onTick(this);
        } catch (error) {
          console.error(`strategy ${def.id} failed`, error);
        }
      }

      this.broker.match();
      this.tickMs = performance.now() - start;

      if (this.seq % BROADCAST_EVERY === 0) {
        const stats = this.stats();
        this.equity.push(stats.equity);
        if (this.equity.length > EQUITY_LIMIT) this.equity.shift();
        this.broadcast(JSON.stringify(this.tickMessage(stats)));
        if (this.seq % 20 === 0) void this.persist();
      }
    } catch (error) {
      console.error('tick failed', error);
    }
  }

  private stats(): Stats {
    const totals = this.broker.totals();
    return {
      equity: STARTING_CASH + totals.pnl,
      pnl: totals.pnl,
      realized: totals.realized,
      unrealized: totals.unrealized,
      exposure: totals.exposure,
      fills: totals.fills,
      arbOps: this.broker.arbOps,
      tick: this.seq,
      uptime: Date.now() - this.startedAt,
      tickMs: Number(this.tickMs.toFixed(2)),
    };
  }

  private instrumentState(inst: SimInstrument): InstrumentState {
    const book = this.broker.mergeBook(inst.id);
    const bid = book.bids[0]?.price ?? inst.mid;
    const ask = book.asks[0]?.price ?? inst.mid;
    const parent = this.market.get(inst.pair);
    const basisPct =
      inst.kind === 'dual' && parent && parent.mid
        ? ((inst.mid / parent.mid - 1) * 100)
        : 0;
    return {
      id: inst.id,
      symbol: inst.symbol,
      name: inst.name,
      kind: inst.kind,
      pair: inst.pair,
      tick: inst.tick,
      last: Number(inst.last.toFixed(2)),
      prevClose: Number(inst.prevClose.toFixed(2)),
      changePct: Number(((inst.last / inst.prevClose - 1) * 100).toFixed(3)),
      bid,
      ask,
      mid: Number(inst.mid.toFixed(4)),
      fair: Number(inst.fair.toFixed(4)),
      spread: Number((ask - bid).toFixed(4)),
      basisPct: Number(basisPct.toFixed(4)),
      sentiment: Number(this.news.sentimentFor(inst.symbol).toFixed(3)),
      volatility: Number((inst.vol * 10_000).toFixed(2)),
      volume: Math.round(inst.volume),
      high: Number(inst.high.toFixed(2)),
      low: Number(inst.low.toFixed(2)),
      history: inst.history.slice(),
      book,
    };
  }

  private strategyInfos(): StrategyInfo[] {
    return STRATEGIES.map((def) => {
      const state = this.strategies.get(def.id) ?? { enabled: false, config: { ...def.defaults } };
      const info = this.broker.bookPnl(def.id);
      const stats = this.broker.bookStats(def.id);
      return {
        id: def.id,
        name: def.name,
        short: def.short,
        description: def.description,
        origin: def.origin,
        color: def.color,
        enabled: state.enabled,
        pnl: Number(info.pnl.toFixed(2)),
        realized: Number(info.realized.toFixed(2)),
        unrealized: Number(info.unrealized.toFixed(2)),
        fills: stats.fills,
        orders: stats.orders,
        netQty: info.netQty,
        exposure: Number(info.exposure.toFixed(2)),
        config: { ...state.config },
      };
    });
  }

  private allInstrumentStates(): InstrumentState[] {
    const out: InstrumentState[] = [];
    for (const pair of STOCK_PAIRS) {
      const stock = this.market.get(pair.stock);
      const dual = this.market.get(pair.dual);
      if (stock) out.push(this.instrumentState(stock));
      if (dual) out.push(this.instrumentState(dual));
    }
    return out;
  }

  private snapshot(): ArenaSnapshot {
    this.lastTickSentTs = Date.now();
    return {
      type: 'snapshot',
      seq: this.seq,
      ts: Date.now(),
      instruments: this.allInstrumentStates(),
      positions: this.broker.positions(),
      orders: this.broker.openOrders().map((o) => this.broker.publicOrder(o)),
      trades: this.broker.trades.slice(0, 100),
      news: this.news.items.slice(0, 60),
      strategies: this.strategyInfos(),
      stats: this.stats(),
      equity: this.equity.slice(),
      config: { ...this.config },
      startingCash: STARTING_CASH,
      positionLimit: POSITION_LIMIT,
    };
  }

  private tickMessage(stats: Stats): ArenaTick {
    const instruments: InstrumentTick[] = this.allInstrumentStates().map(({ history: _history, ...rest }) => rest);
    const now = Date.now();
    const trades = this.broker.trades.filter((t) => t.ts >= this.lastTickSentTs).slice(0, 80);
    const news = this.news.items.filter((n) => n.ts >= this.lastTickSentTs).slice(0, 20);
    this.lastTickSentTs = now;
    return {
      type: 'tick',
      seq: this.seq,
      ts: now,
      instruments,
      positions: this.broker.positions(),
      orders: this.broker.openOrders().map((o) => this.broker.publicOrder(o)),
      trades,
      news,
      strategies: this.strategyInfos(),
      stats,
      equityPoint: stats.equity,
    };
  }

  private broadcast(payload: string): void {
    for (const ws of [...this.sockets]) {
      try {
        if (ws.readyState !== 1) {
          this.sockets.delete(ws);
          continue;
        }
        if (ws.bufferedAmount > 1_500_000) continue;
        ws.send(payload);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  private async persist(): Promise<void> {
    const state: PersistedArena = {
      version: 1,
      market: this.market.serialize(),
      broker: this.broker.serialize(),
      news: this.news.serialize(),
      strategies: Object.fromEntries([...this.strategies.entries()].map(([id, s]) => [id, { ...s }])),
      config: { ...this.config },
      seq: this.seq,
      equity: this.equity.slice(-120),
      startedAt: this.startedAt,
    };
    try {
      await this.ctx.storage.put('arena', state);
    } catch (error) {
      console.error('persist failed', error);
    }
  }

  private reset(): void {
    this.market = new MarketSim();
    this.market.setConfig(this.config);
    this.broker = new Broker(this.market, POSITION_LIMIT);
    this.news = new NewsEngine();
    this.initStrategies();
    this.seq = 0;
    this.equity = [STARTING_CASH];
    this.startedAt = Date.now();
    this.memo.clear();
    this.lastTickSentTs = Date.now();
    void this.persist();
    const payload = JSON.stringify(this.snapshot());
    this.broadcast(payload);
  }

  // ---------------------------------------------------------------------------
  // Strategy-facing API
  // ---------------------------------------------------------------------------

  get now(): number {
    return Date.now();
  }

  sim(id: string): SimInstrument | undefined {
    return this.market.get(id);
  }

  history(id: string): number[] {
    return this.market.get(id)?.history ?? [];
  }

  position(id: string): number {
    return this.broker.aggregateQty(id);
  }

  room(id: string, side: Side): number {
    return this.broker.roomFor(id, side);
  }

  cfg(strategy: string, key: string): number {
    return this.strategies.get(strategy)?.config[key] ?? STRATEGY_DEFAULTS[strategy]?.[key] ?? 0;
  }

  sentimentFor(symbol: string): number {
    return this.news.sentimentFor(symbol);
  }

  quote(strategy: string, instrument: string, bid: number, ask: number, qty: number): void {
    const inst = this.market.get(instrument);
    if (!inst) return;
    const open = this.broker.openOrdersFor(strategy, instrument);
    const bestBid = inst.book.bids[0]?.price ?? 0;
    const bestAsk = inst.book.asks[0]?.price ?? Number.POSITIVE_INFINITY;
    const valid = bid > 0 && ask > bid && bid < bestAsk && ask > bestBid;

    for (const order of open) {
      const desired = order.side === 'buy' ? bid : ask;
      const shouldCancel =
        !valid ||
        !Number.isFinite(desired) ||
        Math.abs(order.price - desired) > inst.tick / 2 ||
        (order.side === 'buy' && bid >= bestAsk) ||
        (order.side === 'sell' && ask <= bestBid);
      if (shouldCancel) this.broker.cancel(order.id);
    }
    if (!valid) return;

    const remaining = this.broker.openOrdersFor(strategy, instrument);
    const hasBid = remaining.some((o) => o.side === 'buy');
    const hasAsk = remaining.some((o) => o.side === 'sell');
    if (!hasBid) {
      const size = Math.min(qty, this.broker.roomFor(instrument, 'buy'));
      if (size > 0) {
        this.broker.place({ book: strategy, instrument, side: 'buy', qty: size, type: 'limit', price: bid });
      }
    }
    if (!hasAsk) {
      const size = Math.min(qty, this.broker.roomFor(instrument, 'sell'));
      if (size > 0) {
        this.broker.place({ book: strategy, instrument, side: 'sell', qty: size, type: 'limit', price: ask });
      }
    }
  }

  take(strategy: string, instrument: string, side: Side, qty: number, edgeTicks = 0): PlaceResult {
    const inst = this.market.get(instrument);
    if (!inst) return { ok: false, error: 'Unknown instrument' };
    const touch = side === 'buy' ? inst.book.asks[0]?.price : inst.book.bids[0]?.price;
    if (!touch) return { ok: false, error: 'No touch price' };
    const size = Math.min(Math.floor(qty), this.broker.roomFor(instrument, side));
    if (size <= 0) return { ok: false, error: 'Position limit reached' };
    const price = roundToTick(side === 'buy' ? touch + edgeTicks * inst.tick : touch - edgeTicks * inst.tick, inst.tick);
    return this.broker.place({ book: strategy, instrument, side, qty: size, type: 'ioc', price });
  }

  recordArb(): void {
    this.broker.arbOps++;
  }

  // ---------------------------------------------------------------------------
  // HTTP / WebSocket entrypoint
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocket();
    }
    this.startLoop();
    this.lastActivity = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: this.cors() });
    }

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return this.json(this.snapshot());
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return this.json({
          ok: true,
          ...this.stats(),
          sockets: this.sockets.size,
          strategies: this.strategyInfos().map((s) => ({ id: s.id, enabled: s.enabled })),
        });
      }
      if (url.pathname === '/api/order' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as PlaceBody | null;
        if (!body?.instrument || !body.side || !body.qty || !body.type) {
          return this.json({ error: 'instrument, side, qty and type are required' }, 400);
        }
        const type: OrderType = body.type === 'market' ? 'market' : 'limit';
        const result = this.broker.place({
          book: 'manual',
          instrument: body.instrument,
          side: body.side,
          qty: body.qty,
          type,
          price: body.price,
        });
        return this.json(result, result.ok ? 200 : 400);
      }
      if (url.pathname === '/api/cancel' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as { id?: string; all?: boolean } | null;
        if (body?.all) {
          const count = this.broker.cancelAll('manual');
          return this.json({ ok: true, cancelled: count });
        }
        if (!body?.id) return this.json({ error: 'id or all is required' }, 400);
        const ok = this.broker.cancel(body.id);
        return this.json({ ok }, ok ? 200 : 400);
      }
      if (url.pathname === '/api/strategy' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as StrategyBody | null;
        const state = body?.id ? this.strategies.get(body.id) : undefined;
        if (!body?.id || !state) return this.json({ error: 'Unknown strategy' }, 400);
        if (typeof body.enabled === 'boolean') state.enabled = body.enabled;
        if (body.config) {
          const defaults = STRATEGY_DEFAULTS[body.id] ?? {};
          for (const [key, value] of Object.entries(body.config)) {
            if (key in defaults && Number.isFinite(value)) state.config[key] = Number(value);
          }
        }
        if (!state.enabled) this.broker.cancelAll(body.id);
        const info = this.strategyInfos().find((s) => s.id === body.id);
        return this.json({ ok: true, strategy: info });
      }
      if (url.pathname === '/api/news' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as NewsBody | null;
        if (!body?.text?.trim()) return this.json({ error: 'text is required' }, 400);
        const item = this.news.createManual(body.text, body.tickers ?? [], body.sentiment);
        const published = this.news.emit(item, this.market);
        this.lastTickSentTs = Math.min(this.lastTickSentTs, published.ts - 1);
        this.broadcast(JSON.stringify(this.tickMessage(this.stats())));
        return this.json({ ok: true, item: published });
      }
      if (url.pathname === '/api/config' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as Partial<ArenaConfig> | null;
        if (Number.isFinite(body?.speed)) this.config.speed = clamp(Number(body?.speed), 0.25, 4);
        if (Number.isFinite(body?.volatility)) this.config.volatility = clamp(Number(body?.volatility), 0.25, 3);
        this.market.setConfig(this.config);
        return this.json({ ok: true, config: this.config });
      }
      if (url.pathname === '/api/reset' && request.method === 'POST') {
        this.reset();
        return this.json({ ok: true });
      }
      return this.json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('api failed', error);
      return this.json({ error: 'Internal error' }, 500);
    }
  }

  private handleWebSocket(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.add(server);
    this.startLoop();
    this.lastActivity = Date.now();

    try {
      server.send(JSON.stringify(this.snapshot()));
    } catch {
      // The client will request a snapshot on reconnect.
    }

    server.addEventListener('message', (event: MessageEvent) => {
      this.lastActivity = Date.now();
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === 'ping') server.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        if (message.type === 'snapshot') server.send(JSON.stringify(this.snapshot()));
      } catch {
        // Ignore malformed client messages.
      }
    });
    const cleanup = () => {
      this.sockets.delete(server);
      this.lastActivity = Date.now();
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private cors(): HeadersInit {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...this.cors() },
    });
  }
}
