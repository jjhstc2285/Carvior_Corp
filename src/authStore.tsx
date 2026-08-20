import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from './lib/auth';

const AUTH_STORAGE_KEY = 'attendance-app-auth-v1';

interface AuthStore {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  linkEmployee: (employeeId: string, name: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthStore | null>(null);

function loadUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());

  useEffect(() => {
    if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [user]);

  const value: AuthStore = {
    user,
    login: (u) => setUser(u),
    linkEmployee: (employeeId, name) => setUser(u => (u ? { ...u, employeeId, name } : u)),
    logout: () => setUser(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
