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
