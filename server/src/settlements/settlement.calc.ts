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
