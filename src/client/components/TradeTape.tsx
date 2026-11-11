import type { TradeRow } from '../../shared/types';
import { fmtPrice, fmtQty, fmtTime } from '../format';

export function TradeTape({ trades, stock, dual }: { trades: TradeRow[]; stock: string; dual: string }) {
  const relevant = trades.filter((t) => t.instrument === stock || t.instrument === dual).slice(0, 26);
  return (
    <section className="panel tape-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Time &amp; sales</h2>
          <p className="panel-sub">Live prints across the pair</p>
        </div>
        <span className="badge badge-soft">{relevant.length}</span>
      </div>
      <div className="tape-head">
        <span>Time</span>
        <span>Book</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="tape-rows">
        {relevant.length === 0 && <div className="empty-state">Waiting for the first print…</div>}
        {relevant.map((trade) => {
          const isDual = trade.instrument === dual;
          return (
            <div key={trade.id} className={`tape-row ${trade.aggressor === 'buy' ? 'buy-print' : 'sell-print'} ${trade.own ? 'own' : ''}`}>
              <span className="tape-time">{fmtTime(trade.ts)}</span>
              <span className={`tape-book ${isDual ? 'dual' : ''}`}>{isDual ? 'DUAL' : 'STK'}</span>
              <span className="tape-price">{fmtPrice(trade.price)}</span>
              <span className="tape-size">
                {fmtQty(trade.qty)}
                {trade.own && <span className="own-badge">YOU</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="tape-legend">
        <span>
          <span className="dot buy" /> Buy aggressor
        </span>
        <span>
          <span className="dot sell" /> Sell aggressor
        </span>
      </div>
    </section>
  );
}
