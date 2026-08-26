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
  etcCost: number;
}

/** 수익금 = 총 진행 판매금액 − 실차주입금 */
export function brokerageProfit(r: Pick<BrokerageFields, 'totalSaleAmount' | 'ownerDeposit'>): number {
  return r.totalSaleAmount - r.ownerDeposit;
}

/** 판매 수익 = 수익금 + 이전비 잔액 + 현금 수수료 + 할부 피 + 보험 피 − 기타비용 */
export function brokerageSaleProfit(r: BrokerageFields): number {
  return (
    brokerageProfit(r) + r.transferFeeBalance + r.cashCommission + r.installmentFee + r.insuranceFee - r.etcCost
  );
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

/** 매입+상품화총비용 = 매입가 + 상품화총비용 */
export function purchaseGrandTotal(purchasePrice: number, prepTotal: number): number {
  return purchasePrice + prepTotal;
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
  repair: number; // 원
  total: number; // 원
  count: number; // 이력 건수
}

export const EMPTY_VEHICLE_COST: VehicleCostSummary = {
  fuel: 0,
  battery: 0,
  parking: 0,
  repair: 0,
  total: 0,
  count: 0,
};

/** 최종 합계(원) = 매입 + 상품화총비용 + 차량비용. 셋 다 원이라 그냥 더한다. */
export function purchaseGrandTotalWon(
  purchasePrice: number,
  prepTotal: number,
  vehicleCost: VehicleCostSummary,
): number {
  return purchaseGrandTotal(purchasePrice, prepTotal) + vehicleCost.total;
}
