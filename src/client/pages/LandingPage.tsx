import { useEffect, useState } from 'react';
import type { LeaderboardEntry, PlatformOverview } from '../../shared/types';
import { api, countdown, formatUsd } from '../api';
import { Link } from '../router';
import { PageShell, Skeleton, StatusBadge } from '../shell';
import { Icon } from '../components/Icons';
import { Sparkline } from '../components/Sparkline';

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  if (!entries.length) return <Skeleton lines={5} />;
  const top = entries.slice(0, 4);
  return (
    <div className="podium-list">
      {top.map((entry) => (
        <Link to="/leaderboard" className="podium-row" key={entry.botId}>
          <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
          <span className="podium-bot">
            <strong>{entry.botName}</strong>
            <span>
              {entry.owner} · {entry.division}
            </span>
          </span>
          <span className="podium-spark">
            <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={76} height={24} />
          </span>
          <span className={`mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(entry.pnl, { signed: true, compact: true })}</span>
        </Link>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<PlatformOverview>('/api/platform')
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load arena'));
  }, []);

  return (
    <PageShell className="landing">
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <StatusBadge status="live" />
            <span>Season 15 · Basis Run · {countdown(Date.UTC(2026, 11, 18))} remaining</span>
          </div>
          <h1>
            Ship the bot.
            <br />
            Trade the <span className="accent-word">basis</span>.
          </h1>
          <p className="hero-lead">
            Optibook Arena is a paper-trading competition for developer-built trading bots. Five stocks, five dual
            listings, six strategy families and a custom rule engine — all scored on one live leaderboard.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Create free account
            </Link>
            <Link to="/live" className="btn btn-outline btn-lg">
              <Icon name="play" size={15} /> Watch the live arena
            </Link>
          </div>
          <div className="hero-proof">
            <span>
              <strong>{data ? data.stats.traders.toLocaleString() : '—'}</strong> traders
            </span>
            <span>
              <strong>{data ? data.stats.bots.toLocaleString() : '—'}</strong> bots
            </span>
            <span>
              <strong>{data ? formatUsd(data.stats.prizePool, { compact: true }) : '—'}</strong> season prizes
            </span>
            <span className="mono">No deposits · no stakes</span>
          </div>
        </div>

        <div className="hero-board">
          <div className="board-head">
            <div>
              <span className="board-kicker">LIVE MARKET</span>
              <strong>Dual-listing basis</strong>
            </div>
            <span className="live-pill live">
              <span className="live-dot" /> streaming
            </span>
          </div>
          <div className="mini-tape">
            {(data?.market ?? []).slice(0, 10).map((inst) => (
              <div className="mini-tape-row" key={inst.id}>
                <span className="tape-sym">{inst.id}</span>
                <span className="mono">{inst.last.toFixed(2)}</span>
                <span className={`mono ${inst.changePct >= 0 ? 'pos' : 'neg'}`}>
                  {inst.changePct >= 0 ? '+' : ''}
                  {inst.changePct.toFixed(2)}%
                </span>
                <span className={`mini-basis ${inst.kind === 'dual' ? (inst.basisPct >= 0 ? 'pos' : 'neg') : 'muted'}`}>
                  {inst.kind === 'dual' ? `${inst.basisPct >= 0 ? '+' : ''}${inst.basisPct.toFixed(1)} bps` : 'stock'}
                </span>
              </div>
            ))}
            {!data && <Skeleton lines={8} />}
          </div>
          <div className="board-leader">
            <div className="board-leader-head">
              <span>SEASON 15 · RAISED</span>
              <Link to="/leaderboard">Full board →</Link>
            </div>
            <Podium entries={data?.leaderboard ?? []} />
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>

      <section className="ticker-strip" aria-label="Market ticker">
        <div className="ticker-track">
          {(data?.market ?? []).map((inst) => (
            <span key={inst.id} className="ticker-item">
              <strong>{inst.id}</strong>
              <span className="mono">{inst.last.toFixed(2)}</span>
              <span className={`mono ${inst.changePct >= 0 ? 'pos' : 'neg'}`}>
                {inst.changePct >= 0 ? '▲' : '▼'} {Math.abs(inst.changePct).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <span className="eyebrow">How it works</span>
          <h2>From JSON to a live book in minutes.</h2>
          <p>No infrastructure, no market data bill, no execution risk. Upload a strategy and let the arena score it.</p>
        </div>
        <div className="step-grid">
          <article className="step-card">
            <span className="step-num">01</span>
            <Icon name="shield" size={22} />
            <h3>Open a paper account</h3>
            <p>Start with $100,000 in simulated capital. Your account, positions and P&amp;L are isolated from every other trader.</p>
          </article>
          <article className="step-card">
            <span className="step-num">02</span>
            <Icon name="layers" size={22} />
            <h3>Pick a family or upload</h3>
            <p>Deploy one of six house strategy families, or upload a declarative JSON bot with custom triggers and risk limits.</p>
          </article>
          <article className="step-card">
            <span className="step-num">03</span>
            <Icon name="bolt" size={22} />
            <h3>Compete every tick</h3>
            <p>Bots trade a shared synthetic venue at 4 ticks per second. Seasons, tournaments and win rate decide the board.</p>
          </article>
        </div>
      </section>

      <section className="season-banner">
        <div className="season-banner-copy">
          <span className="eyebrow">Current season</span>
          <h2>{data?.season?.name ?? 'Season 15 · Basis Run'}</h2>
          <p>{data?.season?.tagline}</p>
          <div className="season-meta">
            <span>
              <em>Prize pool</em>
              <strong>{formatUsd(data?.season?.prizePool ?? 25000, { compact: true })}</strong>
            </span>
            <span>
              <em>Ends in</em>
              <strong>{countdown(data?.season?.endsAt ?? Date.UTC(2026, 11, 18))}</strong>
            </span>
            <span>
              <em>Starting cash</em>
              <strong>{formatUsd(data?.season?.startingCash ?? 100000, { compact: true })}</strong>
            </span>
          </div>
          <Link to="/seasons" className="btn btn-outline">
            Season rules &amp; standings
          </Link>
        </div>
        <div className="season-banner-rules">
          <h4>Season 15 rule changes</h4>
          <ul>
            {(data?.season?.rules ?? [
              'Starting paper balance: $100,000 per account.',
              'Max net position: 100 shares per instrument.',
              'All six families plus custom rule bots.',
              'Scoring: net P&L after a 1 bp simulated fee.',
            ]).map((rule) => (
              <li key={rule}>
                <Icon name="check" size={13} /> {rule}
              </li>
            ))}
          </ul>
          <Link to="/rules" className="text-link">
            Read the full platform rules →
          </Link>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">The arena</span>
            <h2>Everything a bot needs. Nothing it can break.</h2>
          </div>
          <Link to="/stack" className="btn btn-ghost">
            Explore the stack
          </Link>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="activity" size={18} />
            </div>
            <h3>Dual-market venue</h3>
            <p>Ten instruments: five liquid stocks and five dual listings with a mean-reverting basis, synthetic books and news shocks.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="layers" size={18} />
            </div>
            <h3>Six families + custom</h3>
            <p>Dual maker, pair hedger, basis arbitrage, news sentiment, momentum and adaptive maker — each runnable per account.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="shield" size={18} />
            </div>
            <h3>Risk rails</h3>
            <p>Per-instrument caps, gross exposure limits, order-rate throttles and an isolated paper book for every account.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="bolt" size={18} />
            </div>
            <h3>Live scoring</h3>
            <p>Net P&amp;L, win rate per closed round, Sharpe and trade count update on every broadcast tick.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="clock" size={18} />
            </div>
            <h3>Seasons &amp; tournaments</h3>
            <p>Rolling seasons with rule changes, plus 24–72 hour sprints with separate prize pools and formats.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Icon name="news" size={18} />
            </div>
            <h3>News &amp; community</h3>
            <p>A synthetic wire feeds sentiment strategies. The forum and newsletter keep the build community close.</p>
          </article>
        </div>
      </section>

      <section className="landing-section pricing-teaser">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">Pricing</span>
            <h2>Free to compete. Paid to scale.</h2>
            <p>The arena is free forever for one account and two bots. Pro and Desk add bot slots, private tournaments and team tools.</p>
          </div>
          <Link to="/pricing" className="btn btn-outline">
            Compare plans
          </Link>
        </div>
        <div className="price-teaser-grid">
          <div className="price-teaser-card">
            <span>Free</span>
            <strong>$0</strong>
            <p>2 bots · open division · every public season</p>
          </div>
          <div className="price-teaser-card featured">
            <span>Pro</span>
            <strong>$19<span>/mo</span></strong>
            <p>10 bots · Raised division · tournament priority</p>
          </div>
          <div className="price-teaser-card">
            <span>Desk</span>
            <strong>$99<span>/mo</span></strong>
            <p>50 bots · private leagues · team seats</p>
          </div>
        </div>
      </section>

      <section className="newsletter-cta">
        <div>
          <span className="eyebrow">The basis premium</span>
          <h2>One email. Season notes, bot teardowns, rule changes.</h2>
          <p>Join {data ? data.stats.newsletterSubscribers.toLocaleString() : '8,400+'} traders reading the Optibook newsletter.</p>
        </div>
        <Link to="/newsletter" className="btn btn-primary">
          Read the latest issue
        </Link>
      </section>
    </PageShell>
  );
}
