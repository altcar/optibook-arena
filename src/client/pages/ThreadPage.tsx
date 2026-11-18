import { useEffect, useState } from 'react';
import type { ForumThread } from '../../shared/types';
import { api, errorMessage, formatDateTime, timeAgo } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';
import { PageShell, PlanBadge, Skeleton } from '../shell';
import { Icon } from '../components/Icons';

export default function ThreadPage({ id }: { id: string }) {
  const { user } = useAuth();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ thread: ForumThread }>(`/api/forum/${id}`)
      .then((data) => setThread(data.thread))
      .catch((reason) => setError(errorMessage(reason)));
  }, [id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!thread) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ thread: ForumThread }>(`/api/forum/${thread.id}/reply`, { body: { body: reply } });
      setThread(result.thread);
      setReply('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="content-wrap narrow">
        <Link to="/forum" className="back-link">
          ← Forum
        </Link>
        {error && <p className="form-error">{error}</p>}
        {!thread ? (
          <Skeleton lines={10} />
        ) : (
          <>
            <header className="thread-detail-head">
              <div className="thread-flags">
                {thread.pinned && <span className="badge badge-accent">Pinned</span>}
                <span className="badge badge-soft">{thread.category}</span>
              </div>
              <h1>{thread.title}</h1>
              <div className="thread-meta">
                <span>
                  {thread.author} <PlanBadge plan={thread.authorPlan} />
                </span>
                <span>{formatDateTime(thread.createdAt)}</span>
                <span>{thread.views} views</span>
                <span>{thread.replies} replies</span>
              </div>
            </header>

            <div className="post-list">
              {thread.posts.map((post, index) => (
                <article className={`post-card ${post.staff ? 'staff' : ''}`} key={post.id}>
                  <div className="post-head">
                    <span className="avatar">{post.author.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>
                        {post.author} <PlanBadge plan={post.authorPlan} />
                      </strong>
                      <span>{index === 0 ? 'opened the thread' : timeAgo(post.createdAt)}</span>
                    </div>
                    <span className="post-likes">
                      <Icon name="up" size={13} /> {post.likes}
                    </span>
                  </div>
                  <div className="post-body">
                    {post.body.split('\n').map((line, lineIndex) => (
                      <p key={lineIndex}>{line || '\u00a0'}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <section className="panel reply-panel">
              <h3>Reply to the thread</h3>
              {user ? (
                <form onSubmit={submit}>
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={4}
                    required
                    minLength={2}
                    maxLength={6000}
                    placeholder="Add a result, a question or a correction."
                  />
                  <div className="form-actions">
                    <button className="btn btn-primary" disabled={busy}>
                      {busy ? 'Posting…' : 'Post reply'}
                    </button>
                  </div>
                </form>
              ) : (
                <p>
                  <Link to={`/login?next=/forum/${thread.id}`} className="text-link">
                    Sign in
                  </Link>{' '}
                  to join the discussion.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
