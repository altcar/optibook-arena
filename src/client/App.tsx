import { useState } from 'react';
import { STOCK_PAIRS, STOCK_SYMBOLS, type StockSymbol } from '../shared/types';
import { useArena } from './useArena';
import { TopBar } from './components/TopBar';
import { StatsStrip } from './components/StatsStrip';
import { Watchlist } from './components/Watchlist';
import { InstrumentHeader } from './components/InstrumentHeader';
import { PriceChart } from './components/PriceChart';
import { OrderBook } from './components/OrderBook';
import { TradeTape } from './components/TradeTape';
import { TradeTicket, type TicketSeed } from './components/TradeTicket';
import { PositionsTable } from './components/PositionsTable';
import { OpenOrders } from './components/OpenOrders';
import { Strategies } from './components/Strategies';
import { NewsFeed } from './components/NewsFeed';
import { Toasts } from './components/Toasts';
import { Logo } from './components/Icons';

export default function App() {
  const { state, status, latency, toasts, dismissToast, actions } = useArena();
  const [activeSymbol, setActiveSymbol] = useState<StockSymbol>('NVDA');
  const [seed, setSeed] = useState<TicketSeed | null>(null);

  if (!state) {
    return (
      <div className="boot-screen">
        <Logo size={52} />
        <h1>OPTIBOOK ARENA</h1>
        <p>Booting the dual-market simulation engine…</p>
        <div className="boot-bar">
          <span />
        </div>
        <span className="boot-status">{status === 'connecting' ? 'Connecting to Durable Object' : status}</span>
      </div>
    );
  }

  const pair = STOCK_PAIRS.find((p) => p.symbol === activeSymbol) ?? STOCK_PAIRS[0];
  const stock = state.instruments.find((i) => i.id === pair.stock);
  const dual = state.instruments.find((i) => i.id === pair.dual);
  if (!stock || !dual) {
    return <div className="boot-screen">Instrument data unavailable.</div>;
  }
  const position = state.positions.find((p) => p.instrument === stock.id);

  const selectInstrument = (instrument: string) => {
    const symbol = instrument.endsWith('_DUAL') ? instrument.slice(0, -5) : instrument;
    if ((STOCK_SYMBOLS as readonly string[]).includes(symbol)) {
      setActiveSymbol(symbol as StockSymbol);
    }
    const target = state.instruments.find((i) => i.id === instrument);
    setSeed({ instrument, price: target?.mid ?? 0, nonce: Date.now() });
  };

  const selectPrice = (instrument: string, price: number) => {
    setSeed({ instrument, price, nonce: Date.now() });
  };

  const reset = () => {
    if (window.confirm('Reset the arena? All positions, P&L and news will be cleared.')) {
      void actions.reset();
    }
  };

  return (
    <div className="app-shell">
      <TopBar
        status={status}
        latency={latency}
        tick={state.stats.tick}
        uptime={state.stats.uptime}
        config={state.config}
        onSpeed={(speed) => void actions.setConfig({ speed })}
        onReset={reset}
      />

      <main className="page">
        <StatsStrip stats={state.stats} equity={state.equity} startingCash={state.startingCash} />

        <div className="terminal-grid">
          <div className="col-left">
            <Watchlist instruments={state.instruments} activeSymbol={activeSymbol} onSelect={setActiveSymbol} />
          </div>

          <div className="col-center">
            <InstrumentHeader
              stock={stock}
              dual={dual}
              position={position}
              onFocusInstrument={selectInstrument}
            />
            <PriceChart stock={stock} dual={dual} />
            <div className="book-tape-grid">
              <OrderBook stock={stock} dual={dual} onPrice={selectPrice} />
              <TradeTape trades={state.trades} stock={stock.id} dual={dual.id} />
            </div>
          </div>

          <div className="col-right">
            <TradeTicket
              instruments={state.instruments}
              stockId={stock.id}
              dualId={dual.id}
              positions={state.positions}
              positionLimit={state.positionLimit}
              seed={seed}
              onOrder={actions.placeOrder}
            />
            <PositionsTable
              positions={state.positions}
              positionLimit={state.positionLimit}
              onSelectInstrument={selectInstrument}
            />
            <OpenOrders orders={state.orders} onCancel={actions.cancelOrder} onCancelAll={actions.cancelAll} />
          </div>
        </div>

        <div className="bottom-grid">
          <Strategies
            strategies={state.strategies}
            onToggle={actions.setStrategy}
            onSaveConfig={actions.saveStrategyConfig}
          />
          <NewsFeed news={state.news} onPublish={actions.publishNews} />
        </div>

        <footer className="footer">
          <div>
            <Logo size={22} />
            <span>Optibook Arena · Cloudflare Workers + Durable Objects</span>
          </div>
          <div className="footer-links">
            <span className="badge badge-soft">SIMULATION ONLY</span>
            <a href="https://github.com/altcar/htb-optiver-challenge" target="_blank" rel="noreferrer">
              Original HTB repo
            </a>
            <a href="https://github.com/altcar/optibook-arena" target="_blank" rel="noreferrer">
              Source
            </a>
          </div>
        </footer>
      </main>

      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}
