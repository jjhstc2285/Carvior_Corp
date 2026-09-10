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
 * 상사 이전비 — 매입가로 정해진다.
 *
 *   500만원 이하    5만원
 *   500만원 초과    매입가의 1%
 *   3000만원 이상   30만원 (최고)
 *
 * 세 줄이 이어져 있다. 500만원에서 1%가 곧 5만원이고 3000만원에서 1%가 곧 30만원이라,
 * 결국 '1%를 내되 5만원 밑으로도 30만원 위로도 안 간다'는 한 문장이다.
 * 구간을 if 로 늘어놓는 대신 그렇게 적는다 — 경계에서 값이 튀지 않는다.
 */
export const DEALER_FEE_RATE = 0.01;
export const DEALER_FEE_MIN = 50_000;
export const DEALER_FEE_MAX = 300_000;

export function dealerTransferFee(purchasePrice: number): number {
  if (purchasePrice <= 0) return 0;
  const fee = Math.round(purchasePrice * DEALER_FEE_RATE);
  return Math.min(Math.max(fee, DEALER_FEE_MIN), DEALER_FEE_MAX);
}

/**
 * 추가이전비 — 취득세가 200만원을 넘으면 그 취득세의 15%를 우리가 더 낸다.
 *
 * 상사 이전비와는 별개다. 상사 이전비는 이전을 대행해 주고 받는 값이고,
 * 이건 세금이다 — 비싼 차를 사면 취득세가 커지고 그만큼 더 나간다.
 *
 * 취득세는 매입가의 7%로 본다. 200만원을 넘는 건 매입가로 치면 2,857만원부터다.
 * 그보다 싼 차는 0원이다.
 *
 * 예) 4,000만원 → 취득세 280만원 → 42만원
 */
export const ACQUISITION_TAX_RATE = 0.07;
export const EXTRA_FEE_TAX_THRESHOLD = 2_000_000;
export const EXTRA_FEE_RATE = 0.15;

/** 취득세 — 지방세라 10원 미만은 버린다. */
export function acquisitionTax(purchasePrice: number): number {
  if (purchasePrice <= 0) return 0;
  return Math.floor((purchasePrice * ACQUISITION_TAX_RATE) / 10) * 10;
}

export function extraTransferFee(purchasePrice: number): number {
  const tax = acquisitionTax(purchasePrice);
  if (tax <= EXTRA_FEE_TAX_THRESHOLD) return 0;
  return Math.floor((tax * EXTRA_FEE_RATE) / 10) * 10;
}

/**
 * 총비용 = 매입가 + 이전비 + 구전 + 상품화총비용
 *
 * 그 차에 들어간 돈을 다 더한다.
 *
 * 상사 이전비와 추가이전비는 '이전비 + 추가이전비' 칸에 들어간다(transferFeeOf).
 * 여기서 또 더하면 두 번 잡힌다.
 */
export function purchaseGrandTotal(
  purchasePrice: number,
  prepTotal: number,
  transferFee = 0,
  brokerFee = 0,
): number {
  return purchasePrice + transferFee + brokerFee + prepTotal;
}

/**
 * 이전비 + 추가이전비 — 매입가만 있으면 나온다.
 *
 * 사람이 세어 적을 값이 아니라 매입가로 정해지는 값이다. 매입가를 적으면 이 값이
 * '이전비 + 추가이전비' 칸에 채워진다. 다르게 잡힌 건이 있으면 그 칸에서 고친다.
 */
export function transferFeeOf(purchasePrice: number): number {
  return dealerTransferFee(purchasePrice) + extraTransferFee(purchasePrice);
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

/** 판매수익에서 떼는 세금 */
export const SALE_TAX_RATE = 0.133;

/**
 * 판매수익 = (차량판매가 − 총합계) − 세금 13.3%
 *
 * 그 차에 들어간 돈을 다 더한 게 총합계(총비용 + 주유·배터리·주차 같은 차량비용)다.
 * 판 값에서 그걸 빼면 남은 돈이 나오고, 거기서 세금을 뗀 게 실제로 손에 쥐는 돈이다.
 *
 * 손해면 그대로 둔다 — 뗄 세금이 없는데 13.3%를 빼면 손해가 줄어든 것처럼 보인다.
 *
 * 현금 수수료·할부 피·보험 피·차대금업은 적어두기만 하고 여기서는 안 센다.
 * 아직 안 판 차는 차량판매가가 0이라 총합계만큼 마이너스로 나온다 — 판 다음에 본다.
 */
export function saleProfit(salePrice: number, grandTotalWon: number): number {
  const gross = salePrice - grandTotalWon;
  if (gross <= 0) return gross;
  return Math.round(gross * (1 - SALE_TAX_RATE));
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
