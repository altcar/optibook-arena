import { STOCK_SYMBOLS, INSTRUMENT_NAMES, type NewsItem } from '../shared/types';
import { clamp, randomInt } from './rng';
import type { MarketSim } from './market';

interface Template {
  text: string;
  sentiment: number;
  source: string;
  tickers?: boolean;
}

const TEMPLATES: Template[] = [
  { text: '{name} beats quarterly expectations as demand accelerates', sentiment: 0.82, source: '@EarningsWire', tickers: true },
  { text: 'Analysts upgrade {sym} after channel checks point to stronger orders', sentiment: 0.66, source: '@AnalystDesk', tickers: true },
  { text: '{name} announces a buyback, lifting sentiment across the sector', sentiment: 0.58, source: '@CorporateWire', tickers: true },
  { text: 'Institutional flow rotates into {sym} ahead of the close', sentiment: 0.42, source: '@FlowDesk', tickers: true },
  { text: '{name} wins a multi-year supply agreement with a tier-one customer', sentiment: 0.74, source: '@IndustrySources', tickers: true },
  { text: '{sym} margin outlook improves on easing input costs', sentiment: 0.47, source: '@MarketRecap', tickers: true },
  { text: '{name} raises full-year guidance after a strong order book', sentiment: 0.7, source: '@EarningsWire', tickers: true },
  { text: 'Short interest in {sym} falls to a six-month low', sentiment: 0.36, source: '@FlowDesk', tickers: true },
  { text: '{name} warns on margins as input costs climb', sentiment: -0.76, source: '@CorporateWire', tickers: true },
  { text: 'Broker downgrades {sym}, citing slowing enterprise demand', sentiment: -0.68, source: '@AnalystDesk', tickers: true },
  { text: '{name} flags softer guidance for the next quarter', sentiment: -0.8, source: '@EarningsWire', tickers: true },
  { text: 'Supply-chain disruption hits {sym} shipments', sentiment: -0.57, source: '@IndustrySources', tickers: true },
  { text: 'Regulatory review adds uncertainty for {name}', sentiment: -0.41, source: '@PolicyWire', tickers: true },
  { text: '{sym} slides as a large holder trims its stake', sentiment: -0.52, source: '@FlowDesk', tickers: true },
  { text: '{name} loses a major contract to a competitor', sentiment: -0.72, source: '@IndustrySources', tickers: true },
  { text: 'Analysts flag inventory build at {name} ahead of results', sentiment: -0.35, source: '@AnalystDesk', tickers: true },
  { text: 'Indices rangebound as traders await the next macro print', sentiment: 0.04, source: '@MarketRecap' },
  { text: 'Sector volumes thin into the midday session', sentiment: 0.0, source: '@MarketRecap' },
  { text: '{name} presents at an industry conference; no guidance change', sentiment: 0.02, source: '@CorporateWire', tickers: true },
  { text: 'Options desks report balanced flow in {sym}', sentiment: 0.0, source: '@FlowDesk', tickers: true },
  { text: 'Market recap: breadth mixed, volatility contained', sentiment: 0.05, source: '@MarketRecap' },
  { text: '{name} confirms the previously announced timetable', sentiment: 0.0, source: '@CorporateWire', tickers: true },
  { text: '{name} and peers trade mixed after a cautious sector note', sentiment: -0.12, source: '@AnalystDesk', tickers: true },
  { text: '{sym} holds gains despite broad market softness', sentiment: 0.27, source: '@MarketRecap', tickers: true },
  { text: 'Cross-asset volatility cools as rates stabilise', sentiment: 0.14, source: '@MacroReport' },
  { text: 'Liquidity improves across the dual listings into the afternoon', sentiment: 0.08, source: '@VenueWire' },
];

const POSITIVE = ['beat', 'beats', 'upgrade', 'upgrades', 'strong', 'wins', 'raised', 'raises', 'improves', 'improved', 'buyback', 'growth', 'record', 'accelerates', 'outperform', 'higher', 'gain', 'gains', 'demand'];
const NEGATIVE = ['miss', 'misses', 'downgrade', 'downgrades', 'weak', 'warns', 'cuts', 'cut', 'loss', 'losses', 'falls', 'fall', 'slump', 'probe', 'lawsuit', 'delay', 'delays', 'disruption', 'softer', 'lower', 'risk', 'uncertainty'];

