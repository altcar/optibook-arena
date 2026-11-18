import { useEffect, useState } from 'react';
import type { Season } from '../../shared/types';
import { api, countdown, errorMessage, formatDate, formatUsd } from '../api';
import { Link } from '../router';
import { PageHeader, PageShell, Skeleton, StatusBadge } from '../shell';

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ seasons: Season[] }>('/api/seasons')
      .then((data) => setSeasons([...data.seasons].reverse()))
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  const live = seasons?.find((season) => season.status === 'live');
  const upcoming = seasons?.find((season) => season.status === 'upcoming');
  const past = seasons?.filter((season) => season.status === 'past') ?? [];

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Seasons"
          title="Every season changes the game."
          lead="Seasons are 47-day scored competitions. Each one can change inventory caps, fees, eligible families and payout structure — so a bot that won last season has to prove it again."
          actions={
            <Link to="/leaderboard" className="btn btn-primary btn-sm">
              Current standings
            </Link>
          }
        />

        {error && <p className="form-error">{error}</p>}
        {!seasons && <Skeleton lines={8} />}

        {live && (
          <section className="season-hero">
            <div className="season-hero-copy">
              <div className="season-hero-top">
                <StatusBadge status="live" />
                <span>Season {live.id}</span>
                <span className="muted">Ends {formatDate(live.endsAt)}</span>
              </div>
              <h2>{live.name}</h2>
              <p>{live.description}</p>
              <div className="season-hero-metrics">
                <span>
                  <em>Prize pool</em>
                  <strong>{formatUsd(live.prizePool, { compact: true })}</strong>
                </span>
                <span>
                  <em>Time left</em>
                  <strong>{countdown(live.endsAt)}</strong>
                </span>
                <span>
                  <em>Entry</em>
                  <strong>{live.entry}</strong>
                </span>
                <span>
                  <em>Divisions</em>
                  <strong>{live.divisions.join(' · ')}</strong>
                </span>
              </div>
              <div className="hero-actions">
                <Link to={`/season/${live.id}`} className="btn btn-primary">
                  Season hub
                </Link>
                <Link to="/leaderboard" className="btn btn-outline">
                  Live standings
                </Link>
              </div>
            </div>
            <div className="season-rule-card">
              <h4>Season {live.id} rules</h4>
              <ul>
                {live.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <Link to="/rules" className="text-link">
                Platform rules →
              </Link>
            </div>
          </section>
        )}

        {upcoming && (
          <section className="upcoming-season">
            <div>
              <span className="eyebrow">Next season</span>
              <h3>{upcoming.name}</h3>
              <p>{upcoming.tagline}</p>
            </div>
            <div className="upcoming-meta">
              <span>Starts {formatDate(upcoming.startsAt)}</span>
              <span>{formatUsd(upcoming.prizePool, { compact: true })} prizes</span>
              <span>{upcoming.entry}</span>
            </div>
          </section>
        )}

        <section className="season-list-section">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">Archive</span>
              <h2>Previous seasons</h2>
            </div>
            <span className="muted">{past.length} archived seasons</span>
          </div>
          <div className="season-grid">
            {past.map((season) => (
              <Link to={`/season/${season.id}`} className="season-card" key={season.id}>
                <div className="season-card-head">
                  <span className="season-number">S{season.id}</span>
                  <StatusBadge status={season.status} />
                </div>
                <h3>{season.name}</h3>
                <p>{season.tagline}</p>
                <div className="season-card-meta">
                  <span>{formatDate(season.startsAt)} → {formatDate(season.endsAt)}</span>
                  <strong>{formatUsd(season.prizePool, { compact: true })}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
