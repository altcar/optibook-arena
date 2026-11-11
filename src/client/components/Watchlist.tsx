import { STOCK_PAIRS, type InstrumentState, type StockSymbol } from '../../shared/types';
import { fmtPct, fmtPrice, tone } from '../format';
import { Sparkline } from './Sparkline';

export function Watchlist({
  instruments,
  activeSymbol,
  onSelect,
}: {
  instruments: InstrumentState[];
  activeSymbol: StockSymbol;
  onSelect: (symbol: StockSymbol) => void;
}) {
  const byId = new Map(instruments.map((i) => [i.id, i]));

  return (
    <section className="panel watchlist">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Watchlist</h2>
          <p className="panel-sub">5 dual-listed pairs</p>
        </div>
        <span className="badge badge-soft">{STOCK_PAIRS.length} pairs</span>
      </div>

      <div className="watch-rows">
        {STOCK_PAIRS.map((pair) => {
          const stock = byId.get(pair.stock);
          const dual = byId.get(pair.dual);
          if (!stock || !dual) return null;
          const active = pair.symbol === activeSymbol;
          return (
            <button
              key={pair.symbol}
              className={`watch-row ${active ? 'active' : ''}`}
              onClick={() => onSelect(pair.symbol)}
              aria-pressed={active}
            >
              <div className="watch-main">
                <div className="watch-symbol">
                  <span className="symbol">{pair.symbol}</span>
                  {active && <span className="active-bar" />}
                </div>
                <div className="watch-name">{stock.name}</div>
              </div>
              <div className="watch-spark">
                <Sparkline data={stock.history} color={stock.changePct >= 0 ? '#22c55e' : '#f43f5e'} width={62} height={26} />
              </div>
              <div className="watch-quote">
                <span className="watch-price">{fmtPrice(stock.last)}</span>
                <span className={`watch-change ${tone(stock.changePct)}`}>{fmtPct(stock.changePct, { signed: true })}</span>
              </div>
              <div className="watch-dual">
                <span className="dual-label">DUAL</span>
                <span className="dual-price">{fmtPrice(dual.last)}</span>
                <span className={`basis-chip ${dual.basisPct >= 0 ? 'pos' : 'neg'}`}>
                  {dual.basisPct >= 0 ? '+' : ''}
                  {dual.basisPct.toFixed(3)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="watch-foot">
        <span className="pulse-dot" />
        <span>Synthetic venue · 250ms engine tick</span>
      </div>
    </section>
  );
}
