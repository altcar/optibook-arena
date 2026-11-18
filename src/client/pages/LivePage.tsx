import { useEffect, useState } from 'react';
import type { PlatformOverview } from '../../shared/types';
import { api, formatUsd, timeAgo } from '../api';
import { Link } from '../router';
import { useArena } from '../useArena';
import { PageShell, Skeleton } from '../shell';
import { Icon } from '../components/Icons';
import { Sparkline } from '../components/Sparkline';

export default function LivePage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const { state, status, latency } = useArena();

  useEffect(() => {
    api<PlatformOverview>('/api/platform')
      .then(setOverview)
      .catch(() => undefined);
  }, []);

  const instruments = state?.instruments ?? [];
  const leaders = overview?.leaderboard ?? [];

  return (
    <PageShell>
      <div className="content-wrap">
        <header className="live-head">
          <div>
            <div className="hero-eyebrow">
              <span className={`live-pill ${status}`}>
                <span className="live-dot" /> {status === 'live' ? 'Live arena' : status}
              </span>
              {state && <span className="muted">tick {state.stats.tick.toLocaleString()}</span>}
              {latency !== null && <span className="muted">{latency} ms</span>}
            </div>
            <h1>Ten books. One tick loop.</h1>
            <p>Watch the synthetic dual-market venue stream prices, fills and headlines in real time. No login required.</p>
          </div>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">
              Compete free
            </Link>
            <Link to="/leaderboard" className="btn btn-outline">
              Leaderboard
            </Link>
          </div>
        </header>

        <div className="live-grid">
          <section className="panel live-market">
            <div className="panel-head">
              <div>
                <span className="panel-kicker">DUAL VENUE</span>
                <h3>Market board</h3>
              </div>
              <span className="muted">5 stocks · 5 duals</span>
            </div>
            <table className="data-table live-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="num">Last</th>
                  <th className="num">Change</th>
                  <th className="num">Bid / Ask</th>
                  <th className="num">Basis</th>
                  <th className="num">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {!instruments.length &&
                  Array.from({ length: 6 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={6}>
                        <Skeleton lines={1} />
                      </td>
                    </tr>
                  ))}
                {instruments.map((inst) => (
                  <tr key={inst.id} className={inst.kind === 'dual' ? 'dual-row' : ''}>
                    <td>
                      <div className="live-symbol">
                        <span className={`dot ${inst.kind}`} />
                        <strong>{inst.id}</strong>
                        <span>{inst.name}</span>
                      </div>
                    </td>
                    <td className="num mono">{inst.last.toFixed(2)}</td>
                    <td className={`num mono ${inst.changePct >= 0 ? 'pos' : 'neg'}`}>
                      {inst.changePct >= 0 ? '+' : ''}
                      {inst.changePct.toFixed(2)}%
                    </td>
                    <td className="num mono small">
                      {inst.bid.toFixed(2)} / {inst.ask.toFixed(2)}
                    </td>
                    <td className={`num mono ${inst.kind === 'dual' ? (inst.basisPct >= 0 ? 'pos' : 'neg') : 'muted'}`}>
                      {inst.kind === 'dual' ? `${inst.basisPct >= 0 ? '+' : ''}${inst.basisPct.toFixed(1)} bps` : '—'}
                    </td>
                    <td className={`num mono ${inst.sentiment > 0 ? 'pos' : inst.sentiment < 0 ? 'neg' : 'muted'}`}>
                      {inst.sentiment.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel live-feed">
            <div className="panel-head">
              <h3>Recent fills</h3>
              <span className="muted">{(state?.trades ?? []).length} shown</span>
            </div>
            <div className="live-trades">
              {(state?.trades ?? []).slice(0, 14).map((trade) => (
                <div className="live-trade" key={trade.id}>
                  <span className={`side-dot ${trade.aggressor}`} />
                  <strong>{trade.instrument}</strong>
                  <span className="mono">{trade.price.toFixed(2)}</span>
                  <span className="mono">{trade.qty}</span>
                  <span className={trade.aggressor === 'buy' ? 'pos' : 'neg'}>{trade.aggressor}</span>
                  <span className="muted small">{timeAgo(trade.ts)}</span>
                </div>
              ))}
              {!state && <Skeleton lines={8} />}
            </div>
            <div className="panel-head live-news-head">
              <h3>The wire</h3>
            </div>
            <div className="live-news">
              {(state?.news ?? []).slice(0, 5).map((item) => (
                <div className="live-news-item" key={item.id}>
                  <span className={`sentiment-dot ${item.sentiment > 0.1 ? 'pos' : item.sentiment < -0.1 ? 'neg' : ''}`} />
                  <div>
                    <p>{item.text}</p>
                    <span className="muted small">
                      {item.source} · {timeAgo(item.ts)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel live-board">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">SEASON 15</span>
              <h3>Top of the board</h3>
            </div>
            <Link to="/leaderboard" className="btn btn-ghost btn-xs">
              Full leaderboard →
            </Link>
          </div>
          <div className="live-board-grid">
            {leaders.slice(0, 8).map((entry) => (
              <div className="live-board-row" key={entry.botId}>
                <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                <div>
                  <strong>{entry.botName}</strong>
                  <span className="muted small">{entry.owner}</span>
                </div>
                <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={64} height={20} />
                <span className={`mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(entry.pnl, { signed: true, compact: true })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="live-cta">
          <div>
            <span className="eyebrow">Think you can beat it?</span>
            <h2>Put a bot on the board.</h2>
            <p>Open a free paper account, deploy a template and watch it trade against the same venue.</p>
          </div>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">
              Create free account
            </Link>
            <Link to="/docs/bots" className="btn btn-outline">
              <Icon name="external" size={14} /> Read the upload spec
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
