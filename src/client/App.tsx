import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Link, navigate, useLocation } from './router';
import { PageShell, SiteNav } from './shell';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import BotsPage from './pages/BotsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import SeasonsPage from './pages/SeasonsPage';
import SeasonPage from './pages/SeasonPage';
import TournamentsPage from './pages/TournamentsPage';
import ForumPage from './pages/ForumPage';
import ChatPage from './pages/ChatPage';
import ThreadPage from './pages/ThreadPage';
import NewsletterPage from './pages/NewsletterPage';
import RulesPage from './pages/RulesPage';
import PricingPage from './pages/PricingPage';
import StackPage from './pages/StackPage';
import DocsBotsPage from './pages/DocsBotsPage';
import LivePage from './pages/LivePage';
import { Logo } from './components/Icons';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, { replace: true });
    }
  }, [loading, user]);
  if (loading) {
    return (
      <div className="boot-screen">
        <Logo size={48} />
        <h1>OPTIBOOK ARENA</h1>
        <span className="boot-status">Checking your session…</span>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}

function NotFound() {
  return (
    <PageShell>
      <div className="content-wrap not-found">
        <span className="eyebrow">404</span>
        <h1>That book is empty.</h1>
        <p>The page you are looking for is not on the venue.</p>
        <Link to="/" className="btn btn-primary">
          Back to the arena
        </Link>
      </div>
    </PageShell>
  );
}

function Routes() {
  const location = useLocation();
  const path = location.split('?')[0];

  if (path === '/') return <LandingPage />;
  if (path === '/login') return <AuthPage mode="login" />;
  if (path === '/register') return <AuthPage mode="register" />;
  if (path === '/dashboard')
    return (
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    );
  if (path === '/bots')
    return (
      <RequireAuth>
        <BotsPage />
      </RequireAuth>
    );
  if (path === '/leaderboard') return <LeaderboardPage />;
  if (path === '/seasons') return <SeasonsPage />;
  if (path.startsWith('/season/')) {
    const id = Number(path.split('/')[2]);
    if (Number.isFinite(id)) return <SeasonPage id={id} />;
  }
  if (path === '/tournaments') return <TournamentsPage />;
  if (path === '/forum') return <ForumPage />;
  if (path === '/chat') return <ChatPage />;
  if (path.startsWith('/forum/')) {
    const id = path.split('/')[2];
    if (id) return <ThreadPage id={id} />;
  }
  if (path === '/newsletter') return <NewsletterPage />;
  if (path === '/rules') return <RulesPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/stack') return <StackPage />;
  if (path === '/docs/bots') return <DocsBotsPage />;
  if (path === '/live') return <LivePage />;
  return <NotFound />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
