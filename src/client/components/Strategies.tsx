import { useEffect, useState } from 'react';
import type { StrategyInfo } from '../../shared/types';
import { fmtMoney, fmtQty, tone } from '../format';
import { Icon } from './Icons';

const PARAM_LABELS: Record<string, string> = {
  spread: 'Quote spread',
  qty: 'Size / order',
  maxPosition: 'Max position',
  threshold: 'Hedge band',
  edge: 'Arb edge',
  sensitivity: 'News sensitivity',
  takeThreshold: 'Take threshold',
  horizon: 'Lookback ticks',
  bias: 'Momentum bias',
  baseSpread: 'Min spread',
  hedgeThreshold: 'Hedge trigger',
};

function stepFor(key: string): number {
  if (['spread', 'edge', 'baseSpread'].includes(key)) return 0.01;
  if (['sensitivity', 'bias'].includes(key)) return 0.1;
  return 1;
}

function ConfigField({
  name,
  value,
  onDraft,
}: {
  name: string;
  value: number;
  onDraft: (key: string, value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <label className="param-field">
      <span>{PARAM_LABELS[name] ?? name}</span>
      <input
        type="number"
        step={stepFor(name)}
        min={0}
        value={local}
        onChange={(event) => {
          setLocal(event.target.value);
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onDraft(name, parsed);
        }}
      />
    </label>
  );
}

function StrategyCard({
  strategy,
  onToggle,
  onSaveConfig,
}: {
  strategy: StrategyInfo;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onSaveConfig: (id: string, config: Record<string, number>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>(strategy.config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(strategy.config);
  }, [JSON.stringify(strategy.config)]);

  const dirty = Object.entries(draft).some(([key, value]) => Math.abs((strategy.config[key] ?? 0) - value) > 1e-9);

  const save = async () => {
    setSaving(true);
    try {
      await onSaveConfig(strategy.id, draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className={`strategy-card ${strategy.enabled ? 'enabled' : ''}`}
      style={{ ['--strategy' as string]: strategy.color }}
    >
      <div className="strategy-top">
        <div className="strategy-title">
          <span className="strategy-orb" />
          <div>
            <div className="strategy-name-row">
              <h3>{strategy.name}</h3>
              <span className={`state-pill ${strategy.enabled ? 'on' : 'off'}`}>
                {strategy.enabled ? 'RUNNING' : 'IDLE'}
              </span>
            </div>
            <span className="strategy-origin">{strategy.origin}</span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={strategy.enabled}
          aria-label={`${strategy.enabled ? 'Pause' : 'Start'} ${strategy.name}`}
          className={`toggle ${strategy.enabled ? 'on' : ''}`}
          onClick={() => onToggle(strategy.id, !strategy.enabled)}
        >
          <span />
        </button>
      </div>

      <p className="strategy-desc">{strategy.description}</p>

      <div className="strategy-metrics">
        <div>
          <span>P&amp;L</span>
          <strong className={tone(strategy.pnl)}>{fmtMoney(strategy.pnl, { signed: true })}</strong>
        </div>
        <div>
          <span>Fills</span>
          <strong>{strategy.fills.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span>Net</span>
          <strong className={tone(strategy.netQty)}>{fmtQty(strategy.netQty)}</strong>
        </div>
        <div>
          <span>Exposure</span>
          <strong>{fmtMoney(strategy.exposure, { compact: true })}</strong>
        </div>
      </div>

      <div className="strategy-foot">
        <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)}>
          <Icon name="settings" size={13} />
          {expanded ? 'Hide parameters' : 'Parameters'}
          <Icon name="chevron" size={13} className={expanded ? 'rotate' : ''} />
        </button>
        <span className="strategy-pnl-detail">
          R {fmtMoney(strategy.realized, { signed: true })} · U {fmtMoney(strategy.unrealized, { signed: true })}
        </span>
      </div>

      {expanded && (
        <div className="strategy-config">
          {Object.keys(strategy.config).map((key) => (
            <ConfigField
              key={key}
              name={key}
              value={draft[key] ?? strategy.config[key]}
              onDraft={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
            />
          ))}
          <button type="button" className="apply-btn" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : dirty ? 'Apply parameters' : 'Saved'}
          </button>
        </div>
      )}
    </article>
  );
}

export function Strategies({
  strategies,
  onToggle,
  onSaveConfig,
}: {
  strategies: StrategyInfo[];
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onSaveConfig: (id: string, config: Record<string, number>) => Promise<void>;
}) {
  const running = strategies.filter((s) => s.enabled).length;
  return (
    <section className="panel strategies-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Strategy lab</h2>
          <p className="panel-sub">Six server-side engines · toggle or tune live</p>
        </div>
        <span className="badge badge-pos">
          {running} / {strategies.length} running
        </span>
      </div>
      <div className="strategy-grid">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            onToggle={onToggle}
            onSaveConfig={onSaveConfig}
          />
        ))}
      </div>
    </section>
  );
}
