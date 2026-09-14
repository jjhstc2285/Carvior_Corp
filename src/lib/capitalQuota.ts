import { repayRuleOf } from './stockFinance';

/**
 * 재고금융을 쓰면 그 캐피탈로 할부를 깔아 줘야 하는 약정.
 *
 * 캐피탈사가 재고금융을 내주는 대신, 차를 팔 때 그 회사 할부를 일정액 이상 써 달라고 한다.
 * 못 채우면 다음 재고금융 한도가 깎이거나 조건이 나빠진다 — 달이 끝나기 전에
 * 얼마를 깔아야 하는지 보여야 팔 때 어느 할부를 밀지 정할 수 있다.
 *
 *   · BMW · 우리캐피탈 — 쓴 금액과 상관없이 정해진 금액(1억 / 1.5억)
 *   · 그 밖 — 그 달에 쓴 재고금융의 10%
 *     (예: 이번 달 재고 총액이 10억이면 1억을 할부로 써 줘야 한다)
 *
 * 달마다 끊어 본다 — 알선 목표치를 달로 보므로 이것도 달로 맞춘다.
 *
 * 어느 캐피탈로 팔았는지는 알선·수출 상담 내용에 적는다. 전산에 칸을 따로 두지 않는다 —
 * 아무도 안 채우는 빈 칸이 되기 쉽고, 지금은 적을 실적도 없다.
 */

/** 몇 달을 묶어서 보는가 */
export const QUOTA_MONTHS = 1;

/** 쓴 금액과 상관없이 정해진 곳 (원) */
export const FIXED_QUOTA: Record<string, number> = {
  BMW: 100_000_000,
  우리금융: 150_000_000,
};

/** 나머지 캐피탈사 — 쓴 금액의 이만큼 */
export const QUOTA_RATE = 0.1;

export interface CapitalQuota {
  /** 전산에서 쓰는 캐피탈사 이름 */
  capital: string;
  /** 그 기간에 쓴 재고금융(원) */
  used: number;
  /** 대수 */
  count: number;
  /** 할부로 깔아 줘야 하는 금액(원) */
  quota: number;
  /** 쓴 금액과 상관없이 정해진 곳인가 */
  fixed: boolean;
}

/**
 * 장부에 적힌 이름을 전산 이름으로 맞춘다.
 *
 * '우리', '우리캐피탈', '(주)우리금융'이 다 들어온다. 상환일자를 내는 규칙과 같은
 * 방식으로 찾는다 — 두 벌로 두면 한쪽만 고쳐놓고 어긋난다.
 */
export function canonicalCapital(raw: string): string {
  return repayRuleOf(raw)?.label ?? raw.trim();
}

/** 이 캐피탈사에 이만큼 썼을 때, 할부로 깔아 줘야 하는 금액 */
export function quotaOf(capital: string, used: number): { quota: number; fixed: boolean } {
  const name = canonicalCapital(capital);
  const fixed = FIXED_QUOTA[name];
  if (fixed !== undefined) return { quota: fixed, fixed: true };
  // 안 쓴 곳에는 의무가 없다
  return { quota: used > 0 ? Math.round(used * QUOTA_RATE) : 0, fixed: false };
}

/**
 * 캐피탈사별 사용액을 받아 의무액을 붙인다.
 *
 * 정해진 금액이 있는 곳은 그 달에 안 썼어도 목록에 남긴다 — 약정은 계속 살아 있고,
 * '이번 달에 BMW를 안 썼다'는 것도 봐야 하는 사실이다.
 */
export function capitalQuotas(usage: { capital: string; used: number; count: number }[]): CapitalQuota[] {
  const byName = new Map<string, { used: number; count: number }>();
  for (const u of usage) {
    const name = canonicalCapital(u.capital);
    if (!name) continue;
    const prev = byName.get(name) ?? { used: 0, count: 0 };
    byName.set(name, { used: prev.used + u.used, count: prev.count + u.count });
  }
  for (const name of Object.keys(FIXED_QUOTA)) {
    if (!byName.has(name)) byName.set(name, { used: 0, count: 0 });
  }

  return [...byName]
    .map(([capital, { used, count }]) => ({ capital, used, count, ...quotaOf(capital, used) }))
    // 깔아 줘야 하는 금액이 큰 곳부터 — 그게 먼저 챙길 일이다
    .sort((a, b) => b.quota - a.quota || b.used - a.used);
}
