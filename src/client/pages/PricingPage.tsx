import { useEffect, useState } from 'react';
import type { BillingInterval, BillingStatus, Plan } from '../../shared/types';
import { ApiError, api, errorMessage, formatDate } from '../api';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';
import { PageShell } from '../shell';
import { Icon } from '../components/Icons';

interface PlanCard {
  id: Plan;
  name: string;
  monthly: number;
  annual: number;
  blurb: string;
  featured?: boolean;
  features: string[];
}

const PLANS: PlanCard[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    blurb: 'For one trader learning the venue and shipping a first bot.',
    features: ['1 account', '2 active bots', 'All six strategy families', 'Open division', 'Public seasons & tournaments', 'Forum + live lounge + newsletter'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 19,
    annual: 190,
    blurb: 'For competitors who want more bot slots and the Raised division.',
    featured: true,
    features: ['10 active bots', 'Raised division eligibility', 'Priority tournament entry', 'Round-history CSV export', 'Private practice league', 'Everything in Free'],
  },
  {
    id: 'desk',
    name: 'Desk',
    monthly: 99,
    annual: 990,
    blurb: 'For teams running a stable of strategies and private events.',
    features: ['50 active bots', '5 named team seats', 'Private leagues & branded events', 'Team leaderboard and audit log', 'API read access', 'Everything in Pro'],
  },
];

const FAQ = [
  [
    'Is this real money?',
    'No. Every balance, fill and prize is simulated. Optibook Arena is a paper-trading competition, not a broker. Paid plans buy software features, not capital.',
  ],
  [
    'How does billing work?',
    'Subscriptions are handled by Stripe Checkout. You can cancel or update your card in the Stripe billing portal from this page. Prices are in USD and exclude local taxes.',
  ],
  [
    'Can I upload Python or JavaScript?',
    'Not in v1. Bots are declarative JSON specs so the engine can validate and run them safely. A WebAssembly sandbox for reviewed code is on the roadmap.',
  ],
  [
    'Do paid plans improve my score?',
    'No. Plans change bot slots, division eligibility and team features. Scoring rules are identical for everyone in a division.',
  ],
  [
    'What happens when a season ends?',
    'Positions are flattened, standings are archived and the next rule set starts. Bot code, account history and forum posts remain.',
  ],
  [
    'Can I cancel?',
    'Yes. Cancel in the billing portal at any time. Access continues to the end of the paid period. No refunds for partial months.',
  ],
  [
    'How are prizes paid?',
    'Prizes are simulated credits with no cash value. They can be applied to plan discounts, tournament entries or recognition. They are not withdrawable.',
  ],
];

function planPrice(plan: PlanCard, interval: BillingInterval): string {
  if (plan.id === 'free') return '$0';
  return interval === 'year' ? `$${plan.annual}` : `$${plan.monthly}`;
}

