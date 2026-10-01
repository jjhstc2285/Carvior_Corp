/**
 * 알선 딜러 인센티브 셈.
 *
 * 2026-10-01부터 적용한다. 기본급을 깔고, 월 알선 총액이 기본급을 넘은 만큼에 구간
 * 요율을 곱해 인센티브를 낸다.
 *
 * 요율은 초과분이 아니라 '월 알선 총액'이 어느 구간인지로 고른다 — 그래야 한 구간 위로
 * 올라설 때 받는 게 눈에 띄게 늘고, 그게 이 표의 뜻이다.
 *
 * 셈을 여기 한 곳에만 둔다. 화면에서도 같은 식을 쓰면 요율표를 고쳤을 때 둘이 어긋나고,
 * 어긋난 쪽이 급여라 사람이 먼저 알게 된다.
 */

/** 정한 날 — 표가 바뀌면 이 값도 같이 바꾼다 */
export const INCENTIVE_EFFECTIVE_FROM = '2026-10-01';

/** 아무것도 안 정했을 때의 기본급(원) */
export const BASE_SALARY_DEFAULT = 2_000_000;

/**
 * 달성 구간과 요율.
 *
 * 안내표에 적힌 달성액에 '닿으면' 그 요율이 되고, 다음 달성액에 닿기 전까지 그대로다.
 * 800만을 하면 45%이고, 944만을 해도 아직 1,000만이 아니니 45%다 — 1,000만에 닿아야
 * 50%가 된다.
 *
 * 안내표 아홉 줄이 그대로 나온다(기본급 200만 기준):
 *
 *   250만 → 200만 + (50만 × 20%) = 210만
 *   300만 → 200만 + (100만 × 20%) = 220만
 *   400만 → 200만 + (200만 × 25%) = 250만
 *   500만 → 200만 + (300만 × 30%) = 290만
 *   600만 → 200만 + (400만 × 35%) = 340만
 *   700만 → 200만 + (500만 × 40%) = 400만
 *   800만 → 200만 + (600만 × 45%) = 470만
 * 1,000만 → 200만 + (800만 × 50%) = 600만
 * 1,500만 → 200만 + (1,300만 × 55%) = 915만
 *
 * 300만에는 요율이 안 바뀐다 — 표에서 250만과 300만이 둘 다 20%다.
 *
 * 위에서부터 큰 구간으로 내려보며 찾는다.
 */
export const INCENTIVE_TIERS: { tier: string; from: number; rate: number }[] = [
  { tier: '8구간(폭발)', from: 15_000_000, rate: 0.55 },
  { tier: '7구간', from: 10_000_000, rate: 0.5 },
  { tier: '6구간', from: 8_000_000, rate: 0.45 },
  { tier: '5구간', from: 7_000_000, rate: 0.4 },
  { tier: '4구간', from: 6_000_000, rate: 0.35 },
  { tier: '3구간', from: 5_000_000, rate: 0.3 },
  { tier: '2구간', from: 4_000_000, rate: 0.25 },
  { tier: '1구간', from: 2_000_000, rate: 0.2 },
];

/** 이 아래는 인센티브가 없다 — 기본급만 간다 */
export const INCENTIVE_FLOOR = 2_000_000;

/** 근속 연차별 기본급(원). 5년까지 오르고 그 뒤로는 5년 값이다 */
export const TENURE_BASE_SALARY = [2_000_000, 2_200_000, 2_400_000, 2_600_000, 2_800_000, 3_000_000];

/** 팀장 규칙 */
export const TEAM_LEADER = {
  /** 팀장은 기본급을 따로 준다 */
  baseSalary: 2_200_000,
  /** 팀원 알선 합계에 붙는 관리 요율 */
  defaultRate: 0.03,
  /** 목표를 채운 달의 요율 */
  targetRate: 0.05,
  /** 팀장 본인이 이만큼은 해야 오버라이딩을 준다 */
  minPersonalSales: 3_000_000,
};

/** 알선팀 타이틀 — 이름 옆에 붙고, 팀장 오버라이딩을 누구에게 줄지도 이 값으로 가른다 */
export const REFERRAL_TITLES = ['LEADER', 'PRO', 'JUNIOR'] as const;
export type ReferralTitle = (typeof REFERRAL_TITLES)[number];

