/**
 * 정산 파생값 계산.
 *
 * DB에 저장하지 않고 조회할 때마다 계산한다 — 계산식이 바뀌어도 과거 데이터가 안 꼬인다.
 * 프론트도 같은 식을 쓰므로 여기만 고치면 표·폼·엑셀이 한 번에 따라온다.
 */

// ── 간편 정산 ──
export interface BasicFields {
  purchaseCost: number;
  prepCost: number;
  saleAmount: number;
  feeAmount: number;
}

/** 순이익 = 판매금액 − 매입가 − 상품화비용 − 수수료 */
export function netProfit(r: BasicFields): number {
  return r.saleAmount - r.purchaseCost - r.prepCost - r.feeAmount;
}

// ── 알선 정산 ──
export interface BrokerageFields {
  totalSaleAmount: number;
  ownerDeposit: number;
  transferFeeBalance: number;
  cashCommission: number;
  installmentFee: number;
  insuranceFee: number;
  /** 차대금업 (예전 이름은 기타비용) */
  etcCost: number;
}

/**
 * 수익금 = 현금 수수료 + 할부 피 + 보험 피 + 차대금업
 *
 * 예전에는 '총 진행 판매금액 − 실차주입금' 이었다. 차값이 오가는 건 회사 돈이 들고 나는
 * 것이고, 알선으로 실제로 남는 건 수수료·피 쪽이라 그것만 센다.
 * 총 판매금액과 실차주입금은 그대로 적어둔다 — 얼마짜리 거래였는지는 남아야 한다.
 */
export function brokerageProfit(r: Pick<BrokerageFields, 'cashCommission' | 'installmentFee' | 'insuranceFee' | 'etcCost'>): number {
  return r.cashCommission + r.installmentFee + r.insuranceFee + r.etcCost;
}

/**
 * 정산받을금액 = 수익금 구간별.
 *
 *   100만원 미만  →  5만원 정액
 *   100만원 이상  →  20%
 *   200만원 이상  →  30%
 *
 * 구간을 표로 둔 이유: 비율이나 구간이 바뀌는 일이 잦은데, if 를 고치는 것보다
 * 숫자를 고치는 쪽이 틀릴 여지가 적다. 큰 금액부터 본다.
 *
 * 아래 구간만 정액이라 비율(rate)과 정액(flat)을 둘 다 받는다.
 *
 * 단위는 원이다 — 알선 정산만 다른 정산과 달리 원으로 적는다. 할부 피처럼
 * 12,345원으로 떨어지는 값이 있어 만원으로는 담기지 않는다.
 */
export const BROKERAGE_TIERS = [
  { from: 2_000_000, rate: 0.3 },
  { from: 1_000_000, rate: 0.2 },
  { from: 0, flat: 50_000 },
] as const;

type BrokerageTier = { from: number; rate?: number; flat?: number };

function tierOf(profit: number): BrokerageTier | undefined {
  return (BROKERAGE_TIERS as readonly BrokerageTier[]).find((t) => profit >= t.from);
}

/** 비율 구간이면 비율, 정액 구간이면 0 — 화면에 '수익금의 20%' 를 적을 때 쓴다. */
export function brokerageSettlementRate(profit: number): number {
  return tierOf(profit)?.rate ?? 0;
}

/** 원 단위로 끊는다. 비율을 곱하면 소수가 남으므로 반올림한다. */
export function brokerageSettlementAmount(profit: number): number {
  const tier = tierOf(profit);
  if (!tier) return 0;
  if (tier.flat != null) return tier.flat;
  return Math.round(profit * (tier.rate ?? 0));
}

// ── 매입 정산 ──
//
// 상품화 비용은 항목 6종으로 나뉘고, 항목 안에서 다시 업체·카테고리별 명세로 쌓인다.
// (광택은 A광택집·B광택집, 진단비는 플랫폼마다 광고 형태와 비용이 다르다)
//
// 예전에는 항목마다 금액 컬럼 하나씩이었다. 지금은 명세가 원본이고 합계는 여기서 더한다.

export const PREP_COST_KINDS = [
  'POLISH_WASH',
  'DENT',
  'PERFORMANCE',
  'DELIVERY',
  'REPAIR',
  'DIAGNOSIS',
] as const;

export type PrepCostKind = (typeof PREP_COST_KINDS)[number];

export interface PrepCostLine {
  kind: PrepCostKind;
  amount: number;
}

export type PrepCostBreakdown = Record<PrepCostKind, number>;

