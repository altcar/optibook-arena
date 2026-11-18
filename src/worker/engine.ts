import { DurableObject } from 'cloudflare:workers';
import {
  STOCK_PAIRS,
  STRATEGY_META,
  type AccountSummary,
  type ArenaConfig,
  type ArenaSnapshot,
  type ArenaTick,
  type BotFamily,
  type BotInfo,
  type BotSpec,
  type BotValidation,
  type Division,
  type ForumThread,
  type InstrumentState,
  type InstrumentTick,
  type LeaderboardEntry,
  type NewsItem,
  type OrderRow,
  type OrderType,
  type PlatformOverview,
  type Season,
  type SessionUser,
  type Side,
  type Stats,
  type StrategyInfo,
  type Tournament,
  type TradeRow,
} from '../shared/types';
import { Broker, ownerOf, type PersistedBroker, type PlaceResult } from './broker';
import { runBot, validateBotSpec } from './bots';
import type { Env } from './env';
import { MarketSim, type SimInstrument } from './market';
import { NewsEngine } from './news';
import {
  clearSessionCookie,
  newSession,
  parseCookies,
  sessionCookie,
  SESSION_COOKIE,
  bearerToken,
  hashPassword,
  verifyPassword,
  validateEmail,
  validatePassword,
  validateUsername,
} from './auth';
import {
  CURRENT_SEASON,
  DEFAULT_RISK,
  FAMILY_DEFAULTS,
  FAMILY_NAMES,
  NEWSLETTER_ISSUES,
  POSITION_LIMIT,
  SEASONS,
  SEEDED_BOTS,
  STARTING_CASH,
  TOURNAMENTS,
  botRecordToSpec,
  planBotLimit,
  seedPlatform,
  threadToSummary,
  toSessionUser,
  type BotRecord,
  type ForumThreadRecord,
  type PlatformState,
  type SeededLeaderboardBot,
  type UserRecord,
} from './platform';
import { STRATEGIES, STRATEGY_DEFAULTS, type StrategyContext } from './strategies';
import { clamp, roundToTick } from './rng';

const TICK_MS = 250;
const BROADCAST_EVERY = 2;
const EQUITY_LIMIT = 300;
const ROUND_TICKS = 600;
const PERSIST_EVERY = 40;

interface StrategyState {
  enabled: boolean;
  config: Record<string, number>;
}

interface PersistedArena {
  version: 2;
  market: ReturnType<MarketSim['serialize']>;
  broker: PersistedBroker;
  news: ReturnType<NewsEngine['serialize']>;
  config: ArenaConfig;
  house: Record<string, StrategyState>;
  seq: number;
  equity: number[];
  startedAt: number;
}

interface SocketClient {
  socket: WebSocket;
  userId: string | null;
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

interface RegisterBody {
  username?: string;
  email?: string;
  password?: string;
}

interface LoginBody {
  login?: string;
  password?: string;
}

interface BotBody extends BotSpec {
  spec?: BotSpec;
  source?: 'template' | 'upload' | 'custom';
}

interface ForumBody {
  title?: string;
  body?: string;
  category?: string;
  tags?: string[];
}

const FORUM_CATEGORIES = ['Announcements', 'Bot Development', 'Strategy Talk', 'Feature Requests', 'Bug Reports'];

function safeString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function sharpeOf(rounds: { pnl: number }[]): number {
  if (rounds.length < 3) return 0;
  const deltas = rounds.slice(1).map((round, index) => round.pnl - rounds[index].pnl);
  if (!deltas.length) return 0;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
  const sd = Math.sqrt(variance);
  return sd > 0 ? Number(((mean / sd) * Math.sqrt(deltas.length)).toFixed(2)) : 0;
}

export class ArenaEngine extends DurableObject<Env> {
  private market = new MarketSim();
  private broker = new Broker(this.market, POSITION_LIMIT);
  private news = new NewsEngine();
  private config: ArenaConfig = { speed: 1, volatility: 1 };
  private house = new Map<string, StrategyState>();
  private platform: PlatformState = seedPlatform();
  private sockets = new Set<SocketClient>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private tickMs = 0;
  private startedAt = Date.now();
  private lastActivity = Date.now();
  private equity: number[] = [STARTING_CASH];
  private houseMemo = new Map<string, Map<string, number>>();
  private userMemo = new Map<string, Map<string, number>>();
  private botMemo = new Map<string, Map<string, number>>();
  private loginAttempts = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;
  private ready = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initHouse();
    ctx.blockConcurrencyWhile(async () => {
      const savedArena = await this.ctx.storage.get<PersistedArena>('arena-v2');
      const legacy = savedArena
        ? null
        : await this.ctx.storage.get<{
            version?: number;
            market?: ReturnType<MarketSim['serialize']>;
            broker?: PersistedBroker;
            news?: ReturnType<NewsEngine['serialize']>;
            config?: ArenaConfig;
            seq?: number;
            equity?: number[];
            startedAt?: number;
          }>('arena');
      const savedPlatform = await this.ctx.storage.get<PlatformState>('platform-v2');
      if (savedPlatform?.version === 2) {
        this.platform = savedPlatform;
      } else {
        this.platform = seedPlatform();
      }
      if (!this.platform.users) this.platform.users = [];
      if (!this.platform.sessions) this.platform.sessions = {};
      if (!this.platform.bots) this.platform.bots = [];
      if (!this.platform.threads?.length) this.platform.threads = seedPlatform().threads;
      if (!this.platform.tournamentRegs) this.platform.tournamentRegs = {};
      if (!this.platform.equity) this.platform.equity = {};
      if (savedArena?.version === 2) {
        this.restore(savedArena);
      } else if (legacy) {
        this.restoreLegacy(legacy);
      }
      this.startLoop();
      this.ready = true;
    });
  }

  private initHouse(): void {
    this.house = new Map(
      STRATEGIES.map((def) => [
        def.id,
        { enabled: true, config: { ...STRATEGY_DEFAULTS[def.id] } },
      ]),
    );
  }

  private restore(saved: PersistedArena): void {
    try {
      this.market = new MarketSim(saved.market);
      this.market.setConfig(saved.config ?? this.config);
      this.broker = new Broker(this.market, POSITION_LIMIT, saved.broker);
      this.news = new NewsEngine();
      this.news.items = saved.news?.items ?? [];
      this.news.scores = { ...this.news.scores, ...(saved.news?.scores ?? {}) };
      this.config = saved.config ?? this.config;
      this.seq = saved.seq ?? 0;
      this.equity = saved.equity?.length ? saved.equity : [STARTING_CASH];
      this.startedAt = saved.startedAt ?? Date.now();
      this.initHouse();
      for (const [id, state] of Object.entries(saved.house ?? {})) {
        const current = this.house.get(id);
        if (!current) continue;
        current.enabled = Boolean(state.enabled);
        current.config = { ...current.config, ...(state.config ?? {}) };
      }
    } catch (error) {
      console.error('Failed to restore arena, starting fresh', error);
      this.market = new MarketSim();
      this.broker = new Broker(this.market, POSITION_LIMIT);
      this.news = new NewsEngine();
      this.initHouse();
      this.equity = [STARTING_CASH];
    }
  }

