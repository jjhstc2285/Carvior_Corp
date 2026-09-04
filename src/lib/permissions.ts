import type { AuthUser } from './auth';

/**
 * 매입리스트(재고금융 대장)를 볼 수 있는 사람.
 *
 * 사무장이 맡아 보는 장부라 전 직원에게 열어둘 이유가 없다. 관리자도 함께 열어둔다 —
 * 잘못 들어간 값을 고칠 사람이 아무도 없으면 곤란하고, 대표도 관리자 계정이다.
 *
 * 여기서 감추는 건 메뉴일 뿐이다. 실제로 막는 건 서버(auth/office-manager.ts)다.
 */
export function canSeePurchaseList(user: AuthUser | null): boolean {
  return isOfficeManager(user);
}

/**
 * 사무장(과 관리자)인가.
 *
 * 재고금융에서 제시 대상·제시함·재고 잡힘은 사무장이 챙기는 일이라 이 사람들만 본다.
 * 상환 예정은 직원들도 본다 — 그 달에 갚을 차를 확인하는 건 다 같이 하는 일이다.
 */
export function isOfficeManager(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.position.includes('사무장');
}
