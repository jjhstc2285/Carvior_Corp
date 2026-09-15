import type { PrepCostKind, Vendor } from '../types';

/**
 * 상품화 비용을 적을 때 보여줄 업체.
 *
 * 거래처 대장(vendors)에서 가져온다. 예전에는 이 파일에 번호를 박아뒀는데, 업체가
 * 바뀔 때마다 배포를 해야 했다 — 이제 대장에서 고치면 여기도 따라 바뀐다.
 *
 * 비용 항목과 대장 분류를 짝지어 둔다. 대장에 '광택·세차'로 넣은 곳이 광택·세차 칸에
 * 뜨는 식이다. 진단비는 플랫폼 광고비라 거래처가 아니어서 짝이 없다.
 */

export const PREP_KIND_CATEGORY: Partial<Record<PrepCostKind, string>> = {
  POLISH_WASH: '광택·세차',
  DENT: '판금·덴트',
  PERFORMANCE: '성능',
  DELIVERY: '탁송',
  REPAIR: '공업사',
};

/** 그 항목에 넣을 수 있는 거래처 */
export function vendorsOfKind(vendors: Vendor[], kind: PrepCostKind): Vendor[] {
  const category = PREP_KIND_CATEGORY[kind];
  if (!category) return [];
  return vendors.filter(v => v.category === category);
}

/**
 * 적어 넣은 이름으로 거래처를 찾는다.
 *
 * 띄어쓰기·대소문자는 무시한다 — 'KS 판집'이라 쳐도 같은 곳이다.
 * 분류가 달라도 찾는다. 광택 칸에 판금집 이름을 적는 일이 있고, 그때도 번호는 맞다.
 */
export function findVendorByName(vendors: Vendor[], name: string): Vendor | null {
  const key = name.replace(/\s+/g, '').toLowerCase();
  if (!key) return null;
  return vendors.find(v => v.name.replace(/\s+/g, '').toLowerCase() === key) ?? null;
}
