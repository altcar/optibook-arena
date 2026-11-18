import { useEffect, useState } from 'react';
import type { LeaderboardEntry, Tournament } from '../../shared/types';
import { api, countdown, errorMessage, formatDate, formatUsd } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';
import { PageHeader, PageShell, Skeleton, StatusBadge } from '../shell';
import { Icon } from '../components/Icons';
import { Sparkline } from '../components/Sparkline';

type Filter = 'all' | 'live' | 'upcoming' | 'completed';

export default function TournamentsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ tournaments: Tournament[] }>('/api/tournaments'),
      api<{ entries: LeaderboardEntry[] }>('/api/leaderboard?division=raised'),
    ])
      .then(([tournamentData, board]) => {
        setTournaments(tournamentData.tournaments);
        setEntries(board.entries.slice(0, 6));
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  const register = async (tournament: Tournament) => {
    if (!user) return;
    setBusy(tournament.id);
    try {
      const result = await api<{ tournaments: Tournament[] }>(`/api/tournaments/${tournament.id}/register`, {
        body: {},
      });
      setTournaments(result.tournaments);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy('');
    }
  };

  const visible = (tournaments ?? []).filter((tournament) => filter === 'all' || tournament.status === filter);

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Tournaments"
          title="Short formats. Sharp edges."
          lead="Tournaments are 24–72 hour sprints with their own rule sets, prize pools and eligibility. Register an account, pick a bot, and let the arena do the scoring."
          actions={
            <Link to="/leaderboard" className="btn btn-ghost btn-sm">
              Season leaderboard
            </Link>
          }
        />

        <div className="segmented tournament-tabs" role="tablist" aria-label="Tournament status">
          {(['all', 'live', 'upcoming', 'completed'] as Filter[]).map((value) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              role="tab"
              aria-selected={filter === value}
            >
              {value === 'all' ? 'All' : value === 'live' ? 'Live now' : value === 'upcoming' ? 'Upcoming' : 'Completed'}
            </button>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}
        {!tournaments && <Skeleton lines={10} />}

        <div className="tournament-list">
          {visible.map((tournament) => (
            <article className={`tournament-card ${tournament.status}`} key={tournament.id}>
              <div className="tournament-card-head">
                <div>
                  <StatusBadge status={tournament.status} />
                  <span className="muted">{tournament.format}</span>
                </div>
                <strong className="tournament-prize">{formatUsd(tournament.prize, { compact: true })}</strong>
              </div>
              <h2>{tournament.name}</h2>
              <p>{tournament.description}</p>
              <div className="tournament-meta">
                <span>
                  <Icon name="clock" size={14} />
                  {formatDate(tournament.startsAt)} → {formatDate(tournament.endsAt)}
                </span>
                <span>
                  <Icon name="layers" size={14} />
                  {tournament.participants}/{tournament.capacity} entrants
                </span>
                <span>
                  <Icon name="shield" size={14} />
                  {tournament.entry}
                </span>
                {tournament.status === 'live' && <span className="pos">Ends in {countdown(tournament.endsAt)}</span>}
              </div>
              <ul className="tournament-rules">
                {tournament.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <div className="tournament-actions">
                {tournament.status === 'completed' ? (
                  <button className="btn btn-ghost btn-sm" disabled>
                    Final standings archived
                  </button>
                ) : tournament.registered ? (
                  <button className="btn btn-outline btn-sm" disabled>
                    <Icon name="check" size={13} /> Registered
                  </button>
                ) : user ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void register(tournament)}
                    disabled={busy === tournament.id}
                  >
                    {busy === tournament.id ? 'Registering…' : 'Register for this event'}
                  </button>
                ) : (
                  <Link to="/login?next=/tournaments" className="btn btn-primary btn-sm">
                    Sign in to register
                  </Link>
                )}
                <span className="muted small">
                  {tournament.registered ? 'Your account is entered.' : 'Entry is free for eligible accounts.'}
                </span>
              </div>
            </article>
          ))}
        </div>

        {tournaments && !visible.length && <p className="table-empty">No tournaments in this state.</p>}

        <section className="panel tournament-standings">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">LIVE FORM</span>
              <h3>Raised division form guide</h3>
            </div>
            <Link to="/leaderboard" className="btn btn-ghost btn-xs">
              Full board →
            </Link>
          </div>
          <div className="form-guide">
            {entries.map((entry) => (
              <div className="form-row" key={entry.botId}>
                <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                <strong>{entry.botName}</strong>
                <span className="muted">{entry.owner}</span>
                <Sparkline data={entry.trend} color={entry.pnl >= 0 ? '#22c55e' : '#f43f5e'} width={70} height={20} />
                <span className={`mono ${entry.pnl >= 0 ? 'pos' : 'neg'}`}>{formatUsd(entry.pnl, { signed: true, compact: true })}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
