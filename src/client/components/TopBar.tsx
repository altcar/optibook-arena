import { useEffect, useState } from 'react';
import type { ArenaConfig } from '../../shared/types';
import type { ConnectionStatus } from '../useArena';
import { fmtUptime } from '../format';
import { Icon, Logo } from './Icons';

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="clock" title="UTC session time">
      {now.toISOString().slice(11, 19)} <span className="muted">UTC</span>
    </span>
  );
}

export function TopBar({
  status,
  latency,
  tick,
  uptime,
  config,
  onSpeed,
  onReset,
}: {
  status: ConnectionStatus;
  latency: number | null;
  tick: number;
  uptime: number;
  config: ArenaConfig;
  onSpeed: (speed: number) => void;
  onReset: () => void;
}) {
  const label =
    status === 'live' ? 'Simulated live' : status === 'connecting' ? 'Connecting' : status === 'reconnecting' ? 'Reconnecting' : 'Offline';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Logo />
        <div>
          <div className="brand-row">
            <span className="brand">OPTIBOOK<span className="brand-accent">ARENA</span></span>
            <span className="version-pill">v1.0</span>
          </div>
          <span className="brand-sub">Dual-market strategy terminal · 5 pairs · 10 books</span>
        </div>
      </div>

      <div className="topbar-meta">
        <div className={`live-pill ${status}`}>
          <span className="live-dot" />
          {label}
        </div>
        <div className="meta-item hide-small">
          <Icon name="wifi" size={14} />
          <span>{latency === null ? '—' : `${latency}ms`}</span>
        </div>
        <div className="meta-item hide-small">
          <Icon name="activity" size={14} />
          <span>tick {tick.toLocaleString('en-US')}</span>
        </div>
        <div className="meta-item hide-small">
          <Icon name="clock" size={14} />
          <span>{fmtUptime(uptime / 1000)}</span>
        </div>
        <UtcClock />
        <label className="speed-control" title="Simulation speed (price movement + news frequency)">
          <span>Speed</span>
          <select value={config.speed} onChange={(event) => onSpeed(Number(event.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <button className="btn btn-ghost reset-btn" onClick={onReset} title="Reset the arena">
          <Icon name="refresh" size={14} />
          <span className="hide-small">Reset</span>
        </button>
      </div>
    </header>
  );
}
