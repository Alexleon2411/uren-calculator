import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import type { Bootstrap, DataStats, User, Workspace } from './types';
import { currentYearMonth, monthPath } from './dates';
import { Logo } from './components/Logo';

interface AuthContextValue {
  boot: Bootstrap | null;
  loading: boolean;
  error: string | null;
  user: User | null;
  workspace: Workspace | null;
  today: string;
  stats: DataStats;
  needsSetup: boolean;
  refresh: () => Promise<void>;
  apply: (data: Bootstrap) => void;
  logout: () => Promise<void>;
  homePath: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_STATS: DataStats = { days: 0, firstDate: null, lastDate: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.bootstrap();
      setBoot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setBoot((current) => (current
        ? { ...current, user: null }
        : current));
    }
  }, []);

  const apply = useCallback((data: Bootstrap) => {
    setBoot(data);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const current = boot;
    const today = current?.today || (() => {
      const local = currentYearMonth();
      return `${local.year}-${String(local.month).padStart(2, '0')}-01`;
    })();
    const date = current?.today ? new Date(`${current.today}T00:00:00Z`) : null;
    const homePath = date
      ? monthPath(date.getUTCFullYear(), date.getUTCMonth() + 1)
      : monthPath(currentYearMonth().year, currentYearMonth().month);
    return {
      boot: current,
      loading,
      error,
      user: current?.user || null,
      workspace: current?.workspace || null,
      today: current?.today || today,
      stats: current?.stats || EMPTY_STATS,
      needsSetup: Boolean(current?.needsSetup),
      refresh,
      apply,
      logout,
      homePath: current?.user ? homePath : '/login',
    };
  }, [boot, loading, error, refresh, apply, logout]);

  if (loading && !boot) {
    return (
      <div className="boot-screen">
        <Logo size="lg" />
        <div className="boot-line">
          <span className="spinner" />
          Opening your time log…
        </div>
      </div>
    );
  }

  if (error && !boot) {
    return (
      <div className="boot-screen">
        <Logo size="lg" />
        <div className="boot-error">
          <strong>Could not reach the server</strong>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
