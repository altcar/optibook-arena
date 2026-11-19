/**
 * Shared contracts between the Worker engine and the browser terminal.
 * Keep this file free of DOM and Worker globals.
 */

export const STOCK_SYMBOLS = ['NVDA', 'CSCO', 'ING', 'SAN', 'PFE'] as const;
export type StockSymbol = (typeof STOCK_SYMBOLS)[number];

export const INSTRUMENT_NAMES: Record<string, string> = {
  NVDA: 'NVIDIA Corp.',
  CSCO: 'Cisco Systems',
  ING: 'ING Groep',
  SAN: 'Banco Santander',
  PFE: 'Pfizer Inc.',
};

export type Side = 'buy' | 'sell';
export type InstrumentKind = 'stock' | 'dual';
export type OrderType = 'limit' | 'market' | 'ioc';

export interface Level {
  price: number;
  size: number;
  own?: boolean;
}

export interface Book {
  bids: Level[];
  asks: Level[];
}

export interface InstrumentState {
  id: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  pair: string;
  tick: number;
  last: number;
  prevClose: number;
  changePct: number;
  bid: number;
  ask: number;
  mid: number;
  fair: number;
  spread: number;
  basisPct: number;
  sentiment: number;
  volatility: number;
  volume: number;
  high: number;
  low: number;
  history: number[];
  book: Book;
}

export type InstrumentTick = Omit<InstrumentState, 'history'>;

export interface PositionRow {
  instrument: string;
  qty: number;
  avg: number;
  mark: number;
  unrealized: number;
  realized: number;
  sources: string[];
}

export interface OrderRow {
  id: string;
  instrument: string;
  side: Side;
  price: number;
  qty: number;
  filled: number;
  type: OrderType;
  strategy: string;
  ts: number;
}

export interface TradeRow {
  id: string;
  instrument: string;
  price: number;
  qty: number;
  aggressor: Side;
  ts: number;
  own?: boolean;
  strategies?: string[];
}

export interface NewsItem {
  id: string;
  ts: number;
  source: string;
  text: string;
  tickers: string[];
  sentiment: number;
  impact: number;
  manual?: boolean;
}

export interface StrategyInfo {
  id: string;
  name: string;
  short: string;
  description: string;
  origin: string;
  color: string;
  enabled: boolean;
  pnl: number;
  realized: number;
  unrealized: number;
  fills: number;
  orders: number;
  netQty: number;
  exposure: number;
  config: Record<string, number>;
}

export interface Stats {
  equity: number;
  pnl: number;
  realized: number;
  unrealized: number;
  exposure: number;
  fills: number;
  arbOps: number;
  tick: number;
  uptime: number;
  tickMs: number;
}

export interface ArenaConfig {
  speed: number;
  volatility: number;
}

export interface ArenaSnapshot {
  type: 'snapshot';
  seq: number;
  ts: number;
  instruments: InstrumentState[];
  positions: PositionRow[];
  orders: OrderRow[];
  trades: TradeRow[];
  news: NewsItem[];
  strategies: StrategyInfo[];
  stats: Stats;
  equity: number[];
  config: ArenaConfig;
  startingCash: number;
  positionLimit: number;
  viewer?: SessionUser | null;
  account?: AccountSummary;
  bots?: BotInfo[];
}

export interface ArenaTick {
  type: 'tick';
  seq: number;
  ts: number;
  instruments: InstrumentTick[];
  positions: PositionRow[];
  orders: OrderRow[];
  trades: TradeRow[];
  news: NewsItem[];
  strategies: StrategyInfo[];
  stats: Stats;
  equityPoint: number;
  viewer?: SessionUser | null;
  account?: AccountSummary;
  bots?: BotInfo[];
}

export type ServerMessage =
  | ArenaSnapshot
  | ArenaTick
  | { type: 'pong'; ts: number }
  | { type: 'reset'; ts: number };

export interface OrderRequest {
  instrument: string;
  side: Side;
  qty: number;
  type: 'market' | 'limit';
  price?: number;
  strategy?: string;
}

export interface NewsRequest {
  text: string;
  tickers?: string[];
  sentiment?: number;
}

export interface StrategyMeta {
  id: string;
  name: string;
  short: string;
  description: string;
  origin: string;
  color: string;
}

