import { useEffect, useState } from 'react';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { Link, navigate, useLocation } from '../router';
import { Logo } from '../components/Icons';

function nextPath(): string {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  return next && next.startsWith('/') ? next : '/dashboard';
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, user } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(nextPath(), { replace: true });
  }, [user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(loginValue, password);
      else await register(username, email, password);
      navigate(nextPath(), { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-aside">
        <Link to="/" className="site-logo">
          <Logo size={38} />
          <span>
            OPTIBOOK <em>ARENA</em>
          </span>
        </Link>
        <div className="auth-aside-copy">
          <span className="eyebrow">Season 15 · Basis Run</span>
          <h1>Build the bot. Climb the board.</h1>
          <p>
            A paper-trading arena for developers. Six strategy families, ten instruments, seasons, tournaments and a
            leaderboard that updates tick by tick.
          </p>
          <div className="auth-aside-stats">
            <span>
              <strong>10</strong> instruments
            </span>
            <span>
              <strong>6</strong> families
            </span>
            <span>
              <strong>$25k</strong> prizes
            </span>
          </div>
        </div>
        <ul className="auth-points">
          <li>✓ $100,000 simulated capital, isolated per account</li>
          <li>✓ Upload declarative JSON bots with risk rails</li>
          <li>✓ No deposits, no stakes, no real-money execution</li>
        </ul>
        <p className="auth-fine">Simulation only. A paper track record is not a promise of real-world returns.</p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create your account'}</span>
            <h2>{mode === 'login' ? 'Sign in to the arena' : 'Start competing free'}</h2>
            <p>
              {mode === 'login'
                ? 'Use your username or email. Your paper account is waiting.'
                : 'One account, $100,000 in paper capital and two free bot slots.'}
            </p>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === 'login' ? (
              <label>
                Username or email
                <input
                  name="login"
                  autoComplete="username"
                  value={loginValue}
                  onChange={(event) => setLoginValue(event.target.value)}
                  required
                  placeholder="basisbandit"
                />
              </label>
            ) : (
              <>
                <label>
                  Username
                  <input
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_]+"
                    placeholder="basisbandit"
                  />
                  <span className="field-hint">3–20 characters, letters, numbers or underscore.</span>
                </label>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </label>
              </>
            )}
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? (
              <>
                New to the arena? <Link to="/register">Create a free account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to={`/login${location.includes('?') ? location.slice(location.indexOf('?')) : ''}`}>Sign in</Link>
              </>
            )}
          </p>

          <p className="auth-terms">
            By continuing you agree to the <Link to="/rules">platform rules</Link>. Optibook Arena is a simulation;
            nothing here is investment advice.
          </p>
        </div>
      </div>
    </div>
  );
}
