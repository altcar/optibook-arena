import type { Stats } from '../../shared/types';
import { fmtCompact, fmtMoney, fmtPct, tone } from '../format';
import { Icon } from './Icons';
import { Sparkline } from './Sparkline';

function StatCard({
  label,
  value,
  sub,
  tone: valueTone,
  icon,
  accent,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  icon?: string;
  accent?: string;
  spark?: number[];
}) {
  return (
    <div className="stat-card" style={accent ? { ['--card-accent' as string]: accent } : undefined}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className="stat-icon">
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className={`stat-value ${valueTone ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {spark && spark.length > 2 && (
        <div className="stat-spark">
          <Sparkline data={spark} color={valueTone === 'neg' ? '#f43f5e' : '#22c55e'} width={118} height={28} fill />
        </div>
      )}
    </div>
  );
}

export function StatsStrip({ stats, equity, startingCash }: { stats: Stats; equity: number[]; startingCash: number }) {
  const pnlPct = startingCash ? (stats.pnl / startingCash) * 100 : 0;
  return (
    <section className="stats-strip" aria-label="Arena statistics">
      <StatCard
        label="Account equity"
        value={fmtMoney(stats.equity)}
        sub={`Started at ${fmtMoney(startingCash)} · ${fmtPct(pnlPct, { signed: true })}`}
        icon="shield"
        accent="#38bdf8"
        spark={equity}
      />
      <StatCard
        label="Net P&L"
        value={fmtMoney(stats.pnl, { signed: true })}
        sub={`Realised ${fmtMoney(stats.realized, { signed: true })} · Open ${fmtMoney(stats.unrealized, { signed: true })}`}
        tone={tone(stats.pnl)}
        icon="activity"
        accent="#22c55e"
      />
      <StatCard
        label="Gross exposure"
        value={fmtMoney(stats.exposure)}
        sub={`${stats.fills.toLocaleString('en-US')} fills across 6 strategy books`}
        icon="layers"
        accent="#a78bfa"
      />
      <StatCard
        label="Dual arb ops"
        value={fmtCompact(stats.arbOps)}
        sub="Crossed stock / dual basis executions"
        icon="bolt"
        accent="#f59e0b"
      />
      <StatCard
        label="Engine"
        value={`${stats.tickMs.toFixed(1)}ms`}
        sub={`Tick ${stats.tick.toLocaleString('en-US')} · ${stats.fills.toLocaleString('en-US')} total fills`}
        icon="clock"
        accent="#64748b"
      />
    </section>
  );
}
