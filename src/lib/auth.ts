import { api, setToken } from './api';
import type { Role } from '../types';

export type AuthProvider = 'KAKAO' | 'NAVER' | 'LOCAL';

export interface AuthUser {
  id: string; // 직원 id
  name: string;
  position: string;
  role: Role;
  provider: AuthProvider | null;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser & { linked: true };
}

interface PendingResponse {
  linked: false;
  pendingToken: string;
}

/** 관리자 계정 로그인 (아이디 + 비밀번호) */
export async function loginWithPassword(loginId: string, password: string): Promise<AuthUser> {
  const res = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { loginId, password },
    skipAuthRedirect: true,
  });
  setToken(res.accessToken);
  return res.user;
}

/**
 * 소셜 로그인.
 *
 * TODO: 카카오/네이버 개발자센터에서 앱 등록 후 실제 SDK로 교체.
 *   카카오 — Kakao.Auth.login() → Kakao.API.request('/v2/user/me')
 *   네이버 — naver_id_login → /v1/nid/me
 * 지금은 SDK가 준 프로필을 서버로 넘기는 뒷부분만 구현돼 있다.
 */
export async function loginWithSocial(
  provider: 'KAKAO' | 'NAVER',
  profile: { providerId: string; name?: string },
): Promise<AuthUser | { linked: false; pendingToken: string }> {
  const res = await api<LoginResponse | PendingResponse>('/auth/social', {
    method: 'POST',
    body: { provider, providerId: profile.providerId, name: profile.name },
    skipAuthRedirect: true,
  });

  if ('linked' in res && res.linked === false) return res;

  const ok = res as LoginResponse;
  setToken(ok.accessToken);
  return ok.user;
}

/** 소셜 계정을 사내 직원과 연결 */
export async function linkSocialToEmployee(pendingToken: string, employeeId: string): Promise<AuthUser> {
  const res = await api<LoginResponse>('/auth/link', {
    method: 'POST',
    body: { pendingToken, employeeId },
    skipAuthRedirect: true,
  });
  setToken(res.accessToken);
  return res.user;
}

/** 저장된 토큰으로 현재 로그인 상태 복구 */
export async function fetchMe(): Promise<AuthUser> {
  return api<AuthUser>('/auth/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api<void>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
}

export function logoutLocal(): void {
  setToken(null);
}
