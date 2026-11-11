import type { Book, Level, OrderRow, OrderType, PositionRow, Side, TradeRow } from '../shared/types';
import type { MarketSim, SimInstrument } from './market';
import { randomInt, roundToTick, uid } from './rng';

export interface InternalOrder extends OrderRow {
  status: 'open' | 'filled' | 'cancelled';
}

interface PositionState {
  qty: number;
  avg: number;
  realized: number;
}

interface BookState {
  cash: number;
  realized: number;
  fills: number;
  orders: number;
  positions: Map<string, PositionState>;
}

export interface PlaceInput {
  book: string;
  instrument: string;
  side: Side;
  qty: number;
  type: OrderType;
  price?: number;
}

export interface PlaceResult {
  ok: boolean;
  order?: OrderRow;
  error?: string;
  filled?: number;
  avgPrice?: number;
}

export interface PersistedBroker {
  books: Record<
    string,
    {
      cash: number;
      realized: number;
      fills: number;
      orders: number;
      positions: Record<string, PositionState>;
    }
  >;
  orders: InternalOrder[];
  trades: TradeRow[];
  arbOps: number;
}

const EMPTY_BOOK = (): Book => ({ bids: [], asks: [] });

export class Broker {
  private books = new Map<string, BookState>();
  private orders = new Map<string, InternalOrder>();
  trades: TradeRow[] = [];
  arbOps = 0;

  constructor(
    private market: MarketSim,
    public positionLimit = 100,
    restore?: PersistedBroker,
  ) {
    if (restore) {
      for (const [name, value] of Object.entries(restore.books)) {
        this.books.set(name, {
          cash: value.cash,
          realized: value.realized,
          fills: value.fills,
          orders: value.orders,
          positions: new Map(Object.entries(value.positions)),
        });
      }
      for (const order of restore.orders) {
        if (order.status === 'open') this.orders.set(order.id, order);
      }
      this.trades = restore.trades ?? [];
      this.arbOps = restore.arbOps ?? 0;
    }
  }

  private book(name: string): BookState {
    let state = this.books.get(name);
    if (!state) {
      state = { cash: 0, realized: 0, fills: 0, orders: 0, positions: new Map() };
      this.books.set(name, state);
    }
    return state;
  }

  private position(name: string, instrument: string): PositionState {
    const state = this.book(name);
    let pos = state.positions.get(instrument);
    if (!pos) {
      pos = { qty: 0, avg: 0, realized: 0 };
      state.positions.set(instrument, pos);
    }
    return pos;
  }

  aggregateQty(instrument: string): number {
    let qty = 0;
    for (const state of this.books.values()) qty += state.positions.get(instrument)?.qty ?? 0;
    return qty;
  }

  strategyQty(bookName: string, instrument: string): number {
    return this.books.get(bookName)?.positions.get(instrument)?.qty ?? 0;
  }

  openOrders(): InternalOrder[] {
    return [...this.orders.values()].filter((o) => o.status === 'open').sort((a, b) => b.ts - a.ts);
  }

  openOrdersFor(bookName: string, instrument?: string): InternalOrder[] {
    return this.openOrders().filter(
      (o) => o.strategy === bookName && (instrument === undefined || o.instrument === instrument),
    );
  }

  openForInstrument(instrument: string): InternalOrder[] {
    return this.openOrders().filter((o) => o.instrument === instrument);
  }

  private projectedQty(instrument: string): number {
    let projected = this.aggregateQty(instrument);
    for (const order of this.orders.values()) {
      if (order.status !== 'open' || order.instrument !== instrument) continue;
      const remaining = order.qty - order.filled;
      projected += order.side === 'buy' ? remaining : -remaining;
    }
    return projected;
  }

  roomFor(instrument: string, side: Side): number {
    const projected = this.projectedQty(instrument);
    return Math.max(0, side === 'buy' ? this.positionLimit - projected : this.positionLimit + projected);
  }

  /** Room for converting an already-open order into a fill (its own size is not re-counted). */
  private fillRoom(instrument: string, side: Side): number {
    const qty = this.aggregateQty(instrument);
    return Math.max(0, side === 'buy' ? this.positionLimit - qty : this.positionLimit + qty);
  }