export default function PricingPage() {
  const { user, account, refresh } = useAuth();
  const [open, setOpen] = useState<number | null>(0);
  const [interval, setIntervalValue] = useState<BillingInterval>('month');
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState<Plan | 'portal' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user) {
      setBilling(null);
      return;
    }
    api<BillingStatus>('/api/billing')
      .then(setBilling)
      .catch(() => setBilling(null));
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('billing');
    if (state === 'cancelled') setNotice('Checkout cancelled. Your plan has not changed.');
    if (state === 'portal') setNotice('Returned from the billing portal.');
    if (state === 'success') {
      setNotice('Payment received. Your plan will update as soon as Stripe confirms the subscription.');
      void refresh();
    }
  }, [refresh]);

  const start = async (plan: Plan) => {
    setError('');
    setNotice('');
    if (plan === 'free') {
      navigate(user ? '/dashboard' : '/register');
      return;
    }
    if (!user) {
      navigate(`/register?next=${encodeURIComponent('/pricing')}&plan=${plan}`);
      return;
    }
    if (user.plan === plan) {
      await manage();
      return;
    }
    setBusy(plan);
    try {
      const result = await api<{ url: string }>('/api/billing/checkout', {
        body: { plan, interval },
      });
      window.location.assign(result.url);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 503) {
        setError(
          'Stripe is not configured on this deployment yet. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as Worker secrets, then retry. The rest of the platform is live.',
        );
      } else {
        setError(errorMessage(reason));
      }
    } finally {
      setBusy(null);
    }
  };

  const manage = async () => {
    if (!user) return;
    setError('');
    setNotice('');
    setBusy('portal');
    try {
      const result = await api<{ url: string }>('/api/billing/portal', { body: {} });
      window.location.assign(result.url);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 503) {
        setError('Stripe is not configured on this deployment yet.');
      } else {
        setError(errorMessage(reason));
      }
    } finally {
      setBusy(null);
    }
  };

  const annualSaving = Math.round(((19 * 12 - 190) / (19 * 12)) * 100);

  return (
    <PageShell>
      <div className="content-wrap">
        <header className="pricing-head" id="billing">
          <span className="eyebrow">Pricing</span>
          <h1>Free to compete. Paid to scale.</h1>
          <p>
            The arena is free forever for one account and two bots. Pro and Desk add slots, divisions and team tooling.
            No plan changes the market, the fills or the scoring formula.
          </p>
          <div className="billing-toggle-row">
            <div className="segmented billing-toggle" role="tablist" aria-label="Billing interval">
              <button
                className={interval === 'month' ? 'active' : ''}
                onClick={() => setIntervalValue('month')}
                role="tab"
                aria-selected={interval === 'month'}
              >
                Monthly
              </button>
              <button
                className={interval === 'year' ? 'active' : ''}
                onClick={() => setIntervalValue('year')}
                role="tab"
                aria-selected={interval === 'year'}
              >
                Annual <span className="save-pill">save {annualSaving}%</span>
              </button>
            </div>
          </div>
          <div className="pricing-note">
            <Icon name="shield" size={15} /> Secure subscriptions via Stripe · cancel anytime · no card stored by
            Optibook
          </div>
          {account?.plan && account.plan !== 'free' && (
            <div className="billing-current">
              <span>
                You are on <strong>{account.plan}</strong>
                {account.renewsAt ? ` · renews ${formatDate(account.renewsAt)}` : ''}
                {account.subscriptionStatus ? ` · ${account.subscriptionStatus}` : ''}
              </span>
              <button className="btn btn-outline btn-xs" onClick={() => void manage()} disabled={busy === 'portal'}>
                {busy === 'portal' ? 'Opening…' : 'Manage billing'}
              </button>
            </div>
          )}
        </header>

        {error && <p className="form-error billing-message">{error}</p>}
        {notice && !error && <p className="form-success billing-message">{notice}</p>}

        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const current = user?.plan === plan.id;
            const label =
              plan.id === 'free'
                ? current
                  ? 'Current plan'
                  : 'Create free account'
                : current
                  ? 'Manage billing'
                  : `Start with ${plan.name}`;
            return (
              <article className={`pricing-card ${plan.featured ? 'featured' : ''}`} key={plan.id}>
                {plan.featured && <span className="pricing-flag">Most popular</span>}
                <h2>{plan.name}</h2>
                <div className="pricing-price">
                  <strong>{planPrice(plan, interval)}</strong>
                  <span>{plan.id === 'free' ? 'forever' : interval === 'year' ? 'per year' : 'per month'}</span>
                </div>
                {plan.id !== 'free' && interval === 'year' && (
                  <span className="annual-equivalent">
                    ${(plan.annual / 12).toFixed(2)}/month billed annually
                  </span>
                )}
                <p>{plan.blurb}</p>
                <button
                  className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-block`}
                  onClick={() => void start(plan.id)}
                  disabled={busy !== null || (current && plan.id === 'free')}
                  data-testid={`plan-${plan.id}`}
                >
                  {busy === plan.id ? 'Opening Stripe…' : label}
                </button>
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Icon name="check" size={13} /> {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        {billing && !billing.configured && (
          <p className="billing-config-note">
            <Icon name="activity" size={14} /> Stripe keys are not set on this deployment. Checkout and the billing
            portal will return a configuration error until the Worker secrets are added.
          </p>
        )}

        <section className="pricing-compare">
          <h2>Compare plans</h2>
          <table className="data-table compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Pro</th>
                <th>Desk</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Active bots</td><td>2</td><td>10</td><td>50</td></tr>
              <tr><td>Paper accounts</td><td>1</td><td>1</td><td>5 seats</td></tr>
              <tr><td>Divisions</td><td>Open</td><td>Open + Raised</td><td>Open + Raised</td></tr>
              <tr><td>Tournament priority</td><td>—</td><td>Yes</td><td>Yes + private events</td></tr>
              <tr><td>Round history CSV</td><td>—</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Private practice league</td><td>—</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Team leaderboard / audit log</td><td>—</td><td>—</td><td>Yes</td></tr>
              <tr><td>API read access</td><td>—</td><td>—</td><td>Yes</td></tr>
              <tr><td>Support</td><td>Community</td><td>Email</td><td>Priority</td></tr>
            </tbody>
          </table>
        </section>

        <section className="pricing-faq">
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Questions before you build.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map(([question, answer], index) => (
              <div className={`faq-item ${open === index ? 'open' : ''}`} key={question}>
                <button onClick={() => setOpen(open === index ? null : index)}>
                  {question}
                  <Icon name="chevron" size={16} />
                </button>
                {open === index && <p>{answer}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="pricing-foot">
          <div>
            <h2>Need a private league?</h2>
            <p>Universities, trading societies and prop desks can run branded paper-trading events on the same engine.</p>
          </div>
          <a href="mailto:hello@optibook.example" className="btn btn-primary">
            Contact the team
          </a>
        </section>
      </div>
    </PageShell>
  );
}
