import type { AuthUser } from './auth';

/**
 * 돈 장부(신차영업소 상조회비)를 볼 수 있는 사람 — 대표·사무장·본부장·테스트 계정.
 *
 * 서버(auth/office-manager.ts)와 같은 목록을 쓴다. 여기서 감추는 건 메뉴일 뿐이고
 * 실제로 막는 건 서버라, 목록이 어긋나면 메뉴는 보이는데 열면 막히는 일이 생긴다.
 *
 * 직급으로 가린다 — 사람이 바뀌어도 자리를 물려받은 사람이 그대로 보고,
 * 이름으로 박아두면 사람이 바뀔 때 코드를 고쳐야 하는데 그 사실을 아무도 기억하지 못한다.
 */
export const LEDGER_POSITIONS = ['대표', '사무장', '본부장', '테스트'] as const;

export function canSeeLedger(user: AuthUser | null): boolean {
  if (!user) return false;
  return LEDGER_POSITIONS.some(p => user.position.includes(p));
}

/**
 * 사무장(과 관리자)인가.
 *
 * 재고금융에서 제시 대상·제시함·재고차량은 사무장이 챙기는 일이라 이 사람들만 본다.
 * 상환 예정은 직원들도 본다 — 그 달에 갚을 차를 확인하는 건 다 같이 하는 일이다.
 */
export function isOfficeManager(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.position.includes('사무장');
}

/**
 * 남의 정산까지 볼 수 있는 사람.
 *
 * 매입은 매입팀이 해오고 빈칸은 계약팀이 채운다. 자기가 담당인 건만 보이면
 * 정작 채워야 할 사람이 아무것도 못 본다.
 *
 * 부서로 가린다 — 사람이 바뀌어도 계약팀에 들어오면 그대로 보인다.
 */
/**
 * 계약팀은 아니지만 매입 정산을 보는 사람.
 *
 * 매입가와 상품화 비용을 들여다봐야 하는 자리인데 계약팀이 아니다. 직급으로 열면 같은
 * 직급이 하나 더 생겼을 때 같이 열린다 — 승인자를 이름으로 못 박는 것과 같은 이유로
 * 이름으로 둔다. 바꿀 일이 생기면 이 줄 하나만 고친다.
 *
 * 서버에도 같은 이름이 있다(settlements/approvers.ts) — 고칠 땐 양쪽을 같이 본다.
 */
export const SETTLEMENT_VIEWERS = ['이우주', '안원용'];

export function canSeeAllSettlements(
  user: { role: string } | null,
  department?: string | null,
  name?: string | null,
): boolean {
  if (!user) return false;
  if (user.role !== 'EMPLOYEE' || department === '계약팀') return true;
  return SETTLEMENT_VIEWERS.includes((name ?? '').trim());
}

/**
 * 플랫폼 매물 점검을 볼 수 있는가 — 대표(관리자)와 광고팀.
 *
 * 엔카·차차차에 값을 올리고 고치는 게 광고팀 일이라, 틀어진 걸 찾아 맞추는 자리도
 * 거기다. 서버도 같은 기준으로 다시 본다(platform-listings.module.ts).
 */
export const SHEET_TEAM = '광고팀';

/** 대표(관리자)와 광고팀만 */
export function canSeeAdminSheet(
  user: { role: 'EMPLOYEE' | 'ADMIN' } | null,
  department?: string | null,
): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || (department ?? '').trim() === SHEET_TEAM;
}
