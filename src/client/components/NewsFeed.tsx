import { useMemo, useState } from 'react';
import { STOCK_SYMBOLS, type NewsItem } from '../../shared/types';
import { fmtTime } from '../format';
import { Icon } from './Icons';

type Filter = 'all' | 'bull' | 'bear' | 'mine';

function scoreTone(score: number): string {
  if (score > 0.15) return 'pos';
  if (score < -0.15) return 'neg';
  return 'flat';
}

export function NewsFeed({
  news,
  onPublish,
}: {
  news: NewsItem[];
  onPublish: (text: string, sentiment?: number, tickers?: string[]) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [sentiment, setSentiment] = useState<'auto' | 'bull' | 'bear'>('auto');
  const [publishing, setPublishing] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'bull') return news.filter((n) => n.sentiment > 0.15);
    if (filter === 'bear') return news.filter((n) => n.sentiment < -0.15);
    if (filter === 'mine') return news.filter((n) => n.manual);
    return news;
  }, [filter, news]);

  const detected = useMemo(() => {
    const upper = text.toUpperCase();
    return STOCK_SYMBOLS.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(upper));
  }, [text]);

  const submit = async () => {
    if (!text.trim() || publishing) return;
    setPublishing(true);
    try {
      const score = sentiment === 'auto' ? undefined : sentiment === 'bull' ? 0.75 : -0.75;
      await onPublish(text.trim(), score, detected);
      setText('');
      setSentiment('auto');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="panel news-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Arena wire</h2>
          <p className="panel-sub">Synthetic newswire · feeds the sentiment engine</p>
        </div>
        <span className="live-pill small live">
          <span className="live-dot" />
          LIVE
        </span>
      </div>

      <div className="news-filters">
        {(
          [
            ['all', 'All'],
            ['bull', 'Bullish'],
            ['bear', 'Bearish'],
            ['mine', 'My feed'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="news-list">
        {filtered.length === 0 && <div className="empty-state">No headlines in this filter yet.</div>}
        {filtered.map((item) => (
          <article key={item.id} className={`news-item ${item.manual ? 'manual' : ''}`}>
            <div className="news-meta">
              <span className="news-source">{item.source}</span>
              <span className="news-time">{fmtTime(item.ts)}</span>
              {item.manual && <span className="manual-badge">YOUR WIRE</span>}
            </div>
            <p className="news-text">{item.text}</p>
            <div className="news-bottom">
              <div className="news-tickers">
                {item.tickers.map((ticker) => (
                  <span key={ticker} className="ticker-chip">
                    {ticker}
                  </span>
                ))}
              </div>
              <span className={`sentiment-chip ${scoreTone(item.sentiment)}`}>
                {item.sentiment > 0 ? '+' : ''}
                {item.sentiment.toFixed(2)}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="news-composer">
        <div className="composer-head">
          <span>
            <Icon name="send" size={13} /> Publish a headline
          </span>
          <span className="composer-hint">Tickers are auto-detected</span>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 420))}
          placeholder="e.g. NVDA beats earnings expectations as data-centre demand accelerates"
          rows={2}
        />
        <div className="composer-actions">
          <div className="composer-tickers">
            {detected.map((ticker) => (
              <span key={ticker} className="ticker-chip">
                {ticker}
              </span>
            ))}
          </div>
          <select value={sentiment} onChange={(event) => setSentiment(event.target.value as typeof sentiment)}>
            <option value="auto">Auto sentiment</option>
            <option value="bull">Bullish</option>
            <option value="bear">Bearish</option>
          </select>
          <button className="publish-btn" onClick={submit} disabled={!text.trim() || publishing}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </section>
  );
}
