import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccountSummary, AuthResponse, SessionUser } from '../shared/types';
import { api } from './api';

interface AuthValue {
  user: SessionUser | null;
  account: AccountSummary | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setAccount: (account: AccountSummary) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: SessionUser | null; account?: AccountSummary }>('/api/auth/me');
      setUser(result.user);
      setAccount(result.account ?? null);
    } catch {
      setUser(null);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (loginValue: string, password: string) => {
    const result = await api<AuthResponse>('/api/auth/login', { body: { login: loginValue, password } });
    setUser(result.user);
    setAccount(result.account);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const result = await api<AuthResponse>('/api/auth/register', { body: { username, email, password } });
    setUser(result.user);
    setAccount(result.account);
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { body: {} }).catch(() => undefined);
    setUser(null);
    setAccount(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, account, loading, login, register, logout, refresh, setAccount }),
    [user, account, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
