import type { PrepCostKind } from '../types';

/**
 * 상품화 업체 연락처.
 *
 * 비용을 적다가 "이거 얼마였지" 하고 물어볼 일이 생기는데, 번호가 카톡 어딘가에만 있어서
 * 매번 찾아 올라갔다. 적는 자리에서 바로 보이게 둔다.
 *
 * 여기 있는 이름은 비용 칸에서 눌러 넣을 수 있고, 눌러 넣지 않고 손으로 쳐도
 * 이름이 맞으면 번호가 옆에 뜬다.
 *
 * 업체가 바뀌면 이 목록만 고치면 된다.
 */

export interface PrepVendor {
  name: string;
  kind: PrepCostKind;
  phone: string;
  /** 같은 사장님이 두 가지를 하는 곳처럼, 알아둘 게 있으면 */
  memo?: string;
}

export const PREP_VENDORS: PrepVendor[] = [
  // ks판집과 yw광택은 번호가 같다 — 한 분이 두 가지를 하신다
  { name: 'ks판집', kind: 'DENT', phone: '010-8736-9775', memo: 'yw광택과 같은 번호' },
  { name: 'yw광택', kind: 'POLISH_WASH', phone: '010-8736-9775', memo: 'ks판집과 같은 번호' },
  { name: 'ks광집', kind: 'POLISH_WASH', phone: '010-4226-7161' },
  { name: '에스블루성능장', kind: 'PERFORMANCE', phone: '010-5451-1851' },
  { name: '대산판집', kind: 'DENT', phone: '010-4879-9772' },
];

/** 그 항목에 등록된 업체들 */
export function vendorsOfKind(kind: PrepCostKind): PrepVendor[] {
  return PREP_VENDORS.filter(v => v.kind === kind);
}

/**
 * 적어 넣은 이름으로 업체를 찾는다.
 *
 * 띄어쓰기·대소문자는 무시한다 — 'KS 판집'이라 쳐도 같은 곳이다.
 * 항목이 달라도 찾는다. 광택 칸에 판금집 이름을 적는 일이 있고, 그때도 번호는 맞다.
 */
export function findPrepVendor(name: string): PrepVendor | null {
  const key = name.replace(/\s+/g, '').toLowerCase();
  if (!key) return null;
  return PREP_VENDORS.find(v => v.name.replace(/\s+/g, '').toLowerCase() === key) ?? null;
}
