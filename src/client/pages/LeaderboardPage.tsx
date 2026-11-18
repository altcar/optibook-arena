import { useEffect, useMemo, useState } from 'react';
import type { Division, LeaderboardEntry, Season } from '../../shared/types';
import { api, errorMessage, formatDate, formatUsd } from '../api';
import { Link, navigate } from '../router';
import { PageHeader, PageShell, Skeleton, StatusBadge } from '../shell';
import { Sparkline } from '../components/Sparkline';

const DIVISIONS: { id: Division | 'all'; label: string }[] = [
  { id: 'all', label: 'All divisions' },
  { id: 'raised', label: 'Raised' },
  { id: 'open', label: 'Open' },
];

export default function LeaderboardPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [seasonId, setSeasonId] = useState(15);
  const [division, setDivision] = useState<Division | 'all'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ seasons: Season[] }>('/api/seasons')
      .then((data) => setSeasons(data.seasons))
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    setEntries(null);
    api<{ entries: LeaderboardEntry[] }>(`/api/leaderboard?season=${seasonId}&division=${division === 'all' ? '' : division}`)
      .then((data) => setEntries(data.entries))
      .catch((reason) => setError(errorMessage(reason)));
  }, [seasonId, division]);

  const filtered = useMemo(() => {
    const list = entries ?? [];
    if (!query.trim()) return list;
    const needle = query.toLowerCase();
    return list.filter(
      (entry) => entry.botName.toLowerCase().includes(needle) || entry.owner.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  const season = seasons.find((entry) => entry.id === seasonId);
  const viewerEntry = (entries ?? []).find((entry) => entry.isViewer);
  const podium = (entries ?? []).slice(0, 3);

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Leaderboard"
          title="The board is the product."
          lead="Ranked by net paper P&L, then win rate, then Sharpe. Every bot on this page trades the same synthetic venue."
          actions={
            <>
              <Link to="/register" className="btn btn-primary btn-sm">
                Compete free
              </Link>
              <Link to="/seasons" className="btn btn-ghost btn-sm">
                Season rules
              </Link>
            </>
          }
        />

        <div className="leaderboard-toolbar">
          <div className="segmented" role="tablist" aria-label="Division">
            {DIVISIONS.map((item) => (
              <button
                key={item.id}
                className={division === item.id ? 'active' : ''}
                onClick={() => setDivision(item.id)}
                role="tab"
                aria-selected={division === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <label className="select-field">
              <span>Season</span>
              <select value={seasonId} onChange={(event) => setSeasonId(Number(event.target.value))}>
                {[...seasons].reverse().map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    S{entry.id} · {entry.name.split('·')[1]?.trim() ?? entry.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="search-field"
              placeholder="Search bot or owner"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search leaderboard"
            />
          </div>
        </div>

        {season && (
          <div className="leaderboard-meta">
            <StatusBadge status={season.status} />
            <span>{season.name}</span>
            <span className="muted">Ends {formatDate(season.endsAt)}</span>
            <span className="muted">Prize pool {formatUsd(season.prizePool, { compact: true })}</span>
            <span className="muted">{entries?.length ?? '—'} bots ranked</span>
          </div>
        )}

        {viewerEntry && (
          <div className="viewer-rank-card">
            <span className="viewer-rank">Your best bot is #{viewerEntry.rank}</span>
            <strong>{viewerEntry.botName}</strong>
            <span className={`mono ${viewerEntry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(viewerEntry.pnl, { signed: true })}</span>
            <Link to="/bots" className="text-link">
              Open bot console →
            </Link>
          </div>
        )}

        {podium.length > 0 && (
          <div className="podium-cards">
            {podium.map((entry, index) => (
              <article key={entry.botId} className={`podium-card place-${index + 1}`}>
                <div className="podium-card-top">
                  <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                  <div>
                    <h3>{entry.botName}</h3>
                    <span>
                      {entry.owner} · {entry.division}
                    </span>
                  </div>
                  <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={90} height={30} />
                </div>
                <strong className={`podium-pnl ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>
                  {formatUsd(entry.pnl, { signed: true, compact: true })}
                </strong>
                <div className="podium-card-meta">
                  <span>{entry.winRate}% win</span>
                  <span>{entry.trades} fills</span>
                  <span>Sharpe {entry.sharpe}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="table-card">
          <table className="data-table leaderboard-table" data-testid="leaderboard-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th>Bot</th>
                <th>Owner</th>
                <th>Family</th>
                <th className="num">Net P&amp;L</th>
                <th className="num">Return</th>
                <th className="num">Win rate</th>
                <th className="num">Sharpe</th>
                <th className="num">Fills</th>
                <th>Trend</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!entries &&
                Array.from({ length: 8 }, (_, index) => (
                  <tr key={index}>
                    <td colSpan={11}>
                      <Skeleton lines={1} />
                    </td>
                  </tr>
                ))}
              {filtered.map((entry) => (
                <tr key={entry.botId} className={entry.isViewer ? 'is-viewer' : ''}>
                  <td className="col-rank">
                    <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                  </td>
                  <td>
                    <div className="bot-cell">
                      <span className={`bot-state ${entry.status === 'seeded' ? 'active' : entry.status}`} />
                      <div>
                        <strong>{entry.botName}</strong>
                        <span className="badge badge-soft">{entry.division}</span>
                        {entry.isViewer && <span className="badge badge-accent">you</span>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{entry.owner}</td>
                  <td className="muted">{entry.family}</td>
                  <td className={`num mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(entry.pnl, { signed: true })}</td>
                  <td className={`num mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>
                    {entry.pnlPct >= 0 ? '+' : ''}
                    {entry.pnlPct.toFixed(2)}%
                  </td>
                  <td className="num mono">{entry.winRate.toFixed(1)}%</td>
                  <td className="num mono">{entry.sharpe.toFixed(2)}</td>
                  <td className="num mono">{entry.trades.toLocaleString()}</td>
                  <td>
                    <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={70} height={22} />
                  </td>
                  <td>
                    <Link to={`/bots`} className="text-link small">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries && !filtered.length && (
            <div className="table-empty">
              <p>No bots match that filter.</p>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setQuery('');
                  setDivision('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <div className="leaderboard-footnote">
          <p>
            Scoring: net P&amp;L after simulated fees, tie-broken on win rate and Sharpe. Win rate is the share of
            completed 2.5-minute rounds with positive P&amp;L. Seeded bots are historical benchmarks kept on the board
            for context.
          </p>
          <div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSeasonId(15);
                setDivision('raised');
                setQuery('');
                navigate('/leaderboard?division=raised');
              }}
            >
              Show Raised division
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