  private restoreLegacy(saved: {
    market?: ReturnType<MarketSim['serialize']>;
    broker?: PersistedBroker;
    news?: ReturnType<NewsEngine['serialize']>;
    config?: ArenaConfig;
    seq?: number;
    equity?: number[];
    startedAt?: number;
  }): void {
    try {
      if (saved.market?.length) this.market = new MarketSim(saved.market);
      if (saved.broker) this.broker = new Broker(this.market, POSITION_LIMIT, saved.broker);
      if (saved.news) {
        this.news.items = saved.news.items ?? [];
        this.news.scores = { ...this.news.scores, ...(saved.news.scores ?? {}) };
      }
      this.config = saved.config ?? this.config;
      this.market.setConfig(this.config);
      this.seq = saved.seq ?? 0;
      this.equity = saved.equity?.length ? saved.equity : [STARTING_CASH];
      this.startedAt = saved.startedAt ?? Date.now();
    } catch (error) {
      console.error('Legacy restore failed, starting fresh', error);
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
    if (!this.sockets.size && Date.now() - this.lastActivity > 120_000) {
      this.stopLoop();
      void this.persist();
      return;
    }

    try {
      this.seq++;
      this.market.tick();
      this.news.tick(this.market);

      this.runHouseStrategies();
      this.runUserStrategies();
      this.runBots();
      this.broker.match();
      this.tickMs = performance.now() - start;

      if (this.seq % BROADCAST_EVERY === 0) {
        this.pushEquity();
        this.broadcast();
      }
      if (this.seq % ROUND_TICKS === 0) this.processRounds();
      if (this.seq % PERSIST_EVERY === 0) void this.persist();
    } catch (error) {
      console.error('tick failed', error);
    }
  }

  // -------------------------------------------------------------------------
  // Strategy + bot execution
  // -------------------------------------------------------------------------

  private runHouseStrategies(): void {
    for (const def of STRATEGIES) {
      const state = this.house.get(def.id);
      if (!state?.enabled) continue;
      try {
        def.onTick(this.context(`h:${def.id}`, 'house', state.config, this.memoFor(this.houseMemo, def.id)));
      } catch (error) {
        console.error(`house strategy ${def.id} failed`, error);
      }
    }
  }

  private runUserStrategies(): void {
    for (const user of this.platform.users) {
      const enabled = STRATEGIES.filter((def) => user.strategyEnabled?.[def.id]);
      if (!enabled.length) continue;
      if ((this.seq + hash32(user.id)) % 4 !== 0) continue;
      for (const def of enabled) {
        const config = { ...(STRATEGY_DEFAULTS[def.id] ?? {}), ...(user.strategyConfig?.[def.id] ?? {}) };
        const key = `${user.id}:${def.id}`;
        try {
          def.onTick(
            this.context(`u:${user.id}:s:${def.id}`, `u:${user.id}`, config, this.memoFor(this.userMemo, key)),
          );
        } catch (error) {
          console.error(`user strategy ${key} failed`, error);
        }
      }
    }
  }

  private runBots(): void {
    for (const bot of this.platform.bots) {
      if (bot.status !== 'active') continue;
      if ((this.seq + hash32(bot.id)) % 2 !== 0) continue;
      try {
        runBot(bot, {
          market: this.market,
          broker: this.broker,
          news: this.news,
          now: Date.now(),
          tick: this.seq,
          memo: this.memoFor(this.botMemo, bot.id),
        });
      } catch (error) {
        console.error(`bot ${bot.id} failed`, error);
      }
    }
  }

  private memoFor(store: Map<string, Map<string, number>>, key: string): Map<string, number> {
    let memo = store.get(key);
    if (!memo) {
      memo = new Map();
      store.set(key, memo);
    }
    return memo;
  }

  private context(book: string, owner: string, config: Record<string, number>, memo: Map<string, number>): StrategyContext {
    return {
      now: Date.now(),
      limit: POSITION_LIMIT,
      memo,
      sim: (id) => this.market.get(id),
      history: (id) => this.market.get(id)?.history ?? [],
      position: (id) => this.broker.aggregateQty(id, owner),
      room: (id, side) => this.broker.roomFor(id, side, owner),
      cfg: (key) => config[key] ?? 0,
      sentimentFor: (symbol) => this.news.sentimentFor(symbol),
      quote: (instrument, bid, ask, qty) => this.quote(book, owner, instrument, bid, ask, qty),
      take: (instrument, side, qty, edge) => this.take(book, owner, instrument, side, qty, edge),
      recordArb: () => {
        this.broker.arbOps++;
      },
    };
  }

  private quote(book: string, owner: string, instrument: string, bid: number, ask: number, qty: number): void {
    const inst = this.market.get(instrument);
    if (!inst) return;
    const open = this.broker.openOrdersFor(book, instrument);
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
    const remaining = this.broker.openOrdersFor(book, instrument);
    if (!remaining.some((o) => o.side === 'buy')) {
      const size = Math.min(qty, this.broker.roomFor(instrument, 'buy', owner));
      if (size > 0) this.broker.place({ book, instrument, side: 'buy', qty: size, type: 'limit', price: bid });
    }
    if (!remaining.some((o) => o.side === 'sell')) {
      const size = Math.min(qty, this.broker.roomFor(instrument, 'sell', owner));
      if (size > 0) this.broker.place({ book, instrument, side: 'sell', qty: size, type: 'limit', price: ask });
    }
  }

  private take(
    book: string,
    owner: string,
    instrument: string,
    side: Side,
    qty: number,
    edgeTicks = 0,
  ): PlaceResult {
    const inst = this.market.get(instrument);
    if (!inst) return { ok: false, error: 'Unknown instrument' };
    const touch = side === 'buy' ? inst.book.asks[0]?.price : inst.book.bids[0]?.price;
    if (!touch) return { ok: false, error: 'No touch price' };
    const size = Math.min(Math.floor(qty), this.broker.roomFor(instrument, side, owner));
    if (size <= 0) return { ok: false, error: 'Position limit reached' };
    const price = roundToTick(side === 'buy' ? touch + edgeTicks * inst.tick : touch - edgeTicks * inst.tick, inst.tick);
    return this.broker.place({ book, instrument, side, qty: size, type: 'ioc', price });
  }

  // -------------------------------------------------------------------------
  // Market payloads
  // -------------------------------------------------------------------------

  private instrumentState(inst: SimInstrument, viewerOwner?: string): InstrumentState {
    const book = this.broker.mergeBook(inst.id, viewerOwner);
    const bid = book.bids[0]?.price ?? inst.mid;
    const ask = book.asks[0]?.price ?? inst.mid;
    const parent = this.market.get(inst.pair);
    const basisPct =
      inst.kind === 'dual' && parent && parent.mid ? (inst.mid / parent.mid - 1) * 100 : 0;
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

  private allInstrumentStates(owner?: string): InstrumentState[] {
    const out: InstrumentState[] = [];
    for (const pair of STOCK_PAIRS) {
      const stock = this.market.get(pair.stock);
      const dual = this.market.get(pair.dual);
      if (stock) out.push(this.instrumentState(stock, owner));
      if (dual) out.push(this.instrumentState(dual, owner));
    }
    return out;
  }

  private statsFor(owner: string, startingCash: number): Stats {
    const totals = this.broker.totals(owner);
    return {
      equity: startingCash + totals.pnl,
      pnl: totals.pnl,
      realized: totals.realized,
      unrealized: totals.unrealized,
      exposure: totals.exposure,
      fills: totals.fills,
      arbOps: owner === 'house' ? this.broker.arbOps : 0,
      tick: this.seq,
      uptime: Date.now() - this.startedAt,
      tickMs: Number(this.tickMs.toFixed(2)),
    };
  }

  private strategyInfos(owner: string, user?: UserRecord | null): StrategyInfo[] {
    return STRATEGIES.map((def) => {
      const book = owner === 'house' ? `h:${def.id}` : `u:${user?.id}:s:${def.id}`;
      const info = this.broker.bookPnl(book);
      const stats = this.broker.bookStats(book);
      const enabled = user ? Boolean(user.strategyEnabled?.[def.id]) : this.house.get(def.id)?.enabled ?? false;
      const config = user
        ? { ...(STRATEGY_DEFAULTS[def.id] ?? {}), ...(user.strategyConfig?.[def.id] ?? {}) }
        : { ...(this.house.get(def.id)?.config ?? def.defaults) };
      return {
        id: def.id,
        name: def.name,
        short: def.short,
        description: def.description,
        origin: def.origin,
        color: def.color,
        enabled,
        pnl: Number(info.pnl.toFixed(2)),
        realized: Number(info.realized.toFixed(2)),
        unrealized: Number(info.unrealized.toFixed(2)),
        fills: stats.fills,
        orders: stats.orders,
        netQty: info.netQty,
        exposure: Number(info.exposure.toFixed(2)),
        config,
      };
    });
  }

  private accountSummary(user: UserRecord): AccountSummary {
    const owner = `u:${user.id}`;
    const totals = this.broker.totals(owner);
    const bots = this.platform.bots.filter((bot) => bot.userId === user.id);
    const pnl = totals.pnl;
    const rank = this.leaderboard(CURRENT_SEASON.id, user.division, user.id).find((entry) => entry.isViewer)?.rank ?? null;
    return {
      userId: user.id,
      username: user.username,
      plan: user.plan,
      division: user.division,
      startingCash: user.startingCash,
      equity: user.startingCash + pnl,
      pnl: Number(pnl.toFixed(2)),
      pnlPct: user.startingCash ? Number(((pnl / user.startingCash) * 100).toFixed(3)) : 0,
      realized: Number(totals.realized.toFixed(2)),
      unrealized: Number(totals.unrealized.toFixed(2)),
      exposure: Number(totals.exposure.toFixed(2)),
      fills: totals.fills,
      openOrders: this.broker.openOrders(owner).length,
      bots: bots.length,
      activeBots: bots.filter((bot) => bot.status === 'active').length,
      rank,
    };
  }

  private botInfo(bot: BotRecord, viewerId?: string | null): BotInfo {
    const book = `u:${bot.userId}:bot:${bot.id}`;
    const info = this.broker.bookPnl(book);
    const stats = this.broker.bookStats(book);
    const user = this.platform.users.find((u) => u.id === bot.userId);
    const rounds = bot.rounds ?? [];
    const wins = rounds.filter((round) => round.win).length;
    const winRate = rounds.length ? Number(((wins / rounds.length) * 100).toFixed(1)) : null;
    const trend = rounds.length ? rounds.map((round) => round.pnl) : [0, Number(info.pnl.toFixed(2))];
    return {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      family: bot.family,
      familyName: FAMILY_NAMES[bot.family] ?? bot.family,
      params: { ...bot.params },
      risk: { ...bot.risk },
      universe: [...bot.universe],
      rules: bot.rules,
      status: bot.status,
      source: bot.source,
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
      pnl: Number(info.pnl.toFixed(2)),
      realized: Number(info.realized.toFixed(2)),
      unrealized: Number(info.unrealized.toFixed(2)),
      fills: stats.fills,
      orders: stats.orders,
      netQty: info.netQty,
      exposure: Number(info.exposure.toFixed(2)),
      winRate,
      rounds: rounds.slice(-20),
      trend,
      rank: null,
      owner: user?.username,
      division: user?.division,
    };
  }

  private snapshotFor(userId: string | null): ArenaSnapshot {
    return this.buildSnapshot(this.userById(userId));
  }

  private buildSnapshot(user: UserRecord | null): ArenaSnapshot {
    const owner = user ? `u:${user.id}` : 'house';
    const startingCash = user?.startingCash ?? STARTING_CASH;
    const stats = this.statsFor(owner, startingCash);
    const equity = user
      ? (this.platform.equity[user.id]?.length ? this.platform.equity[user.id] : [stats.equity])
      : this.equity;
    return {
      type: 'snapshot',
      seq: this.seq,
      ts: Date.now(),
      instruments: this.allInstrumentStates(user ? owner : undefined),
      positions: this.broker.positions(owner),
      orders: this.broker.openOrders(owner).map((order) => this.broker.publicOrder(order)),
      trades: this.broker.trades.slice(0, 100),
      news: this.news.items.slice(0, 60),
      strategies: this.strategyInfos(owner, user),
      stats,
      equity: equity.slice(-EQUITY_LIMIT),
      config: { ...this.config },
      startingCash,
      positionLimit: POSITION_LIMIT,
      viewer: user ? toSessionUser(user) : null,
      account: user ? this.accountSummary(user) : undefined,
      bots: user ? this.botsFor(user) : [],
    };
  }

  private tickMessageFor(userId: string | null): ArenaTick {
    const user = this.userById(userId);
    const owner = user ? `u:${user.id}` : 'house';
    const startingCash = user?.startingCash ?? STARTING_CASH;
    const stats = this.statsFor(owner, startingCash);
    const instruments: InstrumentTick[] = this.allInstrumentStates(user ? owner : undefined).map(
      ({ history: _history, ...rest }) => rest,
    );
    return {
      type: 'tick',
      seq: this.seq,
      ts: Date.now(),
      instruments,
      positions: this.broker.positions(owner),
      orders: this.broker.openOrders(owner).map((order) => this.broker.publicOrder(order)),
      trades: this.broker.trades.slice(0, 60),
      news: this.news.items.slice(0, 16),
      strategies: this.strategyInfos(owner, user),
      stats,
      equityPoint: stats.equity,
      viewer: user ? toSessionUser(user) : null,
      account: user ? this.accountSummary(user) : undefined,
      bots: user ? this.botsFor(user) : [],
    };
  }

  private broadcast(): void {
    for (const client of [...this.sockets]) {
      const { socket, userId } = client;
      try {
        if (socket.readyState !== 1) {
          this.sockets.delete(client);
          continue;
        }
        if (socket.bufferedAmount > 1_500_000) continue;
        socket.send(JSON.stringify(this.tickMessageFor(userId)));
      } catch {
        this.sockets.delete(client);
      }
    }
  }

  private pushEquity(): void {
    this.equity.push(STARTING_CASH + this.broker.totals('house').pnl);
    if (this.equity.length > EQUITY_LIMIT) this.equity.shift();
    for (const user of this.platform.users) {
      const owner = `u:${user.id}`;
      if (!this.broker.openOrders(owner).length && !this.broker.positions(owner).length && !user.strategyEnabled) continue;
      const curve = this.platform.equity[user.id] ?? [user.startingCash];
      curve.push(user.startingCash + this.broker.totals(owner).pnl);
      if (curve.length > EQUITY_LIMIT) curve.shift();
      this.platform.equity[user.id] = curve;
    }
  }

  private processRounds(): void {
    const now = Date.now();
    for (const bot of this.platform.bots) {
      if (bot.status !== 'active') continue;
      const pnl = this.broker.bookPnl(`u:${bot.userId}:bot:${bot.id}`).pnl;
      const delta = pnl - (bot.lastPnl ?? 0);
      const fills = this.broker.bookStats(`u:${bot.userId}:bot:${bot.id}`).fills;
      bot.rounds.push({ ts: now, pnl: Number(pnl.toFixed(2)), trades: fills, win: delta > 0.005 });
      if (bot.rounds.length > 40) bot.rounds.shift();
      bot.lastPnl = Number(pnl.toFixed(2));
    }
  }

  // -------------------------------------------------------------------------
  // Platform data
  // -------------------------------------------------------------------------

  private userById(userId: string | null): UserRecord | null {
    if (!userId) return null;
    return this.platform.users.find((user) => user.id === userId) ?? null;
  }

  private auth(request: Request): UserRecord | null {
    const cookies = parseCookies(request);
    const token = cookies[SESSION_COOKIE] ?? bearerToken(request);
    if (!token) return null;
    const session = this.platform.sessions[token];
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      delete this.platform.sessions[token];
      return null;
    }
    const user = this.userById(session.userId);
    if (user) user.lastSeen = Date.now();
    return user;
  }

  private cleanupSessions(): void {
    const now = Date.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [token, session] of Object.entries(this.platform.sessions)) {
      if (session.expiresAt < now) delete this.platform.sessions[token];
    }
  }

