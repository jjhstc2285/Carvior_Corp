import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, UNAUTHORIZED_EVENT } from './lib/api';
import { fetchMe, logoutLocal, type AuthUser } from './lib/auth';
import { connectSocket, disconnectSocket } from './lib/socket';

interface AuthStore {
  user: AuthUser | null;
  /** 저장된 토큰으로 세션 복구를 시도하는 동안 true */
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 새로고침해도 로그인이 유지되게, 저장된 토큰으로 내 정보를 다시 받아온다.
  // 서버에서 확인하므로 퇴사·권한변경이 즉시 반영된다.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 토큰이 만료되면 API 계층이 이 이벤트를 쏜다 → 로그인 화면으로
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // 실시간 채널은 로그인 상태에만 붙여둔다. 소켓 인증에 로그인 토큰을 쓰므로
  // 로그인 이후에 붙여야 하고, 로그아웃하면 남의 알림이 흘러들지 않게 끊는다.
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }
    connectSocket();
    return () => disconnectSocket();
  }, [user]);

  const logout = useCallback(() => {
    logoutLocal();
    setUser(null);
  }, []);

  const value = useMemo<AuthStore>(() => ({ user, loading, login: setUser, logout }), [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
