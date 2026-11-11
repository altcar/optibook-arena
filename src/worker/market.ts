import { STOCK_SYMBOLS, instrumentName, type Book, type NewsItem } from '../shared/types';
import { gaussian, randomInt, roundToTick } from './rng';

export interface SimInstrument {
  id: string;
  symbol: string;
  name: string;
  kind: 'stock' | 'dual';
  pair: string;
  tick: number;
  prevClose: number;
  fair: number;
  anchor: number;
  last: number;
  mid: number;
  spread: number;
  basis: number;
  basisJump: number;
  newsImpulse: number;
  vol: number;
  high: number;
  low: number;
  volume: number;
  history: number[];
  book: Book;
}

interface SeedConfig {
  symbol: string;
  price: number;
  prevClose: number;
  spread: number;
  liquidity: number;
}

const SEEDS: SeedConfig[] = [
  { symbol: 'NVDA', price: 184.62, prevClose: 182.4, spread: 0.04, liquidity: 1.0 },
  { symbol: 'CSCO', price: 48.72, prevClose: 49.1, spread: 0.03, liquidity: 1.5 },
  { symbol: 'ING', price: 14.38, prevClose: 14.52, spread: 0.02, liquidity: 2.4 },
  { symbol: 'SAN', price: 4.26, prevClose: 4.19, spread: 0.02, liquidity: 3.2 },
  { symbol: 'PFE', price: 28.54, prevClose: 28.9, spread: 0.02, liquidity: 1.9 },
];

const HISTORY_LIMIT = 360;
const BOOK_DEPTH = 7;
const TICK = 0.01;

/**
 * Simulated dual-market venue. Every stock has an independent dual listing whose
 * price is the stock fair value times a mean-reverting basis. The venue builds a
 * fresh synthetic book each tick; user and strategy orders are overlaid by the broker.
 */
export class MarketSim {
  readonly instruments = new Map<string, SimInstrument>();
  speed = 1;
  volatility = 1;

  constructor(restore?: SimInstrument[]) {
    if (restore?.length) {
      for (const inst of restore) this.instruments.set(inst.id, inst);
      return;
    }
    for (const seed of SEEDS) {
      const stock = this.createStock(seed);
      this.instruments.set(stock.id, stock);
      const dual = this.createDual(stock);
      this.instruments.set(dual.id, dual);
    }
  }

  private createStock(seed: SeedConfig): SimInstrument {
    const hist = [seed.price];
    const inst: SimInstrument = {
      id: seed.symbol,
      symbol: seed.symbol,
      name: instrumentName(seed.symbol),
      kind: 'stock',
      pair: seed.symbol,
      tick: TICK,
      prevClose: seed.prevClose,
      fair: seed.price,
      anchor: seed.price,
      last: seed.price,
      mid: seed.price,
      spread: seed.spread,
      basis: 0,
      basisJump: 0,
      newsImpulse: 0,
      vol: 0.0004,
      high: seed.price,
      low: seed.price,
      volume: randomInt(20_000, 90_000),
      history: hist,
      book: { bids: [], asks: [] },
    };
    this.buildBook(inst, seed.liquidity);
    return inst;
  }

  private createDual(stock: SimInstrument): SimInstrument {
    const basis = gaussian() * 0.0009;
    const fair = stock.fair * (1 + basis);
    const inst: SimInstrument = {
      id: `${stock.symbol}_DUAL`,
      symbol: stock.symbol,
      name: instrumentName(`${stock.symbol}_DUAL`),
      kind: 'dual',
      pair: stock.symbol,
      tick: TICK,
      prevClose: Number((stock.prevClose * (1 + basis)).toFixed(2)),
      fair,
      anchor: fair,
      last: fair,
      mid: fair,
      spread: Math.max(0.04, stock.spread * 1.25),
      basis,
      basisJump: 0,
      newsImpulse: 0,
      vol: 0.0005,
      high: fair,
      low: fair,
      volume: randomInt(8_000, 40_000),
      history: [fair],
      book: { bids: [], asks: [] },
    };
    this.buildBook(inst, 0.55);
    return inst;
  }

  get(id: string): SimInstrument | undefined {
    return this.instruments.get(id);
  }

  get stocks(): SimInstrument[] {
    return STOCK_SYMBOLS.map((s) => this.instruments.get(s)!).filter(Boolean);
  }

  all(): SimInstrument[] {
    return [...this.instruments.values()];
  }

  mid(id: string): number {
    return this.instruments.get(id)?.mid ?? 0;
  }

  bestBid(id: string): number {
    return this.instruments.get(id)?.book.bids[0]?.price ?? 0;
  }

  bestAsk(id: string): number {
    return this.instruments.get(id)?.book.asks[0]?.price ?? 0;
  }

  setConfig(config: { speed: number; volatility: number }): void {
    this.speed = config.speed;
    this.volatility = config.volatility;
  }

