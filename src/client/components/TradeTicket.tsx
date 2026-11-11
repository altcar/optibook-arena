import { useEffect, useMemo, useState } from 'react';
import type { InstrumentState, OrderRequest, PositionRow, Side } from '../../shared/types';
import { fmtMoney, fmtPrice, fmtQty } from '../format';
import { Icon } from './Icons';

export interface TicketSeed {
  instrument: string;
  price: number;
  nonce: number;
}

export function TradeTicket({
  instruments,
  stockId,
  dualId,
  positions,
  positionLimit,
  seed,
  onOrder,
}: {
  instruments: InstrumentState[];
  stockId: string;
  dualId: string;
  positions: PositionRow[];
  positionLimit: number;
  seed: TicketSeed | null;
  onOrder: (input: OrderRequest) => Promise<unknown>;
}) {
  const byId = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);
  const [instrumentId, setInstrumentId] = useState(stockId);
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [qty, setQty] = useState(10);
  const [price, setPrice] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instrument = byId.get(instrumentId) ?? byId.get(stockId);
  const position = positions.find((p) => p.instrument === instrumentId);
  const currentQty = position?.qty ?? 0;

  useEffect(() => {
    setInstrumentId(stockId);
  }, [stockId]);

  useEffect(() => {
    if (!instrument) return;
    if (seed && seed.instrument === instrumentId) return;
    setPrice(fmtPrice(instrument.mid).replaceAll(',', ''));
  }, [instrumentId, seed?.nonce, seed?.instrument]);

  useEffect(() => {
    if (!seed) return;
    setInstrumentId(seed.instrument);
    setType('limit');
    setPrice(fmtPrice(seed.price).replaceAll(',', ''));
  }, [seed]);

  if (!instrument) return null;

  const roomBuy = Math.max(0, positionLimit - currentQty);
  const roomSell = Math.max(0, positionLimit + currentQty);
  const room = side === 'buy' ? roomBuy : roomSell;
  const limitPrice = Number(price);
  const reference = type === 'market' ? (side === 'buy' ? instrument.ask : instrument.bid) : limitPrice;
  const notional = Number.isFinite(reference) ? reference * qty : 0;
  const canSubmit = qty > 0 && qty <= room && (type === 'market' || (Number.isFinite(limitPrice) && limitPrice > 0));

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onOrder({
        instrument: instrumentId,
        side,
        qty,
        type,
        price: type === 'limit' ? Number(limitPrice.toFixed(2)) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order rejected');
    } finally {
      setSubmitting(false);
    }
  };

  const setQuantity = (value: number) => {
    setQty(Math.max(1, Math.min(room || 1, Math.round(value))));
  };

  return (
    <section className="panel ticket-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Order ticket</h2>
          <p className="panel-sub">Manual execution · separate P&amp;L book</p>
        </div>
        <span className="badge badge-soft">MANUAL</span>
      </div>

      <div className="instrument-switch">
        <button
          className={instrumentId === stockId ? 'active' : ''}
          onClick={() => setInstrumentId(stockId)}
          type="button"
        >
          {byId.get(stockId)?.symbol ?? 'Stock'}
          <span>{fmtPrice(byId.get(stockId)?.last)}</span>
        </button>
        <button
          className={instrumentId === dualId ? 'active' : ''}
          onClick={() => setInstrumentId(dualId)}
          type="button"
        >
          DUAL
          <span>{fmtPrice(byId.get(dualId)?.last)}</span>
        </button>
      </div>

      <div className="side-toggle">
        <button className={`buy ${side === 'buy' ? 'active' : ''}`} onClick={() => setSide('buy')} type="button">
          Buy
        </button>
        <button className={`sell ${side === 'sell' ? 'active' : ''}`} onClick={() => setSide('sell')} type="button">
          Sell
        </button>
      </div>

      <div className="ticket-grid">
        <label className="field">
          <span className="field-label">Quantity</span>
          <div className="stepper">
            <button type="button" onClick={() => setQuantity(qty - 5)} aria-label="Decrease quantity">
              <Icon name="minus" size={14} />
            </button>
            <input
              type="number"
              min={1}
              max={room || 1}
              step={1}
              value={qty}
              onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
            />
            <button type="button" onClick={() => setQuantity(qty + 5)} aria-label="Increase quantity">
              <Icon name="plus" size={14} />
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Order type</span>
          <select value={type} onChange={(event) => setType(event.target.value as 'limit' | 'market')}>
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </label>

        <label className={`field ${type === 'market' ? 'disabled' : ''}`}>
          <span className="field-label">Limit price</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={type === 'market' ? '' : price}
            placeholder="Market"
            disabled={type === 'market'}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">Position</span>
          <div className="field-value">
            {fmtQty(currentQty)} <span className="muted">/ ±{positionLimit}</span>
          </div>
        </div>
      </div>

      <div className="quick-qty">
        {[10, 25, 50, 100].map((value) => (
          <button key={value} type="button" onClick={() => setQuantity(value)} disabled={value > room}>
            {value}
          </button>
        ))}
        <button type="button" className="max-btn" onClick={() => setQuantity(room)} disabled={room <= 0}>
          MAX
        </button>
      </div>

      <div className="ticket-summary">
        <div>
          <span>Est. notional</span>
          <strong>{fmtMoney(notional)}</strong>
        </div>
        <div>
          <span>Room {side === 'buy' ? 'to buy' : 'to sell'}</span>
          <strong>{fmtQty(room)} sh</strong>
        </div>
        <div>
          <span>Touch</span>
          <strong>
            {fmtPrice(instrument.bid)} / {fmtPrice(instrument.ask)}
          </strong>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button
        type="button"
        className={`submit-btn ${side}`}
        onClick={submit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? 'Sending…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty} ${instrument.id.replace('_DUAL', ' dual')}`}
        <Icon name="bolt" size={15} />
      </button>

      <p className="ticket-note">
        Manual fills are attributed to the <strong>Your book</strong> ledger, separate from strategy performance.
      </p>
    </section>
  );
}