const TAG_BY_SOURCE: Record<string, string> = {
  '@EarningsWire': '#Earnings',
  '@AnalystDesk': '#AnalystRatings',
  '@CorporateWire': '#CorporateNews',
  '@IndustrySources': '#Industry',
  '@FlowDesk': '#Flows',
  '@MarketRecap': '#MarketUpdate',
  '@PolicyWire': '#Policy',
  '@MacroReport': '#Macro',
  '@VenueWire': '#Liquidity',
};

export class NewsEngine {
  items: NewsItem[] = [];
  scores: Record<string, number> = Object.fromEntries(STOCK_SYMBOLS.map((s) => [s, 0]));

  tick(market: MarketSim): void {
    for (const symbol of STOCK_SYMBOLS) {
      this.scores[symbol] = clamp((this.scores[symbol] ?? 0) * 0.986, -1, 1);
    }
    // Roughly one headline every 5-7 seconds at 1x speed.
    if (Math.random() < 0.055 * market.speed) {
      this.emit(this.generate(), market);
    }
  }

  private generate(): NewsItem {
    const template = TEMPLATES[randomInt(0, TEMPLATES.length - 1)];
    const symbol = STOCK_SYMBOLS[randomInt(0, STOCK_SYMBOLS.length - 1)];
    const name = INSTRUMENT_NAMES[symbol] ?? symbol;
    let text = template.text.replaceAll('{sym}', symbol).replaceAll('{name}', name);
    if (Math.random() < 0.62) text += ` ${TAG_BY_SOURCE[template.source] ?? '#Markets'}`;
    const sentiment = clamp(template.sentiment + (Math.random() - 0.5) * 0.14, -1, 1);
    const tickers = template.tickers ? [symbol] : [];
    return {
      id: crypto.randomUUID(),
      ts: Date.now(),
      source: template.source,
      text,
      tickers,
      sentiment: Number(sentiment.toFixed(3)),
      impact: Number((0.00006 + Math.random() * 0.00013).toFixed(7)),
    };
  }

  createManual(text: string, tickers: string[] = [], sentiment?: number): NewsItem {
    const trimmed = text.trim().slice(0, 420);
    const detected = this.detectTickers(trimmed);
    const finalTickers = (tickers.length ? tickers : detected)
      .map((t) => (t.endsWith('_DUAL') ? t.slice(0, -5) : t.toUpperCase()))
      .filter((t) => (STOCK_SYMBOLS as readonly string[]).includes(t));
    const unique = [...new Set(finalTickers)];
    const score = sentiment === undefined ? this.lexiconScore(trimmed) : clamp(sentiment, -1, 1);
    return {
      id: crypto.randomUUID(),
      ts: Date.now(),
      source: '@You · Arena Wire',
      text: trimmed || 'Untitled market note',
      tickers: unique,
      sentiment: Number(score.toFixed(3)),
      impact: Number((0.00012 + Math.abs(score) * 0.00012).toFixed(7)),
      manual: true,
    };
  }

  detectTickers(text: string): string[] {
    const upper = text.toUpperCase();
    const found: string[] = [];
    for (const symbol of STOCK_SYMBOLS) {
      const name = (INSTRUMENT_NAMES[symbol] ?? '').toUpperCase();
      const nameHit = name.length > 4 && upper.includes(name);
      if (new RegExp(`\\b${symbol}\\b`).test(upper) || nameHit) found.push(symbol);
    }
    return found;
  }

  lexiconScore(text: string): number {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    let pos = 0;
    let neg = 0;
    for (const word of words) {
      if (POSITIVE.includes(word)) pos++;
      if (NEGATIVE.includes(word)) neg++;
    }
    if (!pos && !neg) return 0;
    return clamp((pos - neg) / Math.max(3, pos + neg), -0.9, 0.9);
  }

  emit(item: NewsItem, market: MarketSim): NewsItem {
    this.items.unshift(item);
    if (this.items.length > 80) this.items.pop();
    for (const symbol of item.tickers) {
      this.scores[symbol] = clamp((this.scores[symbol] ?? 0) * 0.55 + item.sentiment * 0.85, -1, 1);
    }
    market.applyNews(item);
    return item;
  }

  sentimentFor(symbol: string): number {
    return this.scores[symbol] ?? 0;
  }

  serialize() {
    return { items: this.items, scores: this.scores };
  }
}