  private seasonById(id?: number): Season | null {
    if (!id) return CURRENT_SEASON;
    if (id === 16) {
      return {
        ...CURRENT_SEASON,
        id: 16,
        name: 'Season 16 · Maker Rebate',
        tagline: 'A maker-rebate experiment with a tighter taker fee.',
        status: 'upcoming',
        startsAt: Date.UTC(2026, 11, 21),
        endsAt: Date.UTC(2027, 1, 5),
        prizePool: 30_000,
        description: 'Season 16 introduces a maker rebate funded by a taker fee, plus a 60-share inventory cap.',
        rules: [
          'Starting paper balance: $100,000 per account.',
          'Maker fills earn a 0.5 bp rebate; taker fills pay 2 bps.',
          'Max net position: 60 shares per instrument.',
          'Custom rule bots and all six families are eligible.',
        ],
      };
    }
    return SEASONS.find((season) => season.id === id) ?? null;
  }

  private leaderboard(seasonId: number, division?: Division, viewerId?: string | null): LeaderboardEntry[] {
    const season = this.seasonById(seasonId) ?? CURRENT_SEASON;
    const entries: LeaderboardEntry[] = [];
    const scale = seasonId === CURRENT_SEASON.id ? 1 : 0.45 + ((seasonId * 37) % 55) / 100;

    for (const seed of SEEDED_BOTS) {
      if (division && seed.division !== division) continue;
      const pnl = Number((seed.pnl * scale).toFixed(2));
      entries.push({
        rank: 0,
        botId: `seed-${seed.botId}`,
        botName: seed.botName,
        owner: seed.owner,
        division: seed.division,
        seasonId,
        pnl,
        pnlPct: Number(((pnl / STARTING_CASH) * 100).toFixed(2)),
        winRate: Number((seed.winRate * (seasonId === CURRENT_SEASON.id ? 1 : 0.95)).toFixed(1)),
        trades: Math.round(seed.trades * scale),
        sharpe: Number((seed.sharpe * (seasonId === CURRENT_SEASON.id ? 1 : 0.9)).toFixed(2)),
        status: 'seeded',
        trend: seed.trend.map((value) => Number((value * scale).toFixed(2))),
        verified: true,
        isViewer: false,
        family: seed.family,
      });
    }

    if (seasonId === CURRENT_SEASON.id) {
      for (const bot of this.platform.bots) {
        if (bot.status === 'draft') continue;
        const user = this.platform.users.find((candidate) => candidate.id === bot.userId);
        if (!user) continue;
        if (division && user.division !== division) continue;
        const info = this.botInfo(bot, viewerId);
        const rounds = bot.rounds ?? [];
        const wins = rounds.filter((round) => round.win).length;
        entries.push({
          rank: 0,
          botId: bot.id,
          botName: bot.name,
          owner: user.username,
          division: user.division,
          seasonId,
          pnl: info.pnl,
          pnlPct: user.startingCash ? Number(((info.pnl / user.startingCash) * 100).toFixed(2)) : 0,
          winRate: rounds.length ? Number(((wins / rounds.length) * 100).toFixed(1)) : 0,
          trades: info.fills,
          sharpe: sharpeOf(rounds),
          status: bot.status,
          trend: info.trend,
          verified: true,
          isViewer: Boolean(viewerId && bot.userId === viewerId),
          family: bot.family,
        });
      }
    }

    entries.sort((a, b) => b.pnl - a.pnl || b.winRate - a.winRate);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    return entries;
  }

