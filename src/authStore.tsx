import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, UNAUTHORIZED_EVENT } from './lib/api';
import { fetchMe, logoutLocal, type AuthUser } from './lib/auth';
import { connectSocket, disconnectSocket } from './lib/socket';
import { syncPushSubscription } from './lib/push';
import { bootChannelTalk, shutdownChannelTalk } from './lib/channelTalk';

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
      // 로그아웃하면 상담 위젯도 내린다 — 다음 사람에게 앞사람 대화가 남지 않게.
      shutdownChannelTalk();
      return;
    }
    connectSocket();
    // 문의한 사람이 누군지 상담 화면에서 바로 보이게 이름·직급을 넘긴다.
    bootChannelTalk(user);
    // 이미 알림을 켜둔 기기면 구독을 서버에 다시 저장한다 —
    // 같은 기기에서 계정을 바꿔 로그인한 경우 알림이 엉뚱한 사람에게 가지 않게.
    void syncPushSubscription();
    // 사용기록을 지워 단말 키가 날아갔으면 사무실 안에서 조용히 되찾는다.
    return () => {
      disconnectSocket();
      shutdownChannelTalk();
    };
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
