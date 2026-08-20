export type AuthProvider = 'kakao' | 'naver' | 'admin';
export type UserRole = 'employee' | 'admin';

export interface AuthUser {
  id: string; // provider가 준 고유 id (mock)
  provider: AuthProvider;
  name: string;
  role: UserRole;
  employeeId: string | null; // employee role인데 아직 사내 직원과 연결 안 됐으면 null
}

const DELAY_MS = 700;
function delay<T>(value: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), DELAY_MS));
}

// ⚠️ 목업 구현입니다. 실제 카카오/네이버 로그인은 각 개발자센터에서 앱 등록 후
// 발급받는 REST/JS API 키가 있어야 붙일 수 있어요(카카오: developers.kakao.com,
// 네이버: developers.naver.com). 여기서는 그 SDK 호출이 들어갈 자리를 함수로 분리해뒀고,
// 지금은 실제 팝업 대신 가짜 지연 후 임의의 프로필을 반환합니다.
export async function loginWithKakao(): Promise<AuthUser> {
  // TODO: 실제 연동 시 — Kakao.Auth.authorize({ redirectUri }) 또는
  // Kakao.Auth.login()으로 토큰을 받고 Kakao.API.request('/v2/user/me')로 프로필 조회
  const mockId = `kakao-${Math.floor(Math.random() * 9000 + 1000)}`;
  return delay({ id: mockId, provider: 'kakao', name: '카카오사용자', role: 'employee', employeeId: null });
}

export async function loginWithNaver(): Promise<AuthUser> {
  // TODO: 실제 연동 시 — 네이버 로그인 JS SDK(naver_id_login)로 인가 후
  // /v1/nid/me로 프로필 조회 (토큰 교환은 보안상 서버에서 하는 걸 권장)
  const mockId = `naver-${Math.floor(Math.random() * 9000 + 1000)}`;
  return delay({ id: mockId, provider: 'naver', name: '네이버사용자', role: 'employee', employeeId: null });
}

const DEMO_ADMIN = { id: 'admin', password: 'admin1234' };

export async function loginAsAdmin(id: string, password: string): Promise<AuthUser | null> {
  // ⚠️ 데모 계정입니다. 실제로는 백엔드에서 비밀번호를 해시 검증해야 합니다.
  if (id !== DEMO_ADMIN.id || password !== DEMO_ADMIN.password) {
    return delay(null);
  }
  return delay({ id: 'admin-1', provider: 'admin', name: '관리자', role: 'admin', employeeId: null });
}

// 데모 편의용 — 소셜 로그인 팝업 없이 바로 특정 직원으로 로그인(테스트 계정 전환 용도)
export async function loginAsEmployee(employeeId: string, name: string): Promise<AuthUser> {
  return delay({ id: `demo-${employeeId}`, provider: 'kakao', name, role: 'employee', employeeId });
}
