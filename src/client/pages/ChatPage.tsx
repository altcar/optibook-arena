import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { Link } from '../router';
import { PageHeader, PageShell, PlanBadge } from '../shell';
import { useChat } from '../useChat';
import { Icon } from '../components/Icons';

const PLAN_ORDER: Record<string, number> = { staff: 3, desk: 2, pro: 1, free: 0 };

export default function ChatPage() {
  const { user } = useAuth();
  const { messages, online, status, error, send } = useChat();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (send(body)) setDraft('');
  };

  return (
    <PageShell>
      <div className="content-wrap">
        <PageHeader
          eyebrow="Community · Live lounge"
          title="Talk to the people building the bots."
          lead="A real-time lounge for strategy notes, upload questions and season chatter. Read without an account; sign in to post."
          actions={
            <span className={`live-pill ${status === 'live' ? 'live' : status}`}>
              <span className="live-dot" /> {status === 'live' ? `${online} online` : status}
            </span>
          }
        />

        <div className="chat-layout">
          <section className="panel chat-panel">
            <div className="panel-head chat-head">
              <div>
                <span className="panel-kicker">ARENA LOUNGE</span>
                <h3>Live chat</h3>
              </div>
              <span className="chat-online">
                <span className={`bot-state ${status === 'live' ? 'active' : 'paused'}`} />
                {online} online
              </span>
            </div>

            <div className="chat-messages" ref={listRef} data-testid="chat-messages">
              {messages.map((message) => (
                <article
                  className={`chat-message ${message.staff ? 'staff' : ''} ${message.userId && message.userId === user?.id ? 'mine' : ''}`}
                  key={message.id}
                  data-testid="chat-message"
                >
                  <span className="avatar">{message.username.slice(0, 1).toUpperCase()}</span>
                  <div className="chat-bubble">
                    <div className="chat-meta">
                      <strong>{message.username}</strong>
                      <PlanBadge plan={message.plan} />
                      <span>{new Date(message.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p>{message.body}</p>
                  </div>
                </article>
              ))}
              {!messages.length && <p className="chat-empty">Connecting to the lounge…</p>}
            </div>

            <div className="chat-composer">
              {user ? (
                <form onSubmit={submit}>
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={500}
                    placeholder="Share a result, ask a question, or say hello…"
                    aria-label="Chat message"
                    data-testid="chat-input"
                  />
                  <button className="btn btn-primary" type="submit" disabled={status !== 'live' || !draft.trim()}>
                    <Icon name="send" size={14} /> Send
                  </button>
                </form>
              ) : (
                <div className="chat-signin">
                  <p>Sign in to join the conversation. Reading is open to everyone.</p>
                  <Link to="/login?next=/chat" className="btn btn-primary btn-sm">
                    Sign in to chat
                  </Link>
                  <Link to="/register?next=/chat" className="btn btn-outline btn-sm">
                    Create account
                  </Link>
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
              <p className="chat-note">
                Public and moderated. No financial advice, no solicitations, no personal data. Messages are limited to
                500 characters and one every 1.5 seconds.
              </p>
            </div>
          </section>

          <aside className="chat-aside">
            <div className="panel chat-about">
              <h3>Lounge rules</h3>
              <ul>
                <li>Be useful: share reproducible results and exact parameters.</li>
                <li>No signals, solicitations or “DM me for alpha”.</li>
                <li>No another trader's private code or personal data.</li>
                <li>Report bugs in the forum so they can be tracked.</li>
              </ul>
              <Link to="/rules" className="text-link">
                Full community rules →
              </Link>
            </div>
            <div className="panel chat-about">
              <h3>Who is here</h3>
              <div className="chat-plan-list">
                {Object.entries(
                  messages.reduce<Record<string, number>>((acc, message) => {
                    const key = message.staff ? 'staff' : message.plan;
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => (PLAN_ORDER[b[0]] ?? 0) - (PLAN_ORDER[a[0]] ?? 0))
                  .map(([plan, count]) => (
                    <div key={plan}>
                      <PlanBadge plan={plan === 'staff' ? 'staff' : (plan as 'free' | 'pro' | 'desk')} />
                      <span>{count} messages</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="panel chat-about">
              <h3>Prefer long form?</h3>
              <p>Strategy write-ups and bug reports live in the forum. The lounge is for quick questions and season chatter.</p>
              <Link to="/forum" className="btn btn-outline btn-sm">
                Open the forum
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