  place(input: PlaceInput): PlaceResult {
    const inst = this.market.get(input.instrument);
    if (!inst) return { ok: false, error: 'Unknown instrument' };
    const qty = Math.floor(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Quantity must be a positive whole number' };
    if (input.side !== 'buy' && input.side !== 'sell') return { ok: false, error: 'Invalid side' };
    if (this.roomFor(input.instrument, input.side) <= 0) return { ok: false, error: 'Position limit reached for this instrument' };

    const state = this.book(input.book);
    state.orders++;

    if (input.type === 'market') {
      return this.executeImmediate(input.book, inst, input.side, qty, undefined);
    }

    const limit = input.price === undefined ? undefined : roundToTick(input.price, inst.tick);
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return { ok: false, error: 'A valid limit price is required' };
    }

    if (input.type === 'ioc') {
      return this.executeImmediate(input.book, inst, input.side, qty, limit);
    }

    const bestBid = inst.book.bids[0]?.price ?? 0;
    const bestAsk = inst.book.asks[0]?.price ?? 0;
    const crosses = input.side === 'buy' ? limit >= bestAsk : limit <= bestBid;
    if (crosses) {
      const result = this.executeImmediate(input.book, inst, input.side, qty, limit);
      const filled = result.filled ?? 0;
      if (filled >= qty) return result;
      const remaining = qty - filled;
      const rest = this.restOrder(input.book, input.instrument, input.side, remaining, limit);
      if (!rest.ok) return { ...result, ok: true };
      return { ...result, order: rest.order, filled };
    }

    return this.restOrder(input.book, input.instrument, input.side, qty, limit);
  }

  private restOrder(bookName: string, instrument: string, side: Side, qty: number, price: number): PlaceResult {
    const room = this.roomFor(instrument, side);
    if (room <= 0) return { ok: false, error: 'Position limit reached for this instrument' };
    const size = Math.min(qty, room);
    const order: InternalOrder = {
      id: uid('ord_'),
      instrument,
      side,
      price,
      qty: size,
      filled: 0,
      type: 'limit',
      strategy: bookName,
      ts: Date.now(),
      status: 'open',
    };
    this.orders.set(order.id, order);
    return { ok: true, order: this.publicOrder(order) };
  }

  private executeImmediate(
    bookName: string,
    inst: SimInstrument,
    side: Side,
    qty: number,
    limit: number | undefined,
  ): PlaceResult {
    const levels = side === 'buy' ? inst.book.asks : inst.book.bids;
    let remaining = qty;
    let filled = 0;
    let notional = 0;
    const orderId = uid('mkt_');
    const levelLimit = limit ?? (side === 'buy' ? Number.POSITIVE_INFINITY : 0);

    while (remaining > 0 && levels.length) {
      const level = levels[0];
      if (side === 'buy' && level.price > levelLimit + 1e-9) break;
      if (side === 'sell' && level.price < levelLimit - 1e-9) break;
      const room = this.fillRoom(inst.id, side);
      if (room <= 0) break;
      const take = Math.min(remaining, level.size, room);
      if (take <= 0) break;
      this.executeFill(bookName, inst.id, side, level.price, take, orderId, side);
      filled += take;
      notional += take * level.price;
      remaining -= take;
      level.size -= take;
      if (level.size <= 0) levels.shift();
    }

    if (filled <= 0) return { ok: false, error: 'No liquidity at that price' };
    return {
      ok: true,
      filled,
      avgPrice: notional / filled,
      order: {
        id: orderId,
        instrument: inst.id,
        side,
        price: notional / filled,
        qty: filled,
        filled,
        type: limit === undefined ? 'market' : 'ioc',
        strategy: bookName,
        ts: Date.now(),
      },
    };
  }

  private executeFill(
    bookName: string,
    instrument: string,
    restingSide: Side,
    price: number,
    qty: number,
    orderId: string,
    aggressor: Side,
  ): void {
    const state = this.book(bookName);
    const pos = this.position(bookName, instrument);
    const signed = restingSide === 'buy' ? qty : -qty;
    const oldQty = pos.qty;
    const oldAvg = pos.avg;
    pos.qty += signed;
    state.cash -= signed * price;

    if (oldQty === 0 || Math.sign(oldQty) === Math.sign(signed)) {
      const absOld = Math.abs(oldQty);
      pos.avg = (oldAvg * absOld + price * qty) / (absOld + qty);
    } else {
      const closing = Math.min(qty, Math.abs(oldQty));
      const realized = (price - oldAvg) * closing * Math.sign(oldQty);
      pos.realized += realized;
      state.realized += realized;
      if (Math.abs(signed) > Math.abs(oldQty)) {
        pos.avg = price;
      } else if (pos.qty === 0) {
        pos.avg = 0;
      }
    }

    state.fills++;
    const order = this.orders.get(orderId);
    if (order) {
      order.filled += qty;
      if (order.filled >= order.qty) {
        order.status = 'filled';
        this.orders.delete(orderId);
      }
    }

    this.market.recordTrade(instrument, price, qty);
    this.trades.unshift({
      id: uid('trd_'),
      instrument,
      price,
      qty,
      aggressor,
      ts: Date.now(),
      own: true,
      strategies: [bookName],
    });
    if (this.trades.length > 400) this.trades.pop();
  }

