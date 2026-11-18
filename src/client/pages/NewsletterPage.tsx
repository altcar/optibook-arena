import { useEffect, useState } from 'react';
import type { NewsletterIssue } from '../../shared/types';
import { api, errorMessage, formatDate } from '../api';
import { useAuth } from '../auth';
import { PageShell, Skeleton } from '../shell';
import { Icon } from '../components/Icons';

export default function NewsletterPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<NewsletterIssue[] | null>(null);
  const [subscribers, setSubscribers] = useState(8420);
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState(user?.email ?? '');
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ issues: NewsletterIssue[]; subscribers: number; subscribed: boolean }>('/api/newsletter')
      .then((data) => {
        setIssues(data.issues);
        setSubscribers(data.subscribers);
        setSubscribed(data.subscribed);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const subscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ subscribers: number }>('/api/newsletter', { body: { email } });
      setSubscribers(result.subscribers);
      setSubscribed(true);
      setNotice('You are on the list. The next issue lands after the season reset.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="content-wrap">
        <section className="newsletter-hero">
          <div>
            <span className="eyebrow">The Basis Premium</span>
            <h1>Season notes for people who ship bots.</h1>
            <p>
              One email every two weeks: leaderboard teardowns, rule changes, upload examples and the occasional
              post-mortem. No price alerts, no signals, no hype.
            </p>
            <div className="newsletter-proof">
              <span className="avatar-stack">
                <span>Q</span>
                <span>D</span>
                <span>T</span>
                <span>B</span>
              </span>
              <span>Joined by {subscribers.toLocaleString()} traders</span>
            </div>
          </div>
          <form className="newsletter-form" onSubmit={subscribe}>
            <h3>{subscribed ? 'You are subscribed' : 'Subscribe free'}</h3>
            <p>{subscribed ? 'Check your inbox for the latest issue.' : 'Email only. Unsubscribe any time.'}</p>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              disabled={subscribed}
              aria-label="Email address"
            />
            <button className="btn btn-primary btn-block" disabled={busy || subscribed}>
              {busy ? 'Subscribing…' : subscribed ? 'Subscribed' : 'Get the newsletter'}
            </button>
            {error && <p className="form-error">{error}</p>}
            {notice && <p className="form-success">{notice}</p>}
            <span className="fine-print">By subscribing you agree to the platform rules and privacy note.</span>
          </form>
        </section>

        <section className="newsletter-issues">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">Archive</span>
              <h2>Recent issues</h2>
            </div>
            <span className="muted">{issues?.length ?? 0} published</span>
          </div>
          {!issues && <Skeleton lines={8} />}
          {issues?.map((issue) => (
            <article className="issue-card" key={issue.id}>
              <div className="issue-number">
                <span>Issue</span>
                <strong>{issue.number}</strong>
              </div>
              <div className="issue-main">
                <div className="issue-meta">
                  <span>{formatDate(issue.publishedAt)}</span>
                  <span>{issue.readTime}</span>
                </div>
                <h3>{issue.title}</h3>
                <p className="issue-subject">{issue.subject}</p>
                <p>{issue.summary}</p>
                {openIssue === issue.id && (
                  <ul className="issue-highlights">
                    {issue.highlights.map((highlight) => (
                      <li key={highlight}>
                        <Icon name="check" size={13} /> {highlight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenIssue(openIssue === issue.id ? null : issue.id)}>
                {openIssue === issue.id ? 'Hide contents' : 'View contents'}
              </button>
            </article>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
