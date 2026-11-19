import { useEffect, useState, type ReactNode } from 'react';
import type { Plan } from '../shared/types';
import { useAuth } from './auth';
import { Link, navigate, useLocation } from './router';
import { Icon, Logo } from './components/Icons';

interface NavItem {
  to: string;
  label: string;
  desc?: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Compete',
    items: [
      { to: '/live', label: 'Live arena', desc: 'Watch the synthetic venue stream' },
      { to: '/leaderboard', label: 'Leaderboard', desc: 'P&L, win rate and Sharpe' },
      { to: '/tournaments', label: 'Tournaments', desc: 'Short-format competitions' },
    ],
  },
  {
    label: 'Seasons',
    items: [
      { to: '/seasons', label: 'Current season', desc: 'Season 15 · Basis Run' },
      { to: '/season/15', label: 'Season hub', desc: 'Rules, standings and payouts' },
      { to: '/rules#scoring', label: 'Scoring', desc: 'How P&L, win rate and ties work' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/forum', label: 'Forum', desc: 'Strategy notes and bug reports' },
      { to: '/chat', label: 'Live lounge', desc: 'Real-time chat with other traders' },
      { to: '/newsletter', label: 'Newsletter', desc: 'The Basis Premium archive' },
    ],
  },
  {
    label: 'Docs',
    items: [
      { to: '/docs/bots', label: 'Bot upload spec', desc: 'JSON schema, triggers and actions' },
      { to: '/stack', label: 'The Stack', desc: 'How the arena is built' },
      { to: '/rules', label: 'Platform rules', desc: 'Eligibility, conduct and appeals' },
    ],
  },
];

export function SiteNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
    setGroup(null);
  }, [location]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGroup(null);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isActive = (to: string) => {
    const base = to.split('#')[0];
    return location === base || (base !== '/' && location.startsWith(`${base}/`));
  };
  const groupActive = (items: NavItem[]) => items.some((item) => isActive(item.to));

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link to="/" className="site-logo" aria-label="Optibook Arena home">
          <Logo size={34} />
          <span>
            OPTIBOOK <em>ARENA</em>
          </span>
        </Link>

        <nav className={`site-links ${open ? 'is-open' : ''}`} aria-label="Primary">
          {NAV_GROUPS.map((navGroup) => (
            <div
              key={navGroup.label}
              className={`nav-group ${group === navGroup.label ? 'open' : ''} ${
                groupActive(navGroup.items) ? 'active' : ''
              }`}
            >
              <button
                className="nav-group-btn"
                aria-expanded={group === navGroup.label}
                onClick={() => setGroup((current) => (current === navGroup.label ? null : navGroup.label))}
              >
                {navGroup.label}
                <Icon name="chevron" size={12} />
              </button>
              <div className="nav-dropdown">
                {navGroup.items.map((item) => (
                  <Link key={`${navGroup.label}-${item.to}-${item.label}`} to={item.to}>
                    <strong>{item.label}</strong>
                    {item.desc && <span>{item.desc}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link to="/pricing" className={`nav-pricing ${isActive('/pricing') ? 'active' : ''}`}>
            Pricing
          </Link>
        </nav>

        <div className="site-actions">
          <Link to="/newsletter" className="nav-newsletter hide-mobile">
            Newsletter
          </Link>
          {user ? (
            <div className="user-menu">
              <button className="user-chip" onClick={() => setMenu((value) => !value)} aria-expanded={menu}>
                <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
                <span className="user-chip-name">{user.username}</span>
                <span className={`plan-dot plan-${user.plan}`}>{user.plan}</span>
                <Icon name="chevron" size={13} />
              </button>
              {menu && (
                <div className="user-dropdown">
                  <Link to="/dashboard">Dashboard</Link>
                  <Link to="/bots">My bots</Link>
                  <Link to="/chat">Live lounge</Link>
                  <Link to="/pricing#billing">Billing &amp; plan</Link>
                  <button
                    onClick={() => {
                      void logout().then(() => navigate('/'));
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Create account
              </Link>
            </>
          )}
          <button className="mobile-toggle" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <Logo size={36} />
          <div>
            <strong>OPTIBOOK ARENA</strong>
            <p>Paper-trading competition for developer-built trading bots.</p>
            <span className="badge badge-soft">Simulation only · no real money</span>
          </div>
        </div>
        <div className="footer-cols">
          <div>
            <h4>Compete</h4>
            <Link to="/live">Live arena</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/seasons">Seasons</Link>
            <Link to="/tournaments">Tournaments</Link>
          </div>
          <div>
            <h4>Build</h4>
            <Link to="/docs/bots">Bot upload spec</Link>
            <Link to="/docs/bots">Strategy families</Link>
            <Link to="/stack">The Stack</Link>
            <Link to="/bots">Bot console</Link>
          </div>
          <div>
            <h4>Community</h4>
            <Link to="/forum">Forum</Link>
            <Link to="/chat">Live lounge</Link>
            <Link to="/newsletter">Newsletter</Link>
            <Link to="/rules">Platform rules</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© 2026 Optibook Arena · Built on Cloudflare Workers</span>
        <div>
          <Link to="/rules">Rules</Link>
          <Link to="/pricing">Pricing</Link>
          <a href="https://github.com/altcar/optibook-arena" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`site-shell ${className}`}>
      <SiteNav />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label =
    status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : status === 'past' || status === 'completed' ? 'Final' : status;
  return <span className={`status-badge status-${status}`}>{label}</span>;
}

export function PlanBadge({ plan }: { plan: Plan | 'staff' }) {
  return <span className={`plan-badge plan-${plan}`}>{plan === 'staff' ? 'Staff' : plan}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name="layers" size={26} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} style={{ width: `${70 + ((index * 13) % 30)}%` }} />
      ))}
    </div>
  );
}
