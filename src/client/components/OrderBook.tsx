import { useState } from 'react';
import type { InstrumentState } from '../../shared/types';
import { fmtPrice, fmtQty } from '../format';

export function OrderBook({
  stock,
  dual,
  onPrice,
}: {
  stock: InstrumentState;
  dual: InstrumentState;
  onPrice: (instrument: string, price: number) => void;
}) {
  const [tab, setTab] = useState<'stock' | 'dual'>('stock');
  const instrument = tab === 'stock' ? stock : dual;
  const asks = instrument.book.asks.slice(0, 7).reverse();
  const bids = instrument.book.bids.slice(0, 7);
  const maxSize = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
  const spread = instrument.ask - instrument.bid;
  const spreadBps = instrument.mid ? (spread / instrument.mid) * 10_000 : 0;

  return (
    <section className="panel book-panel">
      <div className="panel-head book-head">
        <div>
          <h2 className="panel-title">Order book</h2>
          <p className="panel-sub">Synthetic depth + your working orders</p>
        </div>
        <div className="segmented small">
          <button className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>
            {stock.symbol}
          </button>
          <button className={tab === 'dual' ? 'active' : ''} onClick={() => setTab('dual')}>
            DUAL
          </button>
        </div>
      </div>

      <div className="book-columns">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <div className="book-rows">
        {asks.map((level, index) => (
          <button
            key={`a-${level.price}-${index}`}
            className={`book-row ask ${level.own ? 'own' : ''}`}
            onClick={() => onPrice(instrument.id, level.price)}
            title={`Set ${instrument.id} limit at ${fmtPrice(level.price)}`}
          >
            <span className="depth-bar" style={{ width: `${(level.size / maxSize) * 100}%` }} />
            <span className="book-price">{fmtPrice(level.price)}</span>
            <span className="book-size">{fmtQty(level.size)}</span>
            <span className="book-total">{fmtQty(level.size)}</span>
            {level.own && <span className="own-dot" title="Your order" />}
          </button>
        ))}

        <div className="book-spread">
          <span className="spread-price">{fmtPrice(instrument.mid)}</span>
          <span className="spread-meta">
            spread {fmtPrice(spread)} · {spreadBps.toFixed(1)} bps
          </span>
        </div>

        {bids.map((level, index) => (
          <button
            key={`b-${level.price}-${index}`}
            className={`book-row bid ${level.own ? 'own' : ''}`}
            onClick={() => onPrice(instrument.id, level.price)}
            title={`Set ${instrument.id} limit at ${fmtPrice(level.price)}`}
          >
            <span className="depth-bar" style={{ width: `${(level.size / maxSize) * 100}%` }} />
            <span className="book-price">{fmtPrice(level.price)}</span>
            <span className="book-size">{fmtQty(level.size)}</span>
            <span className="book-total">{fmtQty(level.size)}</span>
            {level.own && <span className="own-dot" title="Your order" />}
          </button>
        ))}
      </div>

      <div className="book-foot">
        <span>
          Last <strong>{fmtPrice(instrument.last)}</strong>
        </span>
        <span>
          Fair <strong>{fmtPrice(instrument.fair)}</strong>
        </span>
        <span className={instrument.sentiment >= 0 ? 'pos' : 'neg'}>
          Bias {instrument.sentiment.toFixed(2)}
        </span>
      </div>
    </section>
  );
}