  private platformOverview(viewerId?: string | null): PlatformOverview {
    const userBots = this.platform.bots.filter((bot) => bot.status !== 'draft');
    const activeBots = this.platform.bots.filter((bot) => bot.status === 'active');
    return {
      stats: {
        traders: 1284 + this.platform.users.length,
        bots: SEEDED_BOTS.length + userBots.length,
        liveBots: SEEDED_BOTS.length + activeBots.length,
        volume: Math.round(this.market.all().reduce((total, inst) => total + inst.volume, 0)),
        prizePool: CURRENT_SEASON.prizePool,
        newsletterSubscribers: 8420 + this.platform.newsletter.length,
        forumThreads: this.platform.threads.length,
      },
      season: CURRENT_SEASON,
      seasons: SEASONS,
      leaderboard: this.leaderboard(CURRENT_SEASON.id, undefined, viewerId).slice(0, 10),
      tournaments: this.tournaments(viewerId),
      newsletter: NEWSLETTER_ISSUES,
      market: this.allInstrumentStates().map(({ history: _history, ...rest }) => rest),
    };
  }

  private tournaments(viewerId?: string | null): Tournament[] {
    return TOURNAMENTS.map((tournament) => {
      const regs = this.platform.tournamentRegs[tournament.id] ?? [];
      return {
        ...tournament,
        participants: tournament.participants + regs.length,
        registered: Boolean(viewerId && regs.includes(viewerId)),
        rules: [...tournament.rules],
      };
    });
  }

