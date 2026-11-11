import { useEffect, useRef, useState } from 'react';
import type { InstrumentState, PositionRow } from '../../shared/types';
import { fmtMoney, fmtPct, fmtPrice, fmtQty, tone } from '../format';
import { Icon } from './Icons';

function useFlash(value: number) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const previous = useRef(value);
  useEffect(() => {
    if (value > previous.current) setFlash('up');
    else if (value < previous.current) setFlash('down');
    previous.current = value;
    const timer = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(timer);
  }, [value]);
  return flash;
}

export function InstrumentHeader({
  stock,
  dual,
  position,
  onFocusInstrument,
}: {
  stock: InstrumentState;
  dual: InstrumentState;
  position: PositionRow | undefined;
  onFocusInstrument: (instrument: string) => void;
}) {
  const flash = useFlash(stock.last);
  const sentiment = stock.sentiment;
  return (
    <section className="instrument-header">
      <div className="instrument-identity">
        <div className="instrument-title-row">
          <h1>{stock.symbol}</h1>
          <span className="instrument-name">{stock.name}</span>
          <span className="badge badge-live">SIMULATED</span>
        </div>
        <div className="instrument-tags">
          <button className="tag tag-action" onClick={() => onFocusInstrument(stock.id)}>
            {stock.symbol} · stock
          </button>
          <button className="tag tag-action" onClick={() => onFocusInstrument(dual.id)}>
            {dual.symbol}_DUAL · dual
          </button>
          <span className="tag">±100 position limit</span>
        </div>
      </div>

      <div className={`last-price ${flash ?? ''}`}>
        <span className="currency">$</span>
        {fmtPrice(stock.last)}
        <span className={`change ${tone(stock.changePct)}`}>{fmtPct(stock.changePct, { signed: true })}</span>
      </div>

      <div className="quick-stats">
        <div className="quick-stat">
          <span className="quick-label">Bid / Ask</span>
          <span className="quick-value">
            <span className="buy-text">{fmtPrice(stock.bid)}</span>
            <span className="muted"> / </span>
            <span className="sell-text">{fmtPrice(stock.ask)}</span>
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Dual mid</span>
          <span className="quick-value">
            {fmtPrice(dual.mid)}
            <span className={`mini ${dual.basisPct >= 0 ? 'pos' : 'neg'}`}>
              {dual.basisPct >= 0 ? '+' : ''}
              {dual.basisPct.toFixed(3)}%
            </span>
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Your position</span>
          <span className={`quick-value ${position ? tone(position.unrealized) : ''}`}>
            {position ? `${fmtQty(position.qty)} sh` : 'Flat'}
            {position && <span className="mini">{fmtMoney(position.unrealized, { signed: true })}</span>}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Session range</span>
          <span className="quick-value small">
            {fmtPrice(stock.low)} – {fmtPrice(stock.high)}
          </span>
        </div>
        <div className="quick-stat sentiment-stat">
          <span className="quick-label">News bias</span>
          <div className="sentiment-meter" title={`Sentiment ${sentiment.toFixed(2)}`}>
            <span className="sentiment-mid" />
            <span
              className="sentiment-fill"
              style={{
                width: `${Math.min(50, Math.abs(sentiment) * 50)}%`,
                left: sentiment >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(sentiment) * 50)}%`,
                background: sentiment >= 0 ? '#22c55e' : '#f43f5e',
              }}
            />
          </div>
          <span className={`quick-value small ${tone(sentiment)}`}>{sentiment.toFixed(2)}</span>
        </div>
      </div>

      <div className="instrument-meta">
        <span>
          <Icon name="clock" size={13} /> {stock.volume.toLocaleString('en-US')} sh volume
        </span>
        <span>
          <Icon name="activity" size={13} /> vol {stock.volatility.toFixed(0)} bps
        </span>
      </div>
    </section>
  );
}
