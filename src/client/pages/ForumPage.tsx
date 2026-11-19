import { useEffect, useMemo, useState } from 'react';
import type { ForumThread, ForumThreadSummary } from '../../shared/types';
import { api, errorMessage, timeAgo } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';
import { PageHeader, PageShell, PlanBadge, Skeleton } from '../shell';
import { Icon } from '../components/Icons';

export default function ForumPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ForumThreadSummary[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [threadCategory, setThreadCategory] = useState('Strategy Talk');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ threads: ForumThreadSummary[]; categories: string[] }>('/api/forum')
      .then((data) => {
        setThreads(data.threads);
        setCategories(data.categories);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  const filtered = useMemo(() => {
    let list = threads ?? [];
    if (category !== 'All') list = list.filter((thread) => thread.category === category);
    if (query.trim()) {
      const needle = query.toLowerCase();
      list = list.filter(
        (thread) =>
          thread.title.toLowerCase().includes(needle) ||
          thread.excerpt.toLowerCase().includes(needle) ||
          thread.author.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [threads, category, query]);

  const createThread = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api<{ thread: ForumThread }>('/api/forum', {
        body: { title, body, category: threadCategory },
      });
      setThreads((current) => [result.thread, ...(current ?? [])]);
      setTitle('');
      setBody('');
      setComposer(false);
      setNotice('Thread published.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Forum"
          title="The build room."
          lead="Strategy notes, upload questions, bug reports and rule proposals. Keep it useful, keep it civil."
          actions={
            <>
              <Link to="/chat" className="btn btn-outline btn-sm">
                Live lounge
              </Link>
              {user ? (
                <button className="btn btn-primary btn-sm" onClick={() => setComposer((value) => !value)}>
                  <Icon name="plus" size={13} /> New thread
                </button>
              ) : (
                <Link to="/login?next=/forum" className="btn btn-primary btn-sm">
                  Sign in to post
                </Link>
              )}
            </>
          }
        />

        {composer && (
          <form className="panel forum-composer" onSubmit={createThread}>
            <div className="panel-head">
              <h3>Start a thread</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setComposer(false)}>
                Cancel
              </button>
            </div>
            <div className="form-row-2">
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={120} required placeholder="What are you testing this season?" />
              </label>
              <label>
                Category
                <select value={threadCategory} onChange={(event) => setThreadCategory(event.target.value)}>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Post
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                minLength={10}
                maxLength={6000}
                required
                placeholder="Share the setup, the result and what you learned."
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Publishing…' : 'Publish thread'}
              </button>
            </div>
          </form>
        )}

        {notice && <p className="form-success">{notice}</p>}
        {error && !composer && <p className="form-error">{error}</p>}

        <div className="forum-layout">
          <aside className="forum-sidebar">
            <div className="panel">
              <h3>Categories</h3>
              <button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>
                All discussions <span>{threads?.length ?? 0}</span>
              </button>
              {categories.map((value) => (
                <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>
                  {value}
                  <span>{(threads ?? []).filter((thread) => thread.category === value).length}</span>
                </button>
              ))}
            </div>
            <div className="panel forum-netiquette">
              <h3>House rules</h3>
              <p>No financial advice, no solicitation, no leaked code. Post reproducible results and respect the paper-only nature of the arena.</p>
              <Link to="/rules" className="text-link">
                Full rules →
              </Link>
            </div>
          </aside>

          <section className="forum-main">
            <div className="forum-toolbar">
              <input
                className="search-field"
                placeholder="Search threads"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search threads"
              />
              <span className="muted">{filtered.length} threads</span>
            </div>

            {!threads && <Skeleton lines={8} />}
            <div className="thread-list">
              {filtered.map((thread) => (
                <Link to={`/forum/${thread.id}`} className="thread-row" key={thread.id}>
                  <div className="thread-main">
                    <div className="thread-flags">
                      {thread.pinned && <span className="badge badge-accent">Pinned</span>}
                      <span className="badge badge-soft">{thread.category}</span>
                    </div>
                    <h3>{thread.title}</h3>
                    <p>{thread.excerpt}</p>
                    <div className="thread-meta">
                      <span>
                        {thread.author} <PlanBadge plan={thread.authorPlan} />
                      </span>
                      <span>{timeAgo(thread.lastAt)}</span>
                      <span>{thread.tags.map((tag) => `#${tag}`).join(' ')}</span>
                    </div>
                  </div>
                  <div className="thread-stats">
                    <span>
                      <strong>{thread.replies}</strong> replies
                    </span>
                    <span>
                      <strong>{thread.views}</strong> views
                    </span>
                    <span>
                      <strong>{thread.likes}</strong> likes
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {threads && !filtered.length && <p className="table-empty">No threads match that filter.</p>}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