  private botsFor(user: UserRecord): BotInfo[] {
    const ranks = new Map(
      this.leaderboard(CURRENT_SEASON.id, undefined, user.id).map((entry) => [entry.botId, entry.rank]),
    );
    return this.platform.bots
      .filter((bot) => bot.userId === user.id)
      .map((bot) => ({ ...this.botInfo(bot, user.id), rank: ranks.get(bot.id) ?? null }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private async persist(): Promise<void> {
    const state: PersistedArena = {
      version: 2,
      market: this.market.serialize(),
      broker: this.broker.serialize(),
      news: this.news.serialize(),
      config: { ...this.config },
      house: Object.fromEntries([...this.house.entries()].map(([id, state]) => [id, { ...state }])),
      seq: this.seq,
      equity: this.equity.slice(-120),
      startedAt: this.startedAt,
    };
    try {
      await this.ctx.storage.put('arena-v2', state);
      await this.ctx.storage.put('platform-v2', this.platform);
    } catch (error) {
      console.error('persist failed', error);
    }
  }

  // -------------------------------------------------------------------------
  // HTTP / WebSocket
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocket(request);
    }
    this.startLoop();
    this.lastActivity = Date.now();
    this.cleanupSessions();

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: this.cors() });

    try {
      const user = this.auth(request);
      const viewerId = user?.id ?? null;

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return this.json({
          ok: true,
          ...this.statsFor('house', STARTING_CASH),
          sockets: this.sockets.size,
          users: this.platform.users.length,
          bots: this.platform.bots.length,
          strategies: this.house.size,
        });
      }
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return this.json(this.snapshotFor(viewerId));
      }

      /* ------------------------------------------------------------- auth */
      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        if (!user) return this.json({ user: null }, 200);
        return this.json({ user: toSessionUser(user), account: this.accountSummary(user) });
      }
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        return this.register(request);
      }
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return this.login(request);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = parseCookies(request)[SESSION_COOKIE] ?? bearerToken(request);
        if (token) delete this.platform.sessions[token];
        void this.persist();
        return this.json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
      }

      /* --------------------------------------------------------- public data */
      if (url.pathname === '/api/platform' && request.method === 'GET') {
        return this.json(this.platformOverview(viewerId));
      }
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const seasonId = Number(url.searchParams.get('season') ?? CURRENT_SEASON.id);
        const divisionParam = url.searchParams.get('division');
        const division = divisionParam === 'open' || divisionParam === 'raised' ? divisionParam : undefined;
        return this.json({
          season: this.seasonById(seasonId),
          division: division ?? 'all',
          entries: this.leaderboard(seasonId, division, viewerId),
        });
      }
      if (url.pathname === '/api/seasons' && request.method === 'GET') {
        return this.json({ seasons: SEASONS, current: CURRENT_SEASON });
      }
      const seasonMatch = url.pathname.match(/^\/api\/season\/(\d+)$/);
      if (seasonMatch && request.method === 'GET') {
        const id = Number(seasonMatch[1]);
        const season = this.seasonById(id);
        if (!season) return this.json({ error: 'Season not found' }, 404);
        return this.json({
          season,
          entries: this.leaderboard(id, undefined, viewerId),
          previous: SEASONS.find((candidate) => candidate.id === id - 1) ?? null,
        });
      }
      if (url.pathname === '/api/tournaments' && request.method === 'GET') {
        return this.json({ tournaments: this.tournaments(viewerId) });
      }
      const registerTournament = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/register$/);
      if (registerTournament && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to register.' }, 401);
        const tournament = TOURNAMENTS.find((entry) => entry.id === registerTournament[1]);
        if (!tournament) return this.json({ error: 'Tournament not found' }, 404);
        if (tournament.status === 'completed') return this.json({ error: 'This tournament is closed.' }, 400);
        const regs = (this.platform.tournamentRegs[tournament.id] ??= []);
        if (!regs.includes(user.id)) regs.push(user.id);
        void this.persist();
        return this.json({ ok: true, tournaments: this.tournaments(user.id) });
      }

      /* -------------------------------------------------------------- forum */
      if (url.pathname === '/api/forum' && request.method === 'GET') {
        const threads = [...this.platform.threads]
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt)
          .map(threadToSummary);
        return this.json({ threads, categories: FORUM_CATEGORIES });
      }
      if (url.pathname === '/api/forum' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to start a thread.' }, 401);
        const body = await this.readJson<ForumBody>(request);
        const title = safeString(body?.title, 120);
        const text = safeString(body?.body, 6000);
        const category = FORUM_CATEGORIES.includes(body?.category ?? '') ? body?.category! : 'Strategy Talk';
        if (title.length < 5) return this.json({ error: 'Title must be at least 5 characters.' }, 400);
        if (text.length < 10) return this.json({ error: 'Post must be at least 10 characters.' }, 400);
        const now = Date.now();
        const thread: ForumThreadRecord = {
          id: `th_${crypto.randomUUID().slice(0, 8)}`,
          title,
          category,
          author: user.username,
          authorPlan: user.plan,
          createdAt: now,
          lastAt: now,
          views: 0,
          likes: 0,
          pinned: false,
          tags: Array.isArray(body?.tags) ? body!.tags!.slice(0, 4).map((tag) => safeString(tag, 24)) : [],
          posts: [
            {
              id: `p_${crypto.randomUUID().slice(0, 8)}`,
              threadId: '',
              author: user.username,
              authorPlan: user.plan,
              body: text,
              createdAt: now,
              likes: 0,
            },
          ],
        };
        thread.posts[0].threadId = thread.id;
        this.platform.threads.unshift(thread);
        void this.persist();
        return this.json({ ok: true, thread: threadToSummary(thread) });
      }
      const threadMatch = url.pathname.match(/^\/api\/forum\/([^/]+)$/);
      if (threadMatch && request.method === 'GET') {
        const thread = this.platform.threads.find((entry) => entry.id === threadMatch[1]);
        if (!thread) return this.json({ error: 'Thread not found' }, 404);
        thread.views++;
        return this.json({ thread: threadToSummary(thread) });
      }
      const replyMatch = url.pathname.match(/^\/api\/forum\/([^/]+)\/reply$/);
      if (replyMatch && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to reply.' }, 401);
        const thread = this.platform.threads.find((entry) => entry.id === replyMatch[1]);
        if (!thread) return this.json({ error: 'Thread not found' }, 404);
        const body = await this.readJson<{ body?: string }>(request);
        const text = safeString(body?.body, 6000);
        if (text.length < 2) return this.json({ error: 'Reply is too short.' }, 400);
        const now = Date.now();
        thread.posts.push({
          id: `p_${crypto.randomUUID().slice(0, 8)}`,
          threadId: thread.id,
          author: user.username,
          authorPlan: user.plan,
          body: text,
          createdAt: now,
          likes: 0,
        });
        thread.lastAt = now;
        void this.persist();
        return this.json({ ok: true, thread: threadToSummary(thread) });
      }

      /* --------------------------------------------------------- newsletter */
      if (url.pathname === '/api/newsletter' && request.method === 'GET') {
        return this.json({
          issues: NEWSLETTER_ISSUES,
          subscribers: 8420 + this.platform.newsletter.length,
          subscribed: user ? user.newsletter : false,
        });
      }
      if (url.pathname === '/api/newsletter' && request.method === 'POST') {
        const body = await this.readJson<{ email?: string }>(request);
        const email = safeString(body?.email, 120).toLowerCase();
        const error = validateEmail(email);
        if (error) return this.json({ error }, 400);
        if (!this.platform.newsletter.includes(email)) this.platform.newsletter.push(email);
        if (user) user.newsletter = true;
        void this.persist();
        return this.json({ ok: true, subscribers: 8420 + this.platform.newsletter.length });
      }

      /* --------------------------------------------------------------- bots */
      if (url.pathname === '/api/bots/template' && request.method === 'GET') {
        return this.json({ templates: this.botTemplates() });
      }
      if (url.pathname === '/api/bots/validate' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to validate a bot.' }, 401);
        const body = await this.readJson<BotBody>(request);
        return this.json(validateBotSpec(body?.spec ?? body));
      }
      if (url.pathname === '/api/bots' && request.method === 'GET') {
        if (!user) return this.json({ error: 'Sign in to manage bots.' }, 401);
        return this.json({
          bots: this.botsFor(user),
          limit: planBotLimit(user.plan),
          plan: user.plan,
        });
      }
      if (url.pathname === '/api/bots' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to upload a bot.' }, 401);
        return this.createBot(request, user);
      }
      const botStatus = url.pathname.match(/^\/api\/bots\/([^/]+)\/status$/);
      if (botStatus && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to manage bots.' }, 401);
        const body = await this.readJson<{ status?: 'active' | 'paused' }>(request);
        const bot = this.platform.bots.find((entry) => entry.id === botStatus[1] && entry.userId === user.id);
        if (!bot) return this.json({ error: 'Bot not found' }, 404);
        if (body?.status !== 'active' && body?.status !== 'paused') return this.json({ error: 'Invalid status' }, 400);
        bot.status = body.status;
        bot.updatedAt = Date.now();
        if (body.status === 'paused') this.broker.cancelAll(`u:${user.id}:bot:${bot.id}`);
        bot.lastPnl = this.broker.bookPnl(`u:${user.id}:bot:${bot.id}`).pnl;
        this.broker.bookStats(`u:${user.id}:bot:${bot.id}`);
        void this.persist();
        return this.json({ ok: true, bot: this.botInfo(bot, user.id) });
      }
      const botMatch = url.pathname.match(/^\/api\/bots\/([^/]+)$/);
      if (botMatch && request.method === 'DELETE') {
        if (!user) return this.json({ error: 'Sign in to manage bots.' }, 401);
        const index = this.platform.bots.findIndex((entry) => entry.id === botMatch[1] && entry.userId === user.id);
        if (index < 0) return this.json({ error: 'Bot not found' }, 404);
        this.broker.cancelAll(`u:${user.id}:bot:${this.platform.bots[index].id}`);
        this.platform.bots.splice(index, 1);
        void this.persist();
        return this.json({ ok: true });
      }
      if (botMatch && request.method === 'PUT') {
        if (!user) return this.json({ error: 'Sign in to manage bots.' }, 401);
        const bot = this.platform.bots.find((entry) => entry.id === botMatch[1] && entry.userId === user.id);
        if (!bot) return this.json({ error: 'Bot not found' }, 404);
        const body = await this.readJson<BotBody>(request);
        const validation = validateBotSpec(body?.spec ?? body);
        if (!validation.ok || !validation.spec) return this.json(validation, 400);
        this.broker.cancelAll(`u:${user.id}:bot:${bot.id}`);
        Object.assign(bot, {
          name: validation.spec.name,
          description: validation.spec.description ?? '',
          family: validation.spec.family,
          params: validation.spec.params,
          risk: validation.spec.risk,
          universe: validation.spec.universe,
          rules: validation.spec.rules,
          updatedAt: Date.now(),
        });
        bot.lastPnl = this.broker.bookPnl(`u:${user.id}:bot:${bot.id}`).pnl;
        void this.persist();
        return this.json({ ok: true, bot: this.botInfo(bot, user.id), warnings: validation.warnings });
      }

      /* ------------------------------------------------------------ account */
      if (url.pathname === '/api/account/reset' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in first.' }, 401);
        const owner = `u:${user.id}`;
        this.broker.resetOwner(owner);
        this.platform.equity[user.id] = [user.startingCash];
        for (const bot of this.platform.bots.filter((entry) => entry.userId === user.id)) {
          bot.rounds = [];
          bot.lastPnl = 0;
        }
        void this.persist();
        return this.json({ ok: true, account: this.accountSummary(user) });
      }

      /* ------------------------------------------------------------- trading */
      if (url.pathname === '/api/order' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to trade.' }, 401);
        const body = await this.readJson<PlaceBody>(request);
        if (!body?.instrument || !body.side || !body.qty || !body.type) {
          return this.json({ error: 'instrument, side, qty and type are required' }, 400);
        }
        if (body.side !== 'buy' && body.side !== 'sell') return this.json({ error: 'Invalid side' }, 400);
        if (!Number.isFinite(body.qty) || body.qty <= 0 || body.qty > 100) {
          return this.json({ error: 'Quantity must be between 1 and 100.' }, 400);
        }
        const type: OrderType = body.type === 'market' ? 'market' : 'limit';
        const result = this.broker.place({
          book: `u:${user.id}:manual`,
          instrument: body.instrument,
          side: body.side,
          qty: Math.floor(body.qty),
          type,
          price: body.price,
        });
        if (result.ok) void this.persist();
        return this.json(result, result.ok ? 200 : 400);
      }
      if (url.pathname === '/api/cancel' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in first.' }, 401);
        const body = await this.readJson<{ id?: string; all?: boolean }>(request);
        if (body?.all) {
          const count = this.broker.cancelAll(`u:${user.id}:manual`);
          return this.json({ ok: true, cancelled: count });
        }
        if (!body?.id) return this.json({ error: 'id or all is required' }, 400);
        const order = this.broker.openOrders(`u:${user.id}`).find((entry) => entry.id === body.id);
        if (!order) return this.json({ ok: false, error: 'Order not found' }, 404);
        return this.json({ ok: this.broker.cancel(order.id) });
      }
      if (url.pathname === '/api/strategy' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to run strategies.' }, 401);
        const body = await this.readJson<StrategyBody>(request);
        if (!body?.id || !STRATEGY_DEFAULTS[body.id]) return this.json({ error: 'Unknown strategy' }, 400);
        if (typeof body.enabled === 'boolean') user.strategyEnabled[body.id] = body.enabled;
        if (body.config) {
          const defaults = STRATEGY_DEFAULTS[body.id] ?? {};
          const current = (user.strategyConfig[body.id] ??= { ...defaults });
          for (const [key, value] of Object.entries(body.config)) {
            if (key in defaults && Number.isFinite(value)) current[key] = Number(value);
          }
        }
        if (user.strategyEnabled[body.id] === false) this.broker.cancelAll(`u:${user.id}:s:${body.id}`);
        void this.persist();
        const info = this.strategyInfos(`u:${user.id}`, user).find((entry) => entry.id === body.id);
        return this.json({ ok: true, strategy: info });
      }
      if (url.pathname === '/api/news' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in to publish to the wire.' }, 401);
        const body = await this.readJson<NewsBody>(request);
        const text = safeString(body?.text, 240);
        if (!text) return this.json({ error: 'text is required' }, 400);
        const item = this.news.createManual(
          text,
          (body?.tickers ?? []).filter((ticker) => this.market.get(ticker)).slice(0, 5),
          body?.sentiment,
        );
        this.news.emit(item, this.market);
        this.broadcast();
        return this.json({ ok: true, item });
      }
      if (url.pathname === '/api/config' && request.method === 'POST') {
        const body = await this.readJson<Partial<ArenaConfig>>(request);
        if (Number.isFinite(body?.speed)) this.config.speed = clamp(Number(body?.speed), 0.25, 4);
        if (Number.isFinite(body?.volatility)) this.config.volatility = clamp(Number(body?.volatility), 0.25, 3);
        this.market.setConfig(this.config);
        return this.json({ ok: true, config: this.config });
      }
      if (url.pathname === '/api/reset' && request.method === 'POST') {
        if (!user) return this.json({ error: 'Sign in first.' }, 401);
        const owner = `u:${user.id}`;
        this.broker.resetOwner(owner);
        return this.json({ ok: true, account: this.accountSummary(user) });
      }

      return this.json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('api failed', error);
      const message = error instanceof Error ? error.message : 'Internal error';
      return this.json({ error: message }, 500);
    }
  }

  private botTemplates(): { family: BotFamily; name: string; spec: BotSpec }[] {
    const baseRisk = { ...DEFAULT_RISK };
    return [
      {
        family: 'dual-arb',
        name: 'Basis Hunter',
        spec: {
          name: 'Basis Hunter',
          description: 'Buys the cheap leg and sells the rich leg when the stock/dual basis clears 8 bps.',
          family: 'dual-arb',
          params: { edgeBps: 8, qty: 5 },
          risk: baseRisk,
          universe: ['NVDA', 'PFE'],
        },
      },
      {
        family: 'dual-mm',
        name: 'Dual Quoter',
        spec: {
          name: 'Dual Quoter',
          description: 'Quotes the stock around the blended stock/dual mid with inventory skew.',
          family: 'dual-mm',
          params: { spread: 0.14, qty: 8 },
          risk: baseRisk,
          universe: ['NVDA', 'CSCO'],
        },
      },
      {
        family: 'hedge',
        name: 'Pair Flattener',
        spec: {
          name: 'Pair Flattener',
          description: 'Hedges the dual leg whenever the stock/dual pair delta leaves a 30-share band.',
          family: 'hedge',
          params: { threshold: 30, qty: 12 },
          risk: { ...baseRisk, maxOrdersPerMin: 10 },
          universe: ['NVDA', 'ING'],
        },
      },
      {
        family: 'sentiment-mm',
        name: 'Headline Reactor',
        spec: {
          name: 'Headline Reactor',
          description: 'Takes liquidity when the synthetic newswire score clears ±0.4.',
          family: 'sentiment-mm',
          params: { spread: 0.16, qty: 6, takeThreshold: 0.4 },
          risk: baseRisk,
          universe: ['NVDA', 'SAN', 'PFE'],
        },
      },
      {
        family: 'momentum-mm',
        name: 'Momentum Probe',
        spec: {
          name: 'Momentum Probe',
          description: 'Trades short-horizon momentum when the 8-tick move clears 1.5 bps.',
          family: 'momentum-mm',
          params: { spread: 0.15, qty: 6, horizon: 6, bias: 0.5, thresholdBps: 1.5 },
          risk: baseRisk,
          universe: ['CSCO', 'ING'],
        },
      },
      {
        family: 'adaptive-mm',
        name: 'Adaptive Maker',
        spec: {
          name: 'Adaptive Maker',
          description: 'Adapts the spread to realised volatility and skews with tanh inventory control.',
          family: 'adaptive-mm',
          params: { baseSpread: 0.07, qty: 8, hedgeThreshold: 70 },
          risk: baseRisk,
          universe: ['NVDA', 'CSCO', 'SAN'],
        },
      },
      {
        family: 'custom',
        name: 'Custom Basis Rule',
        spec: {
          name: 'Custom Basis Rule',
          description: 'A declarative basis rule: if NVDA dual trades more than 10 bps rich, buy NVDA and sell the dual.',
          family: 'custom',
          params: { qty: 4 },
          risk: baseRisk,
          universe: ['NVDA'],
          rules: [
            {
              when: [{ field: 'basisBps', op: 'gt', value: 10, instrument: 'NVDA' }],
              action: { type: 'pair', long: 'NVDA', short: 'NVDA_DUAL', qty: 4 },
              cooldownMs: 2000,
            },
            {
              when: [{ field: 'basisBps', op: 'lt', value: -10, instrument: 'NVDA' }],
              action: { type: 'pair', long: 'NVDA_DUAL', short: 'NVDA', qty: 4 },
              cooldownMs: 2000,
            },
          ],
        },
      },
    ];
  }

  private async createBot(request: Request, user: UserRecord): Promise<Response> {
    const body = await this.readJson<BotBody>(request);
    const validation = validateBotSpec(body?.spec ?? body);
    if (!validation.ok || !validation.spec) return this.json(validation, 400);
    const existing = this.platform.bots.filter((bot) => bot.userId === user.id);
    if (existing.length >= planBotLimit(user.plan)) {
      return this.json(
        { error: `Your ${user.plan} plan allows ${planBotLimit(user.plan)} bots. Pause or delete one, or upgrade.` },
        403,
      );
    }
    if (existing.some((bot) => bot.name.toLowerCase() === validation.spec!.name.toLowerCase())) {
      return this.json({ error: 'You already have a bot with that name.' }, 400);
    }
    const spec = validation.spec;
    const now = Date.now();
    const bot: BotRecord = {
      id: `bot_${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      name: spec.name,
      description: spec.description ?? '',
      family: spec.family,
      params: spec.params,
      risk: spec.risk,
      universe: spec.universe,
      rules: spec.rules,
      status: 'active',
      source: body?.source === 'template' ? 'template' : spec.family === 'custom' ? 'upload' : 'upload',
      createdAt: now,
      updatedAt: now,
      rounds: [],
      lastPnl: 0,
      lastRoundTick: this.seq,
      lastActionAt: 0,
      actionCount: 0,
      windowStartedAt: 0,
      windowActions: 0,
    };
    this.platform.bots.push(bot);
    void this.persist();
    return this.json({ ok: true, bot: this.botInfo(bot, user.id), warnings: validation.warnings }, 201);
  }

  private async register(request: Request): Promise<Response> {
    const body = await this.readJson<RegisterBody>(request);
    const username = safeString(body?.username, 20);
    const email = safeString(body?.email, 120).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    const usernameError = validateUsername(username);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (usernameError || emailError || passwordError) {
      return this.json({ error: usernameError ?? emailError ?? passwordError }, 400);
    }
    if (this.platform.users.some((user) => user.usernameLower === username.toLowerCase())) {
      return this.json({ error: 'That username is already taken.' }, 409);
    }
    if (this.platform.users.some((user) => user.emailLower === email)) {
      return this.json({ error: 'An account with that email already exists.' }, 409);
    }
    const { hash, salt } = await hashPassword(password);
    const now = Date.now();
    const user: UserRecord = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      username,
      usernameLower: username.toLowerCase(),
      email,
      emailLower: email,
      passwordHash: hash,
      salt,
      createdAt: now,
      plan: 'free',
      division: 'open',
      startingCash: CURRENT_SEASON.startingCash,
      strategyEnabled: Object.fromEntries(STRATEGIES.map((def) => [def.id, false])),
      strategyConfig: Object.fromEntries(STRATEGIES.map((def) => [def.id, { ...def.defaults }])),
      newsletter: false,
      lastSeen: now,
      country: 'GB',
    };
    this.platform.users.push(user);
    const session = newSession(user.id);
    this.platform.sessions[session.token] = {
      userId: user.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
    void this.persist();
    const secure = new URL(request.url).protocol === 'https:';
    return this.json(
      { user: toSessionUser(user), account: this.accountSummary(user), token: session.token },
      201,
      { 'set-cookie': sessionCookie(session.token, secure) },
    );
  }

  private async login(request: Request): Promise<Response> {
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    const attempt = this.loginAttempts.get(ip);
    const now = Date.now();
    if (attempt && attempt.resetAt > now && attempt.count >= 12) {
      return this.json({ error: 'Too many sign-in attempts. Try again in a few minutes.' }, 429);
    }
    if (!attempt || attempt.resetAt < now) this.loginAttempts.set(ip, { count: 0, resetAt: now + 300_000 });
    this.loginAttempts.get(ip)!.count++;

    const body = await this.readJson<LoginBody>(request);
    const login = safeString(body?.login, 120).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    const user = this.platform.users.find(
      (candidate) => candidate.usernameLower === login || candidate.emailLower === login,
    );
    if (!user || !(await verifyPassword(password, user.passwordHash, user.salt))) {
      return this.json({ error: 'Invalid username/email or password.' }, 401);
    }
    const session = newSession(user.id);
    this.platform.sessions[session.token] = {
      userId: user.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
    user.lastSeen = now;
    void this.persist();
    const secure = new URL(request.url).protocol === 'https:';
    return this.json(
      { user: toSessionUser(user), account: this.accountSummary(user), token: session.token },
      200,
      { 'set-cookie': sessionCookie(session.token, secure) },
    );
  }

  private handleWebSocket(request: Request): Response {
    const user = this.auth(request);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const entry: SocketClient = { socket: server, userId: user?.id ?? null };
    this.sockets.add(entry);
    this.startLoop();
    this.lastActivity = Date.now();

    try {
      server.send(JSON.stringify(this.snapshotFor(entry.userId)));
    } catch {
      // The client will request a snapshot on reconnect.
    }

    server.addEventListener('message', (event: MessageEvent) => {
      this.lastActivity = Date.now();
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === 'ping') server.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        if (message.type === 'snapshot') server.send(JSON.stringify(this.snapshotFor(entry.userId)));
      } catch {
        // Ignore malformed client messages.
      }
    });
    const cleanup = () => {
      this.sockets.delete(entry);
      this.lastActivity = Date.now();
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async readJson<T>(request: Request): Promise<T | null> {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 256_000) throw new Error('Request body is too large (max 256 KB).');
    const text = await request.text();
    if (text.length > 256_000) throw new Error('Request body is too large (max 256 KB).');
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Request body must be valid JSON.');
    }
  }

  private cors(): HeadersInit {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    };
  }

  private json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...this.cors(),
        ...extra,
      },
    });
  }
}

/**
 * New Durable Object class for the multi-user platform. Deploying a new class
 * evicts the old single-desk isolate, which is required when a long-lived DO
 * would otherwise keep running pre-platform code.
 */
export class ArenaEngineV2 extends ArenaEngine {}