export function tierOf(sales: number): { tier: string; rate: number } {
  // 200만에 못 닿은 달은 구간 자체가 없다
  if (sales < INCENTIVE_FLOOR) return { tier: '미달', rate: 0 };
  const hit = INCENTIVE_TIERS.find((t) => sales >= t.from);
  return hit ?? { tier: '미달', rate: 0 };
}

/** 근속 연차로 기본급을 낸다. 5년을 넘으면 5년 값에서 멈춘다 */
export function baseSalaryOf(years: number, title: string): number {
  if (title === 'LEADER') return TEAM_LEADER.baseSalary;
  const clamped = Math.min(Math.max(Math.trunc(years), 0), TENURE_BASE_SALARY.length - 1);
  return TENURE_BASE_SALARY[clamped];
}

export interface IncentiveInput {
  sales: number;
  years: number;
  /** 따로 정한 기본급(원). 0이면 근속·타이틀로 낸다 */
  baseSalary: number;
  title: string;
  targetAchieved: boolean;
  /** 팀장일 때만 — 팀원들의 월 알선 합계 */
  teamSales: number;
}

export interface IncentiveResult {
  /** 이 달 기본급(원) */
  baseSalary: number;
  /** 기본급을 넘은 매출 — 못 넘었으면 0이다(마이너스를 인센티브에서 빼지 않는다) */
  excess: number;
  tier: string;
  rate: number;
  /** 구간 요율로 낸 본인 인센티브 */
  incentive: number;
  /** 팀장이 팀원 매출로 받는 관리 수당 */
  overriding: number;
  /** 오버라이딩에 적용한 요율 — 0이면 못 받는 달이다 */
  overridingRate: number;
  /** 팀장인데 본인 실적이 모자라 오버라이딩을 못 받는가 */
  overridingBlocked: boolean;
  /** 기본급 + 인센티브 + 관리 수당 */
  payout: number;
  /**
   * 회사에 남는 돈.
   *
   * 팀장 관리 수당은 팀원 수수료를 깎지 않고 회사 마진에서 나간다 — 그래서 그 사람
   * 매출에서 그 사람 실수령을 뺀 값이 그대로 회사 몫이 되지 않는다.
   */
  companyProfit: number;
}

export function computeIncentive(input: IncentiveInput): IncentiveResult {
  const sales = Math.max(0, Math.round(input.sales));
  const baseSalary = input.baseSalary > 0 ? input.baseSalary : baseSalaryOf(input.years, input.title);

  /*
    기본급을 못 넘은 달은 인센티브가 없다.

    모자란 만큼을 빼지도 않는다 — 기본급은 깔아주는 돈이라 빼기 시작하면 기본급이 아니다.
  */
  const excess = Math.max(0, sales - baseSalary);
  // 구간은 총액으로 고르고, 요율은 초과분에 먹인다 — 안내표가 그 식이다
  const { tier, rate } = tierOf(sales);
  const incentive = Math.round(excess * rate);

  /*
    팀장 관리 수당.

    팀원이 올린 알선 합계에 붙는다. 팀원 수수료를 깎지 않고 회사 마진에서 나간다.
    팀장 본인이 최소 실적을 못 채운 달은 안 준다 — 관리만 하고 본인은 안 뛰는 달이
    생기면 그건 관리 수당이 아니라 그냥 자리값이 된다.
  */
  const isLeader = input.title === 'LEADER';
  const overridingBlocked = isLeader && sales < TEAM_LEADER.minPersonalSales;
  const overridingRate =
    isLeader && !overridingBlocked ? (input.targetAchieved ? TEAM_LEADER.targetRate : TEAM_LEADER.defaultRate) : 0;
  const overriding = Math.round(Math.max(0, input.teamSales) * overridingRate);

  const payout = baseSalary + incentive + overriding;

  return {
    baseSalary,
    excess,
    tier,
    rate,
    incentive,
    overriding,
    overridingRate,
    overridingBlocked,
    payout,
    companyProfit: sales - baseSalary - incentive - overriding,
  };
}