  private recordSyntheticTrade(instrument: string, price: number, qty: number, aggressor: Side): void {
    this.market.recordTrade(instrument, price, qty);
    this.trades.unshift({
      id: uid('trd_'),
      instrument,
      price,
      qty,
      aggressor,
      ts: Date.now(),
      own: false,
      strategies: [],
    });
    if (this.trades.length > 400) this.trades.pop();
  }

  /** Match resting orders against the new synthetic book and generate aggressor flow. */
  match(): void {
    for (const inst of this.market.all()) {
      this.matchCrossing(inst);
      const events = Math.random() < 0.3 ? randomInt(1, 2) : 0;
      for (let i = 0; i < events; i++) {
        const side: Side = Math.random() < 0.5 ? 'buy' : 'sell';
        this.executeAggressor(inst, side, randomInt(5, 55));
      }
    }
  }

  private matchCrossing(inst: SimInstrument): void {
    const orders = this.openForInstrument(inst.id);
    for (const order of orders) {
      if (order.status !== 'open') continue;
      while (order.status === 'open') {
        const remaining = order.qty - order.filled;
        if (remaining <= 0) break;
        if (order.side === 'buy') {
          const level = inst.book.asks[0];
          if (!level || order.price < level.price) break;
          const take = Math.min(remaining, level.size, this.fillRoom(inst.id, 'buy'));
          if (take <= 0) break;
          this.executeFill(order.strategy, inst.id, 'buy', level.price, take, order.id, 'sell');
          level.size -= take;
          if (level.size <= 0) inst.book.asks.shift();
        } else {
          const level = inst.book.bids[0];
          if (!level || order.price > level.price) break;
          const take = Math.min(remaining, level.size, this.fillRoom(inst.id, 'sell'));
          if (take <= 0) break;
          this.executeFill(order.strategy, inst.id, 'sell', level.price, take, order.id, 'buy');
          level.size -= take;
          if (level.size <= 0) inst.book.bids.shift();
        }
      }
    }
  }

  private executeAggressor(inst: SimInstrument, side: Side, qty: number): void {
    let remaining = qty;
    let firstPrice = 0;
    const userOrders = this.openForInstrument(inst.id).filter((o) => o.side !== side);

    while (remaining > 0) {
      const synthetic = side === 'buy' ? inst.book.asks[0] : inst.book.bids[0];
      const user = userOrders
        .filter((o) => o.status === 'open' && o.qty - o.filled > 0)
        .sort((a, b) => (side === 'buy' ? a.price - b.price : b.price - a.price))[0];

      const userPrice = user ? user.price : undefined;
      const syntheticPrice = synthetic?.price;
      const useUser =
        userPrice !== undefined &&
        (syntheticPrice === undefined || (side === 'buy' ? userPrice <= syntheticPrice : userPrice >= syntheticPrice));

      if (!useUser && syntheticPrice === undefined) break;

      if (useUser && user) {
        const take = Math.min(remaining, user.qty - user.filled, this.fillRoom(inst.id, user.side));
        if (take <= 0) break;
        if (!firstPrice) firstPrice = user.price;
        this.executeFill(user.strategy, inst.id, user.side, user.price, take, user.id, side);
        remaining -= take;
        if (user.filled >= user.qty) user.status = 'filled';
        continue;
      }

      if (!synthetic) break;
      const take = Math.min(remaining, synthetic.size);
      if (!firstPrice) firstPrice = synthetic.price;
      this.recordSyntheticTrade(inst.id, synthetic.price, take, side);
      synthetic.size -= take;
      if (synthetic.size <= 0) {
        if (side === 'buy') inst.book.asks.shift();
        else inst.book.bids.shift();
      }
      remaining -= take;
    }

    if (firstPrice) this.market.recordTrade(inst.id, firstPrice, 0);
  }

