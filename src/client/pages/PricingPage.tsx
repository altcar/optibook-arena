import { useState } from 'react';
import { Link } from '../router';
import { PageShell } from '../shell';
import { Icon } from '../components/Icons';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'For one trader learning the venue and shipping a first bot.',
    cta: 'Create free account',
    to: '/register',
    features: ['1 account', '2 active bots', 'All six strategy families', 'Open division', 'Public seasons & tournaments', 'Forum + newsletter'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    cadence: 'per month',
    blurb: 'For competitors who want more bot slots and the Raised division.',
    cta: 'Start with Pro',
    to: '/register?plan=pro',
    featured: true,
    features: ['10 active bots', 'Raised division eligibility', 'Priority tournament entry', 'Round-history CSV export', 'Private practice league', 'Everything in Free'],
  },
  {
    id: 'desk',
    name: 'Desk',
    price: '$99',
    cadence: 'per month',
    blurb: 'For teams running a stable of strategies and private events.',
    cta: 'Talk to us',
    to: '/register?plan=desk',
    features: ['50 active bots', '5 named team seats', 'Private leagues & branded events', 'Team leaderboard and audit log', 'API read access', 'Everything in Pro'],
  },
];

const FAQ = [
  [
    'Is this real money?',
    'No. Every balance, fill and prize is simulated. Optibook Arena is a paper-trading competition, not a broker. Paid plans buy software features, not capital.',
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
    'Yes. Paid plans are monthly and can be cancelled at any time. Access continues to the end of the paid period. No refunds for partial months.',
  ],
  [
    'How are prizes paid?',
    'Prizes are simulated credits with no cash value. They can be applied to plan discounts, tournament entries or recognition. They are not withdrawable.',
  ],
];

export default function PricingPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <PageShell>
      <div className="content-wrap">
        <header className="pricing-head">
          <span className="eyebrow">Pricing</span>
          <h1>Free to compete. Paid to scale.</h1>
          <p>
            The arena is free forever for one account and two bots. Pro and Desk add slots, divisions and team tooling.
            No plan changes the market, the fills or the scoring formula.
          </p>
          <div className="pricing-note">
            <Icon name="shield" size={15} /> Billing is disabled during the public beta. Plans shown are the intended
            launch pricing.
          </div>
        </header>

        <div className="pricing-grid">
          {PLANS.map((plan) => (
            <article className={`pricing-card ${plan.featured ? 'featured' : ''}`} key={plan.id}>
              {plan.featured && <span className="pricing-flag">Most popular</span>}
              <h2>{plan.name}</h2>
              <div className="pricing-price">
                <strong>{plan.price}</strong>
                <span>{plan.cadence}</span>
              </div>
              <p>{plan.blurb}</p>
              <Link to={plan.to} className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-block`}>
                {plan.cta}
              </Link>
              <ul className="pricing-features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={13} /> {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

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
              <tr>
                <td>Active bots</td>
                <td>2</td>
                <td>10</td>
                <td>50</td>
              </tr>
              <tr>
                <td>Paper accounts</td>
                <td>1</td>
                <td>1</td>
                <td>5 seats</td>
              </tr>
              <tr>
                <td>Divisions</td>
                <td>Open</td>
                <td>Open + Raised</td>
                <td>Open + Raised</td>
              </tr>
              <tr>
                <td>Tournament priority</td>
                <td>—</td>
                <td>Yes</td>
                <td>Yes + private events</td>
              </tr>
              <tr>
                <td>Round history CSV</td>
                <td>—</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Private practice league</td>
                <td>—</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Team leaderboard / audit log</td>
                <td>—</td>
                <td>—</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>API read access</td>
                <td>—</td>
                <td>—</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Support</td>
                <td>Community</td>
                <td>Email</td>
                <td>Priority</td>
              </tr>
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
