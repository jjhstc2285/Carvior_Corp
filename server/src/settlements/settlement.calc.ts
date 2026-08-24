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
export interface PurchasePrepFields {
  polishWashCost: number;
  dentCost: number;
  performanceCost: number;
  deliveryCost: number;
  repairCost: number;
  brokerFee: number;
  diagnosisCost: number;
}

/**
 * 상품화총비용 = 광택및세차 + 판금및덴트 + 성능비 + 탁송비 + 수리비 + 구전 + 진단비
 * 이전비는 상품화가 아니라 별도 항목이라 제외한다. 포함해야 하면 이 함수만 고치면 된다.
 */
export function purchasePrepTotal(r: PurchasePrepFields): number {
  return (
    r.polishWashCost + r.dentCost + r.performanceCost + r.deliveryCost + r.repairCost + r.brokerFee + r.diagnosisCost
  );
}

/** 매입+상품화총비용 = 매입가 + 상품화총비용 */
export function purchaseGrandTotal(r: PurchasePrepFields & { purchasePrice: number }): number {
  return r.purchasePrice + purchasePrepTotal(r);
}

// ── 차량비용(주유·배터리·주차) 연동 ──
//
// 차량관리에 쌓인 이력을 차량번호로 붙여서 매입 정산에 함께 보여준다.
// 정산 금액은 만원 단위 정수인데 주유비는 만원으로 안 떨어져서(예: 25,000원),
// 만원으로 반올림해 기존 항목에 섞지 않고 '원' 단위 항목을 따로 둔다.

/** 정산 금액 1 = 10,000원 */
export const WON_PER_UNIT = 10_000;

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

/**
 * 최종 합계(원) = (매입+상품화총비용) × 10,000 + 차량비용
 * 단위가 다른 둘을 더할 수 있는 유일한 지점이라 원으로 환산해서 낸다.
 */
export function purchaseGrandTotalWon(
  r: PurchasePrepFields & { purchasePrice: number },
  vehicleCost: VehicleCostSummary,
): number {
  return purchaseGrandTotal(r) * WON_PER_UNIT + vehicleCost.total;
}