  cancel(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'open') return false;
    order.status = 'cancelled';
    this.orders.delete(orderId);
    return true;
  }

  cancelAll(bookName?: string): number {
    let count = 0;
    for (const [id, order] of this.orders) {
      if (order.status !== 'open') continue;
      if (bookName && order.strategy !== bookName) continue;
      order.status = 'cancelled';
      this.orders.delete(id);
      count++;
    }
    return count;
  }

  cancelInstrument(bookName: string, instrument: string): void {
    for (const [id, order] of this.orders) {
      if (order.status === 'open' && order.strategy === bookName && order.instrument === instrument) {
        order.status = 'cancelled';
        this.orders.delete(id);
      }
    }
  }

  mergeBook(id: string): Book {
    const inst = this.market.get(id);
    if (!inst) return EMPTY_BOOK();
    const bids: Level[] = inst.book.bids.map((l) => ({ ...l }));
    const asks: Level[] = inst.book.asks.map((l) => ({ ...l }));
    for (const order of this.openForInstrument(id)) {
      const level = { price: order.price, size: order.qty - order.filled, own: true };
      if (order.side === 'buy') bids.push(level);
      else asks.push(level);
    }
    return { bids: this.aggregate(bids, 'desc'), asks: this.aggregate(asks, 'asc') };
  }

  private aggregate(levels: Level[], direction: 'asc' | 'desc'): Level[] {
    const sorted = [...levels].sort((a, b) => (direction === 'asc' ? a.price - b.price : b.price - a.price));
    const out: Level[] = [];
    for (const level of sorted) {
      const last = out[out.length - 1];
      const same = last && Math.abs(last.price - level.price) < 1e-9;
      if (same && last) {
        last.size += level.size;
        last.own = Boolean(last.own || level.own);
      } else {
        out.push({ ...level });
      }
    }
    return out.slice(0, 10);
  }

  positions(): PositionRow[] {
    const ids = new Set<string>();
    for (const state of this.books.values()) for (const id of state.positions.keys()) ids.add(id);
    const rows: PositionRow[] = [];
    for (const id of ids) {
      const inst = this.market.get(id);
      if (!inst) continue;
      let qty = 0;
      let cost = 0;
      let realized = 0;
      const sources: string[] = [];
      for (const [name, state] of this.books) {
        const pos = state.positions.get(id);
        if (!pos || pos.qty === 0) continue;
        qty += pos.qty;
        cost += pos.qty * pos.avg;
        realized += pos.realized;
        sources.push(name);
      }
      if (qty === 0 && Math.abs(realized) < 0.005) continue;
      const avg = qty !== 0 ? cost / qty : 0;
      rows.push({
        instrument: id,
        qty,
        avg,
        mark: inst.mid,
        unrealized: qty * (inst.mid - avg),
        realized,
        sources,
      });
    }
    return rows.sort((a, b) => Math.abs(b.qty * b.mark) - Math.abs(a.qty * a.mark));
  }

  bookPnl(bookName: string): { pnl: number; realized: number; unrealized: number; netQty: number; exposure: number } {
    const state = this.books.get(bookName);
    if (!state) return { pnl: 0, realized: 0, unrealized: 0, netQty: 0, exposure: 0 };
    let markValue = 0;
    let netQty = 0;
    let exposure = 0;
    let unrealized = 0;
    for (const [id, pos] of state.positions) {
      const mid = this.market.mid(id);
      markValue += pos.qty * mid;
      netQty += pos.qty;
      exposure += Math.abs(pos.qty * mid);
      unrealized += pos.qty * (mid - pos.avg);
    }
    return { pnl: state.cash + markValue, realized: state.realized, unrealized, netQty, exposure };
  }

  bookStats(bookName: string): { fills: number; orders: number } {
    const state = this.books.get(bookName);
    return { fills: state?.fills ?? 0, orders: state?.orders ?? 0 };
  }

  totals(): { pnl: number; realized: number; unrealized: number; exposure: number; fills: number } {
    let pnl = 0;
    let realized = 0;
    let unrealized = 0;
    let exposure = 0;
    let fills = 0;
    for (const name of this.books.keys()) {
      const info = this.bookPnl(name);
      pnl += info.pnl;
      realized += info.realized;
      unrealized += info.unrealized;
      exposure += info.exposure;
      fills += this.bookStats(name).fills;
    }
    return { pnl, realized, unrealized, exposure, fills };
  }

  publicOrder(order: InternalOrder): OrderRow {
    return {
      id: order.id,
      instrument: order.instrument,
      side: order.side,
      price: order.price,
      qty: order.qty,
      filled: order.filled,
      type: order.type,
      strategy: order.strategy,
      ts: order.ts,
    };
  }

  serialize(): PersistedBroker {
    const books: PersistedBroker['books'] = {};
    for (const [name, state] of this.books) {
      books[name] = {
        cash: state.cash,
        realized: state.realized,
        fills: state.fills,
        orders: state.orders,
        positions: Object.fromEntries(state.positions),
      };
    }
    return {
      books,
      orders: [...this.orders.values()].filter((o) => o.status === 'open'),
      trades: this.trades.slice(0, 120),
      arbOps: this.arbOps,
    };
  }
}
