import { useEffect, useState } from 'react';
import type { LeaderboardEntry, Season } from '../../shared/types';
import { api, countdown, errorMessage, formatDate, formatUsd } from '../api';
import { Link } from '../router';
import { PageShell, Skeleton, StatusBadge } from '../shell';
import { Sparkline } from '../components/Sparkline';

export default function SeasonPage({ id }: { id: number }) {
  const [season, setSeason] = useState<Season | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ season: Season; entries: LeaderboardEntry[] }>(`/api/season/${id}`)
      .then((data) => {
        setSeason(data.season);
        setEntries(data.entries);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [id]);

  if (error) {
    return (
      <PageShell>
        <div className="content-wrap">
          <p className="form-error">{error}</p>
          <Link to="/seasons" className="text-link">
            ← All seasons
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="content-wrap">
        <Link to="/seasons" className="back-link">
          ← All seasons
        </Link>
        {!season ? (
          <Skeleton lines={10} />
        ) : (
          <>
            <header className="season-detail-head">
              <div>
                <div className="season-hero-top">
                  <StatusBadge status={season.status} />
                  <span>Season {season.id}</span>
                  <span className="muted">{formatDate(season.startsAt)} → {formatDate(season.endsAt)}</span>
                </div>
                <h1>{season.name}</h1>
                <p>{season.description}</p>
              </div>
              <div className="season-detail-prize">
                <em>Prize pool</em>
                <strong>{formatUsd(season.prizePool, { compact: true })}</strong>
                <span>{season.status === 'live' ? `${countdown(season.endsAt)} remaining` : season.entry}</span>
              </div>
            </header>

            <div className="season-detail-grid">
              <section className="panel">
                <div className="panel-head">
                  <h3>Rule set</h3>
                </div>
                <ul className="rule-list">
                  {season.rules.map((rule, index) => (
                    <li key={rule}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {rule}
                    </li>
                  ))}
                </ul>
                <div className="season-facts">
                  <span>
                    <em>Starting cash</em>
                    <strong>{formatUsd(season.startingCash)}</strong>
                  </span>
                  <span>
                    <em>Position cap</em>
                    <strong>{season.positionLimit} shares</strong>
                  </span>
                  <span>
                    <em>Fee</em>
                    <strong>{season.feeBps} bp</strong>
                  </span>
                  <span>
                    <em>Divisions</em>
                    <strong>{season.divisions.join(' · ')}</strong>
                  </span>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h3>Eligible families</h3>
                </div>
                <div className="family-pills">
                  {season.allowedFamilies.map((family) => (
                    <span className="family-pill" key={family}>
                      {family}
                    </span>
                  ))}
                </div>
                <h3 className="subhead">Payout structure</h3>
                <table className="mini-table">
                  <tbody>
                    <tr>
                      <td>1st</td>
                      <td className="mono">{formatUsd(season.prizePool * 0.4)}</td>
                    </tr>
                    <tr>
                      <td>2nd</td>
                      <td className="mono">{formatUsd(season.prizePool * 0.22)}</td>
                    </tr>
                    <tr>
                      <td>3rd</td>
                      <td className="mono">{formatUsd(season.prizePool * 0.12)}</td>
                    </tr>
                    <tr>
                      <td>4th–10th</td>
                      <td className="mono">{formatUsd(season.prizePool * 0.26)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="fine-print">Prizes are simulated credits, not cash. See the rules for eligibility.</p>
              </section>
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">STANDINGS</span>
                  <h3>Top bots</h3>
                </div>
                <Link to="/leaderboard" className="btn btn-ghost btn-xs">
                  Full leaderboard →
                </Link>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Bot</th>
                    <th>Owner</th>
                    <th className="num">P&amp;L</th>
                    <th className="num">Win rate</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 10).map((entry) => (
                    <tr key={entry.botId}>
                      <td>
                        <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                      </td>
                      <td>{entry.botName}</td>
                      <td className="muted">{entry.owner}</td>
                      <td className={`num mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(entry.pnl, { signed: true })}</td>
                      <td className="num mono">{entry.winRate}%</td>
                      <td>
                        <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={80} height={22} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
