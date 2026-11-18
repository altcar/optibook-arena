import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotInfo, BotSpec, BotValidation } from '../../shared/types';
import { api, errorMessage, formatDate, formatUsd } from '../api';
import { Link } from '../router';
import { EmptyState, PageHeader, PageShell, PlanBadge, Skeleton } from '../shell';
import { Icon } from '../components/Icons';
import { Sparkline } from '../components/Sparkline';

interface Template {
  family: string;
  name: string;
  spec: BotSpec;
}

const DEFAULT_SPEC: BotSpec = {
  name: 'Basis Hunter',
  description: 'Buys the cheap leg and sells the rich leg when the stock/dual basis clears 8 bps.',
  family: 'dual-arb',
  params: { edgeBps: 8, qty: 5 },
  risk: { maxPosition: 40, maxGross: 60000, maxOrdersPerMin: 20 },
  universe: ['NVDA', 'PFE'],
};

export default function BotsPage() {
  const [bots, setBots] = useState<BotInfo[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [limit, setLimit] = useState(2);
  const [selected, setSelected] = useState(0);
  const [editor, setEditor] = useState(() => JSON.stringify(DEFAULT_SPEC, null, 2));
  const [validation, setValidation] = useState<BotValidation | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const currentEditor = () => editorRef.current?.value ?? editor;

  const load = () =>
    Promise.all([
      api<{ bots: BotInfo[]; limit: number }>('/api/bots'),
      api<{ templates: Template[] }>('/api/bots/template'),
    ])
      .then(([botData, templateData]) => {
        setBots(botData.bots);
        setLimit(botData.limit);
        setTemplates(templateData.templates);
      })
      .catch((reason) => setError(errorMessage(reason)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTemplate = templates[selected];

  const useTemplate = (index: number) => {
    setSelected(index);
    setEditor(JSON.stringify(templates[index].spec, null, 2));
    setValidation(null);
  };

  const readFile = async (file: File) => {
    setError('');
    if (file.size > 128_000) {
      setError('Bot file is larger than 128 KB.');
      return;
    }
    try {
      const text = await file.text();
      JSON.parse(text);
      setEditor(text);
      setValidation(null);
      setNotice(`Loaded ${file.name}. Validate, then deploy.`);
    } catch {
      setError('That file is not valid JSON.');
    }
  };

  const validate = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(currentEditor());
      } catch {
        throw new Error('The editor does not contain valid JSON.');
      }
      const result = await api<BotValidation>('/api/bots/validate', { body: parsed });
      setValidation(result);
      if (result.ok) setNotice('Validation passed. Ready to deploy.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const deploy = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const parsed = JSON.parse(currentEditor()) as BotSpec;
      const result = await api<{ bot: BotInfo; warnings: string[] }>('/api/bots', {
        body: { ...parsed, source: 'upload' },
      });
      setNotice(`${result.bot.name} is live. ${result.warnings.join(' ')}`.trim());
      setValidation(null);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (bot: BotInfo, status: 'active' | 'paused') => {
    try {
      await api(`/api/bots/${bot.id}/status`, { method: 'POST', body: { status } });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const remove = async (bot: BotInfo) => {
    if (!window.confirm(`Delete ${bot.name}? Its paper positions and round history will be removed.`)) return;
    try {
      await api(`/api/bots/${bot.id}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const totalPnl = useMemo(() => (bots ?? []).reduce((sum, bot) => sum + bot.pnl, 0), [bots]);

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Bot console"
          title="Deploy, validate and run your bots."
          lead="Upload a declarative JSON strategy. Every bot gets its own paper book, risk limits and a place on the leaderboard."
          actions={
            <>
              <Link to="/docs/bots" className="btn btn-outline btn-sm">
                Upload spec
              </Link>
              <Link to="/leaderboard" className="btn btn-ghost btn-sm">
                Leaderboard
              </Link>
            </>
          }
        />

        <div className="bot-console">
          <aside className="bot-sidebar">
            <div className="bot-sidebar-head">
              <h3>Your bots</h3>
              <span className="muted">
                {bots?.length ?? 0}/{limit} slots
              </span>
            </div>
            <div className="bot-sidebar-summary">
              <span>
                <em>Combined P&amp;L</em>
                <strong className={totalPnl >= 0 ? 'pos' : 'neg'}>{formatUsd(totalPnl, { signed: true })}</strong>
              </span>
              <span>
                <em>Live</em>
                <strong>{(bots ?? []).filter((bot) => bot.status === 'active').length}</strong>
              </span>
            </div>
            <div className="bot-list">
              {!bots && <Skeleton lines={6} />}
              {bots?.length === 0 && (
                <EmptyState title="No bots yet" body="Deploy a template or upload your own JSON spec to get on the board." />
              )}
              {bots?.map((bot) => (
                <article className={`bot-card ${bot.status}`} key={bot.id} data-testid="bot-card">
                  <div className="bot-card-head">
                    <span className={`bot-state ${bot.status}`} />
                    <div>
                      <h4>{bot.name}</h4>
                      <span>{bot.familyName}</span>
                    </div>
                    <span className={`mono ${bot.pnl >= 0 ? 'pos' : 'neg'}`}>
                      {formatUsd(bot.pnl, { signed: true, compact: true })}
                    </span>
                  </div>
                  <p className="bot-card-desc">{bot.description || 'No description provided.'}</p>
                  <div className="bot-stats">
                    <span>
                      <em>Win rate</em>
                      <strong>{bot.winRate === null ? '—' : `${bot.winRate}%`}</strong>
                    </span>
                    <span>
                      <em>Fills</em>
                      <strong>{bot.fills}</strong>
                    </span>
                    <span>
                      <em>Rank</em>
                      <strong>{bot.rank ? `#${bot.rank}` : '—'}</strong>
                    </span>
                  </div>
                  <div className="bot-trend">
                    <Sparkline
                      data={bot.trend}
                      color={bot.pnl >= 0 ? '#22c55e' : '#f43f5e'}
                      width={220}
                      height={30}
                      fill
                    />
                  </div>
                  <div className="bot-card-foot">
                    <span className="bot-universe">{bot.universe.join(' · ')}</span>
                    <div className="bot-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => void setStatus(bot, bot.status === 'active' ? 'paused' : 'active')}>
                        <Icon name={bot.status === 'active' ? 'pause' : 'play'} size={12} />
                        {bot.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => void remove(bot)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="bot-created">Created {formatDate(bot.createdAt)}</div>
                </article>
              ))}
            </div>
          </aside>

          <section className="bot-editor-panel">
            <div className="bot-editor-head">
              <div>
                <span className="eyebrow">New bot</span>
                <h2>Upload a spec</h2>
              </div>
              <PlanBadge plan="free" />
            </div>

            <div className="template-tabs" role="tablist" aria-label="Bot templates">
              {templates.map((template, index) => (
                <button
                  key={template.family}
                  className={selected === index ? 'active' : ''}
                  onClick={() => useTemplate(index)}
                  role="tab"
                  aria-selected={selected === index}
                >
                  {template.name}
                </button>
              ))}
            </div>

            <div
              className={`upload-drop ${dragging ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void readFile(file);
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') fileRef.current?.click();
              }}
            >
              <Icon name="layers" size={20} />
              <div>
                <strong>Drop a .json bot here</strong>
                <span>or click to browse · max 128 KB · declarative rules only</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </div>

            <div className="editor-meta">
              <span>{activeTemplate ? `Template: ${activeTemplate.name}` : 'Editor'}</span>
              <span className="mono">{editor.length.toLocaleString()} bytes</span>
            </div>
            <textarea
              ref={editorRef}
              className="bot-editor"
              value={editor}
              onChange={(event) => {
                setEditor(event.target.value);
                setValidation(null);
              }}
              spellCheck={false}
              aria-label="Bot JSON"
              data-testid="bot-editor"
            />

            {error && <p className="form-error">{error}</p>}
            {notice && <p className="form-success">{notice}</p>}
            {validation && (
              <div className={`validation-box ${validation.ok ? 'ok' : 'bad'}`} data-testid="validation-box">
                <div>
                  <Icon name={validation.ok ? 'check' : 'close'} size={15} />
                  <strong>{validation.ok ? 'Valid bot spec' : 'Validation failed'}</strong>
                </div>
                {validation.errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
                {validation.warnings.map((message) => (
                  <p className="warning" key={message}>
                    Warning: {message}
                  </p>
                ))}
              </div>
            )}

            <div className="bot-editor-actions">
              <button className="btn btn-outline" onClick={() => void validate()} disabled={busy || !editor}>
                Validate
              </button>
              <button className="btn btn-primary" onClick={() => void deploy()} disabled={busy || !editor} data-testid="deploy-bot">
                Deploy bot
              </button>
            </div>

            <div className="editor-help">
              <h4>What you can upload</h4>
              <ul>
                <li>
                  <strong>Family:</strong> one of six house families or <code>custom</code>.
                </li>
                <li>
                  <strong>Params:</strong> numeric strategy parameters, e.g. <code>edgeBps</code>, <code>qty</code>.
                </li>
                <li>
                  <strong>Risk:</strong> <code>maxPosition</code>, <code>maxGross</code>, <code>maxOrdersPerMin</code>.
                </li>
                <li>
                  <strong>Rules:</strong> up to 12 triggers/actions for custom bots. No arbitrary code is executed.
                </li>
              </ul>
              <Link to="/docs/bots" className="text-link">
                Read the full upload spec →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
