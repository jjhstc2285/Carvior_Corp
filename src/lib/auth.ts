import { api, setToken } from './api';
import type { Role } from '../types';

export type AuthProvider = 'KAKAO' | 'NAVER' | 'LOCAL';

export interface AuthUser {
  id: string; // 직원 id
  name: string;
  position: string;
  role: Role;
  provider: AuthProvider | null;
  /**
   * 소속 상사와 켜져 있는 모듈. 애니원모터스가 1번이다.
   *
   * 카비어가 이 프로그램을 여러 상사에게 주면서 생겼다 — 상사마다 쓰는 모듈이 달라서,
   * 메뉴를 코드가 아니라 이 목록으로 가른다.
   *
   * 옛 세션(이 기능 전에 로그인해 둔 사람)에는 없다. 없으면 전부 보여준다 —
   * 메뉴가 갑자기 비어 버리면 고장으로 받아들인다.
   */
  tenant?: {
    id: number;
    code: string;
    name: string;
    modules: string[];
  };
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