  tick(): void {
    const dt = 0.25 * this.speed;
    const scale = Math.sqrt(this.speed);
    for (const stock of this.stocks) {
      const shock = gaussian() * 0.00042 * scale * this.volatility;
      const microJump = Math.random() < 0.0015 ? gaussian() * 0.0022 * this.volatility : 0;
      const pull = 0.0007 * (stock.anchor - stock.fair) / Math.max(stock.fair, 0.01);
      stock.fair = Math.max(0.5, stock.fair * (1 + shock + microJump + pull + stock.newsImpulse));
      stock.newsImpulse *= Math.pow(0.9, dt / 0.25);
      stock.anchor *= 1 + gaussian() * 0.000018 * this.volatility;
      stock.vol = stock.vol * 0.95 + Math.abs(shock) * 0.05;
      stock.spread = this.spreadFor(stock);
      this.buildBook(stock, this.liquidityFor(stock.symbol));

      const dual = this.instruments.get(`${stock.symbol}_DUAL`);
      if (!dual) continue;
      const basisShock = gaussian() * 0.00075 * scale * this.volatility;
      const basisPull = -0.09 * dual.basis * (dt / 0.25);
      dual.basis += basisPull + basisShock;
      if (Math.random() < 0.007 * this.speed) {
        dual.basis += gaussian() * 0.0035 * this.volatility;
        dual.basisJump = Date.now();
      }
      dual.basis = Math.max(-0.03, Math.min(0.03, dual.basis));
      dual.fair = Math.max(0.5, stock.fair * (1 + dual.basis));
      dual.newsImpulse = stock.newsImpulse * 0.6;
      dual.vol = dual.vol * 0.95 + Math.abs(basisShock) * 0.05;
      dual.spread = this.spreadFor(dual);
      this.buildBook(dual, 0.55);
      this.pushHistory(stock);
      this.pushHistory(dual);
    }
  }

  private spreadFor(inst: SimInstrument): number {
    const volSpread = inst.fair * inst.vol * 2.2;
    const base = inst.kind === 'stock' ? Math.max(0.02, inst.fair * 0.00016) : Math.max(0.04, inst.fair * 0.00026);
    return Math.max(TICK * 2, Math.min(inst.fair * 0.004, base + volSpread));
  }

  private liquidityFor(symbol: string): number {
    return SEEDS.find((s) => s.symbol === symbol)?.liquidity ?? 1;
  }

  private pushHistory(inst: SimInstrument): void {
    inst.history.push(inst.mid);
    if (inst.history.length > HISTORY_LIMIT) inst.history.shift();
  }

  private buildBook(inst: SimInstrument, liquidity: number): void {
    const half = inst.spread / 2;
    const jitter = gaussian() * inst.tick * 0.15;
    let bestBid = roundToTick(inst.fair - half + jitter, inst.tick, 'down');
    let bestAsk = roundToTick(inst.fair + half + jitter, inst.tick, 'up');
    if (bestAsk - bestBid < inst.tick * 2) bestAsk = roundToTick(bestBid + inst.tick * 2, inst.tick, 'up');
    if (bestBid <= inst.tick) bestBid = inst.tick;

    const bids = [];
    const asks = [];
    const dualFactor = inst.kind === 'dual' ? 0.55 : 1;
    for (let level = 0; level < BOOK_DEPTH; level++) {
      const step = inst.tick * (1 + (level > 1 && Math.random() < 0.28 ? 1 : 0));
      const bidPrice = roundToTick(bestBid - level * step, inst.tick, 'down');
      const askPrice = roundToTick(bestAsk + level * step, inst.tick, 'up');
      const sizeBase = (22 + Math.random() * 95) * liquidity * dualFactor;
      const decay = 1 - level * 0.055;
      const bidSize = Math.max(1, Math.round(sizeBase * decay * (0.8 + Math.random() * 0.4)));
      const askSize = Math.max(1, Math.round(sizeBase * decay * (0.8 + Math.random() * 0.4)));
      if (bidPrice > 0) bids.push({ price: bidPrice, size: bidSize });
      asks.push({ price: askPrice, size: askSize });
    }
    inst.book = { bids, asks };
    inst.mid = (bids[0].price + asks[0].price) / 2;
  }

  recordTrade(id: string, price: number, qty: number): void {
    const inst = this.instruments.get(id);
    if (!inst || price <= 0) return;
    inst.last = price;
    inst.high = Math.max(inst.high, price);
    inst.low = Math.min(inst.low, price);
    inst.volume += Math.max(0, Math.round(qty));
  }

  applyNews(item: NewsItem): void {
    const symbols = item.tickers;
    const strength = 0.000045 + Math.min(0.00016, Math.abs(item.impact) * 0.9);
    for (const symbol of symbols) {
      const stock = this.instruments.get(symbol);
      if (!stock) continue;
      const impulse = item.sentiment * strength;
      stock.newsImpulse += impulse;
      stock.anchor *= 1 + item.sentiment * 0.00022;
      const dual = this.instruments.get(`${symbol}_DUAL`);
      if (dual) dual.newsImpulse += impulse * 0.65;
    }
    if (!symbols.length) {
      for (const inst of this.stocks) inst.newsImpulse += item.sentiment * strength * 0.12;
    }
  }

  serialize(): SimInstrument[] {
    return this.all().map((inst) => ({
      ...inst,
      book: { bids: inst.book.bids.map((l) => ({ ...l })), asks: inst.book.asks.map((l) => ({ ...l })) },
      history: [...inst.history],
    }));
  }
}