/** Presentation metadata shared by the strategy cards and the engine. */
export const STRATEGY_META: StrategyMeta[] = [
  {
    id: 'dual-mm',
    name: 'Dual Maker',
    short: 'Dual MM',
    description:
      'Quotes the five stocks around the blended stock/dual mid with inventory skew, then refreshes on drift.',
    origin: 'arbStrat1 · arbStrat2 · final_solution',
    color: '#38bdf8',
  },
  {
    id: 'hedge',
    name: 'Pair Hedger',
    short: 'Hedge',
    description:
      'Measures net delta across each stock and its dual, then flattens the pair with IOC orders once the band breaks.',
    origin: 'arbStrat2 / hedge_strategy.py',
    color: '#a78bfa',
  },
  {
    id: 'dual-arb',
    name: 'Dual Arbitrage',
    short: 'Arb',
    description:
      'Sells the rich leg and buys the cheap leg whenever the stock/dual basis clears the configured edge.',
    origin: 'strat_worky · arbStrat4 / hedge_arbitrage.py',
    color: '#f59e0b',
  },
  {
    id: 'sentiment-mm',
    name: 'News Sentiment',
    short: 'Sentiment',
    description:
      'Scores the synthetic newswire, shifts fair value per ticker, and leans quotes or takes liquidity on strong headlines.',
    origin: 'arbStrat2sentiment · arbStrat3',
    color: '#22c55e',
  },
  {
    id: 'momentum-mm',
    name: 'Momentum Maker',
    short: 'Momentum',
    description:
      'Adds a short-horizon momentum bias to the mid, widens with realised volatility, and scales size with risk.',
    origin: 'hugoarbones / momentum.py',
    color: '#f472b6',
  },
  {
    id: 'adaptive-mm',
    name: 'Adaptive Maker',
    short: 'Adaptive',
    description:
      'tanh inventory skew, spread that adapts to the live market, and smart batching hedges above a delta threshold.',
    origin: 'final_solution / controller.py',
    color: '#e2e8f0',
  },
];

export const STRATEGY_IDS = STRATEGY_META.map((s) => s.id);
export const STOCK_PAIRS: { symbol: StockSymbol; stock: string; dual: string }[] =
  STOCK_SYMBOLS.map((symbol) => ({
    symbol,
    stock: symbol,
    dual: `${symbol}_DUAL`,
  }));

export function instrumentName(id: string): string {
  const base = id.endsWith('_DUAL') ? id.slice(0, -5) : id;
  const name = INSTRUMENT_NAMES[base] ?? base;
  return id.endsWith('_DUAL') ? `${name} · Dual` : name;
}

/* ------------------------------------------------------------------------- */
/* Competition platform                                                       */
/* ------------------------------------------------------------------------- */

export type Plan = 'free' | 'pro' | 'desk';
export type Division = 'open' | 'raised';
export type BillingInterval = 'month' | 'year';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | null;
export type BotStatus = 'active' | 'paused' | 'draft';
export type BotFamily =
  | 'dual-mm'
  | 'hedge'
  | 'dual-arb'
  | 'sentiment-mm'
  | 'momentum-mm'
  | 'adaptive-mm'
  | 'custom';

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  plan: Plan;
  division: Division;
  createdAt: number;
  startingCash: number;
  subscriptionStatus: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  renewsAt: number | null;
}

export interface AccountSummary {
  userId: string;
  username: string;
  plan: Plan;
  division: Division;
  startingCash: number;
  equity: number;
  pnl: number;
  pnlPct: number;
  realized: number;
  unrealized: number;
  exposure: number;
  fills: number;
  openOrders: number;
  bots: number;
  activeBots: number;
  rank: number | null;
  subscriptionStatus: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  renewsAt: number | null;
  billingConfigured: boolean;
}

export interface BotRisk {
  maxPosition: number;
  maxGross: number;
  maxOrdersPerMin: number;
}

export type RuleField =
  | 'basisBps'
  | 'changePct'
  | 'sentiment'
  | 'momentumBps'
  | 'spreadBps'
  | 'inventory'
  | 'priceVsFairBps';

export type RuleOp = 'gt' | 'lt' | 'abs_gt';

export interface BotTrigger {
  field: RuleField;
  op: RuleOp;
  value: number;
  instrument?: string;
}

export interface BotAction {
  type: 'order' | 'pair';
  instrument?: string;
  side?: Side;
  qty?: number;
  orderType?: 'market' | 'ioc' | 'limit';
  offsetBps?: number;
  long?: string;
  short?: string;
}

