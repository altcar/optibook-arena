import { useEffect, useState } from 'react';
import { STOCK_PAIRS, STOCK_SYMBOLS, type BotInfo, type StockSymbol } from '../../shared/types';
import { api, errorMessage, formatUsd } from '../api';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';
import { useArena } from '../useArena';
import { TopBar } from '../components/TopBar';
import { StatsStrip } from '../components/StatsStrip';
import { Watchlist } from '../components/Watchlist';
import { InstrumentHeader } from '../components/InstrumentHeader';
import { PriceChart } from '../components/PriceChart';
import { OrderBook } from '../components/OrderBook';
import { TradeTape } from '../components/TradeTape';
import { TradeTicket, type TicketSeed } from '../components/TradeTicket';
import { PositionsTable } from '../components/PositionsTable';
import { OpenOrders } from '../components/OpenOrders';
import { Strategies } from '../components/Strategies';
import { NewsFeed } from '../components/NewsFeed';
import { Toasts } from '../components/Toasts';
import { Icon, Logo } from '../components/Icons';

function BotMiniCard({ bot, onChange }: { bot: BotInfo; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/api/bots/${bot.id}/status`, {
        method: 'POST',
        body: { status: bot.status === 'active' ? 'paused' : 'active' },
      });
      onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bot-mini">
      <div className="bot-mini-head">
        <span className={`bot-state ${bot.status}`} />
        <strong>{bot.name}</strong>
        <span className={`mono ${bot.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(bot.pnl, { signed: true, compact: true })}</span>
      </div>
      <div className="bot-mini-meta">
        <span>{bot.familyName}</span>
        <span>{bot.fills} fills</span>
        <span>{bot.winRate === null ? 'no rounds' : `${bot.winRate}% win`}</span>
      </div>
      <div className="bot-mini-actions">
        <button className="btn btn-ghost btn-xs" onClick={toggle} disabled={busy}>
          <Icon name={bot.status === 'active' ? 'pause' : 'play'} size={12} />
          {bot.status === 'active' ? 'Pause' : 'Resume'}
        </button>
        <Link to="/bots" className="text-link">
          Manage
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout, refresh } = useAuth();
  const { state, status, latency, toasts, toast, dismissToast, actions } = useArena();
  const [activeSymbol, setActiveSymbol] = useState<StockSymbol>('NVDA');
  const [seed, setSeed] = useState<TicketSeed | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      toast('Subscription active. Welcome to the paid arena — your plan will update as Stripe confirms.', 'success');
      void refresh();
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [refresh, toast]);

  if (!state) {
    return (
      <div className="boot-screen">
        <Logo size={52} />
        <h1>OPTIBOOK ARENA</h1>
        <p>Booting your paper-trading terminal…</p>
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
  if (!stock || !dual) return <div className="boot-screen">Instrument data unavailable.</div>;
  const position = state.positions.find((p) => p.instrument === stock.id);
  const account = state.account;
  const bots = state.bots ?? [];

  const selectInstrument = (instrument: string) => {
    const symbol = instrument.endsWith('_DUAL') ? instrument.slice(0, -5) : instrument;
    if ((STOCK_SYMBOLS as readonly string[]).includes(symbol)) setActiveSymbol(symbol as StockSymbol);
    const target = state.instruments.find((i) => i.id === instrument);
    setSeed({ instrument, price: target?.mid ?? 0, nonce: Date.now() });
  };
  const selectPrice = (instrument: string, price: number) => setSeed({ instrument, price, nonce: Date.now() });

  const reset = () => {
    if (window.confirm('Reset your paper account? Positions, P&L, bot rounds and open orders will be cleared.')) {
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
        username={user?.username}
        onSpeed={(speed) => void actions.setConfig({ speed })}
        onReset={reset}
      />

      <main className="page">
        <section className="account-banner" id="account">
          <div className="account-main">
            <span className="avatar">{user?.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <span className="account-kicker">
                {account?.division ?? 'open'} division · {account?.plan ?? 'free'} plan
                {account?.subscriptionStatus ? ` · ${account.subscriptionStatus}` : ''}
              </span>
              <h2>{user?.username}</h2>
            </div>
            {account?.rank && <span className="account-rank">#{account.rank} on the board</span>}
          </div>
          <div className="account-metrics">
            <span>
              <em>Equity</em>
              <strong>{formatUsd(account?.equity ?? state.startingCash)}</strong>
            </span>
            <span>
              <em>Net P&L</em>
              <strong className={(account?.pnl ?? 0) >= 0 ? 'pos' : 'neg'}>
                {formatUsd(account?.pnl ?? 0, { signed: true })}
              </strong>
            </span>
            <span>
              <em>Bots</em>
              <strong>
                {account?.activeBots ?? 0}/{account?.bots ?? 0} live
              </strong>
            </span>
            <span>
              <em>Open orders</em>
              <strong>{account?.openOrders ?? 0}</strong>
            </span>
          </div>
          <div className="account-actions">
            <Link to="/bots" className="btn btn-primary btn-sm">
              <Icon name="plus" size={13} /> Deploy a bot
            </Link>
            <Link to="/pricing#billing" className="btn btn-outline btn-sm">
              Billing
            </Link>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void logout().then(() => navigate('/'));
              }}
            >
              Sign out
            </button>
          </div>
        </section>

        <StatsStrip stats={state.stats} equity={state.equity} startingCash={state.startingCash} />

        <div className="terminal-grid">
          <div className="col-left">
            <Watchlist instruments={state.instruments} activeSymbol={activeSymbol} onSelect={setActiveSymbol} />
          </div>

          <div className="col-center">
            <InstrumentHeader stock={stock} dual={dual} position={position} onFocusInstrument={selectInstrument} />
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

        <section className="dashboard-bots">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">AUTOMATION</span>
              <h3>Your bots</h3>
            </div>
            <div className="panel-head-actions">
              <Link to="/bots" className="btn btn-ghost btn-xs">
                Bot console →
              </Link>
            </div>
          </div>
          {bots.length ? (
            <div className="bot-mini-grid">
              {bots.slice(0, 3).map((bot) => (
                <BotMiniCard key={bot.id} bot={bot} onChange={() => void actions.refresh()} />
              ))}
            </div>
          ) : (
            <div className="bot-empty">
              <p>No bots yet. Deploy a house family or upload a custom JSON bot.</p>
              <Link to="/bots" className="btn btn-outline btn-sm">
                Open the bot console
              </Link>
            </div>
          )}
        </section>

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
            <span>Optibook Arena · paper account · Cloudflare Workers + Durable Objects</span>
          </div>
          <div className="footer-links">
            <span className="badge badge-soft">SIMULATION ONLY</span>
            <Link to="/rules">Rules</Link>
            <Link to="/pricing">Pricing</Link>
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
