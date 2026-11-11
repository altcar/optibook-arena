import { STRATEGY_META, type PositionRow } from '../../shared/types';
import { fmtMoney, fmtPrice, fmtQty, tone } from '../format';
import { Icon } from './Icons';

const BOOK_LABELS: Record<string, string> = Object.fromEntries(
  STRATEGY_META.map((s) => [s.id, s.short]),
);

export function PositionsTable({
  positions,
  positionLimit,
  onSelectInstrument,
}: {
  positions: PositionRow[];
  positionLimit: number;
  onSelectInstrument: (instrument: string) => void;
}) {
  const open = positions.filter((p) => p.qty !== 0);
  const unrealized = open.reduce((sum, p) => sum + p.unrealized, 0);

  return (
    <section className="panel positions-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Positions</h2>
          <p className="panel-sub">Aggregate across all books</p>
        </div>
        <span className={`badge ${unrealized >= 0 ? 'badge-pos' : 'badge-neg'}`}>
          {fmtMoney(unrealized, { signed: true })}
        </span>
      </div>

      {open.length === 0 ? (
        <div className="empty-state">
          <Icon name="layers" size={18} />
          <span>No open positions yet. Strategies are warming up.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Book</th>
                <th className="num">Qty</th>
                <th className="num">Avg</th>
                <th className="num">Mark</th>
                <th className="num">Open P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {open.map((position) => {
                const utilisation = Math.min(100, (Math.abs(position.qty) / positionLimit) * 100);
                return (
                  <tr key={position.instrument} onClick={() => onSelectInstrument(position.instrument)} tabIndex={0}>
                    <td>
                      <div className="cell-book">
                        <span className={`side-marker ${position.qty >= 0 ? 'long' : 'short'}`} />
                        <span className="mono">{position.instrument}</span>
                      </div>
                      <div className="source-tags">
                        {position.sources.map((source) => (
                          <span key={source} className="source-tag">
                            {source === 'manual' ? 'You' : BOOK_LABELS[source] ?? source}
                          </span>
                        ))}
                      </div>
                      <div className="usage-bar">
                        <span style={{ width: `${utilisation}%` }} />
                      </div>
                    </td>
                    <td className={`num mono ${position.qty >= 0 ? 'pos' : 'neg'}`}>{fmtQty(position.qty)}</td>
                    <td className="num mono">{fmtPrice(position.avg)}</td>
                    <td className="num mono">{fmtPrice(position.mark)}</td>
                    <td className={`num mono ${tone(position.unrealized)}`}>
                      {fmtMoney(position.unrealized, { signed: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