export interface BotRule {
  when: BotTrigger[];
  action: BotAction;
  cooldownMs?: number;
}

export interface BotSpec {
  name: string;
  description?: string;
  family: BotFamily;
  params: Record<string, number>;
  risk: BotRisk;
  universe: StockSymbol[];
  rules?: BotRule[];
}

export interface BotRound {
  ts: number;
  pnl: number;
  trades: number;
  win: boolean;
}

export interface BotInfo {
  id: string;
  name: string;
  description: string;
  family: BotFamily;
  familyName: string;
  params: Record<string, number>;
  risk: BotRisk;
  universe: StockSymbol[];
  rules?: BotRule[];
  status: BotStatus;
  source: 'template' | 'upload' | 'custom';
  createdAt: number;
  updatedAt: number;
  pnl: number;
  realized: number;
  unrealized: number;
  fills: number;
  orders: number;
  netQty: number;
  exposure: number;
  winRate: number | null;
  rounds: BotRound[];
  trend: number[];
  rank: number | null;
  owner?: string;
  division?: Division;
}

export interface LeaderboardEntry {
  rank: number;
  botId: string;
  botName: string;
  owner: string;
  division: Division;
  seasonId: number;
  pnl: number;
  pnlPct: number;
  winRate: number;
  trades: number;
  sharpe: number;
  status: BotStatus | 'seeded';
  trend: number[];
  verified: boolean;
  isViewer: boolean;
  family: BotFamily;
}

export type SeasonStatus = 'live' | 'upcoming' | 'past';

export interface Season {
  id: number;
  name: string;
  tagline: string;
  status: SeasonStatus;
  startsAt: number;
  endsAt: number;
  prizePool: number;
  entry: string;
  description: string;
  rules: string[];
  allowedFamilies: BotFamily[];
  startingCash: number;
  positionLimit: number;
  feeBps: number;
  divisions: Division[];
}

export type TournamentStatus = 'live' | 'upcoming' | 'completed';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  format: string;
  status: TournamentStatus;
  startsAt: number;
  endsAt: number;
  prize: number;
  entry: string;
  participants: number;
  capacity: number;
  seasonId: number;
  rules: string[];
  registered: boolean;
  standings?: LeaderboardEntry[];
}

export interface ForumThreadSummary {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  authorPlan: Plan | 'staff';
  createdAt: number;
  lastAt: number;
  replies: number;
  views: number;
  likes: number;
  pinned: boolean;
  tags: string[];
}

export interface ForumPost {
  id: string;
  threadId: string;
  author: string;
  authorPlan: Plan | 'staff';
  body: string;
  createdAt: number;
  likes: number;
  staff?: boolean;
}

export interface ForumThread extends ForumThreadSummary {
  posts: ForumPost[];
}

export interface ChatMessage {
  id: string;
  userId?: string;
  username: string;
  plan: Plan | 'staff';
  body: string;
  ts: number;
  staff?: boolean;
}

export interface ChatSnapshot {
  type: 'chat_snapshot';
  messages: ChatMessage[];
  online: number;
}

export interface ChatEvent {
  type: 'chat_message' | 'chat_presence' | 'chat_error';
  message?: ChatMessage;
  online?: number;
  error?: string;
}

export interface BillingStatus {
  configured: boolean;
  plan: Plan;
  division: Division;
  subscriptionStatus: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  renewsAt: number | null;
  customer: boolean;
  portalAvailable: boolean;
}

export interface NewsletterIssue {
  id: string;
  number: number;
  title: string;
  subject: string;
  summary: string;
  publishedAt: number;
  readTime: string;
  highlights: string[];
}

export interface PlatformStats {
  traders: number;
  bots: number;
  liveBots: number;
  volume: number;
  prizePool: number;
  newsletterSubscribers: number;
  forumThreads: number;
}

export interface PlatformOverview {
  stats: PlatformStats;
  season: Season | null;
  seasons: Season[];
  leaderboard: LeaderboardEntry[];
  tournaments: Tournament[];
  newsletter: NewsletterIssue[];
  market: InstrumentTick[];
}

export interface AuthResponse {
  user: SessionUser;
  account: AccountSummary;
  token?: string;
}

export interface BotValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  spec?: BotSpec;
}