export function emptyPrepBreakdown(): PrepCostBreakdown {
  return {
    POLISH_WASH: 0,
    DENT: 0,
    PERFORMANCE: 0,
    DELIVERY: 0,
    REPAIR: 0,
    DIAGNOSIS: 0,
  };
}

/** 항목별 합계 — 명세 여러 줄을 6칸으로 접는다. */
export function prepBreakdown(costs: PrepCostLine[]): PrepCostBreakdown {
  const result = emptyPrepBreakdown();
  for (const c of costs) result[c.kind] += c.amount;
  return result;
}

/**
 * 상품화총비용 = 광택·세차 + 판금·덴트 + 성능비 + 탁송비 + 수리비 + 진단비 (원)
 *
 * 구전과 이전비는 상품화가 아니라 별도 항목이라 제외한다.
 * (구전은 예전에 여기 들어가 있었는데, 상품화 항목 6개만 세는 쪽으로 정리했다)
 */
export function purchasePrepTotal(costs: PrepCostLine[]): number {
  return costs.reduce((sum, c) => sum + c.amount, 0);
}

/**
 * 총비용 = 매입가 + 이전비 + 구전 + 상품화총비용
 *
 * 그 차에 들어간 돈을 다 더한다. 예전에는 이전비와 구전이 빠져 있어서,
 * 이전비 121만원을 적어도 총비용은 매입가 그대로였다.
 */
export function purchaseGrandTotal(
  purchasePrice: number,
  prepTotal: number,
  transferFee = 0,
  brokerFee = 0,
): number {
  return purchasePrice + transferFee + brokerFee + prepTotal;
}

// ── 판매 쪽 (매입 정산) ──
//
// 사 온 차를 팔면 그 차 한 대에서 얼마가 남았는지를 본다.
// 산 값(매입 + 부대비용)은 위에서 세고, 여기서는 판 값을 센다.

export const BROKER_FEE_PAYOUTS = ['CASH', 'TAX_3_3', 'TAX_13_3'] as const;

export type BrokerFeePayout = (typeof BROKER_FEE_PAYOUTS)[number];

export const BROKER_FEE_PAYOUT_LABEL: Record<BrokerFeePayout, string> = {
  CASH: '현금',
  TAX_3_3: '3.3%',
  TAX_13_3: '13.3%',
};

export interface SaleFields {
  cashCommission: number;
  installmentFee: number;
  insuranceFee: number;
  /** 차대금업 */
  dealerLoanFee: number;
  /** 구전 — 방식에 맞춰 실제로 나간 금액 */
  brokerFee: number;
}

/**
 * 판매수익 = 현금 수수료 + 할부 피 + 보험 피 + 차대금업
 *
 * 구전은 여기서 안 뺀다. 총비용에 들어가 있어서 여기서 또 빼면 두 번 빠진다.
 * 지급방식은 어느 쪽으로 나갔는지 남겨두려고 따로 적는다.
 */
export function saleProfit(r: SaleFields): number {
  return r.cashCommission + r.installmentFee + r.insuranceFee + r.dealerLoanFee;
}

/** 차 한 대에서 최종으로 남은 돈 = 차량판매가 − (매입 + 부대비용) + 판매수익 */
export function saleNet(salePrice: number, grandTotalWon: number, profit: number): number {
  return salePrice - grandTotalWon + profit;
}

// ── 차량비용(주유·배터리·주차) 연동 ──
//
// 차량관리에 쌓인 이력을 차량번호로 붙여서 매입 정산에 함께 보여준다.
// 매입 정산도 원 단위라 이제 환산 없이 그대로 더한다(예전에는 만원↔원 환산이 필요했다).

/** 만원 표기용 — 화면에서만 쓴다. 저장·계산은 전부 원 단위 정수다. */
export const WON_PER_MANWON = 10_000;

export interface VehicleCostSummary {
  fuel: number; // 원
  battery: number; // 원
  parking: number; // 원
  repair: number; // 원 — 소모품·수리
  etc: number; // 원 — 기타
  total: number; // 원
  count: number; // 이력 건수
}

export const EMPTY_VEHICLE_COST: VehicleCostSummary = {
  fuel: 0,
  battery: 0,
  parking: 0,
  repair: 0,
  etc: 0,
  total: 0,
  count: 0,
};

/** 최종 합계(원) = 총비용 + 차량비용. 둘 다 원이라 그냥 더한다. */
export function purchaseGrandTotalWon(
  purchasePrice: number,
  prepTotal: number,
  vehicleCost: VehicleCostSummary,
  transferFee = 0,
  brokerFee = 0,
): number {
  return purchaseGrandTotal(purchasePrice, prepTotal, transferFee, brokerFee) + vehicleCost.total;
}
