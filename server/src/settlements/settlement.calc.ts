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
 *
 * 실제지급액을 적었으면 추가이전비는 안 더한다.
 *
 * 둘을 갈라 본다. 상사 이전비(매입가의 1%)는 우리가 상사에게 내는 돈이라 그대로
 * 총비용에 든다. 추가이전비(취득세의 15%)는 상사가 먼저 떼고 통장에 넣어 준다 —
 * 실제지급액에 이미 빠져 있는 돈이라 또 얹으면 같은 돈을 두 번 센다.
 *
 * 이전비 칸은 둘을 더한 값이라(transferFeeOf) 여기서 추가이전비만 덜어 낸다.
 */
export function purchaseGrandTotal(
  purchasePrice: number,
  prepTotal: number,
  transferFee = 0,
  brokerFee = 0,
  /** 헤이딜러·엔카 경매장 수수료 — 사오는 데 든 돈이라 총비용에 들어간다 */
  platformFee = 0,
  /** 상사 정산서 맨 아래 '실제지급액' — 적혀 있으면 추가이전비는 안 더한다 */
  payoutAmount = 0,
  /** 카비어 수수료 — 무는 건만 붙는다. carviorFeeOf 가 낸다 */
  carviorFee = 0,
): number {
  // 추가이전비는 상사가 먼저 뗀 돈이라 실제지급액에 이미 빠져 있다 — 또 얹으면 두 번 센다
  const transfer = payoutAmount > 0 ? Math.max(transferFee - extraTransferFee(purchasePrice), 0) : transferFee;
  return purchasePrice + transfer + brokerFee + platformFee + carviorFee + prepTotal;
}

/**
 * 카비어 수수료 — 검차 리포트 한 건당 무는 값(원).
 *
 * 한 값이라 적어 둘 칸을 만들지 않았다. 바뀌면 이 줄만 고친다 — 이미 저장된 정산은
 * 켜고 끈 것만 들고 있으므로, 값을 고치면 지난 건도 새 값으로 셈한다.
 */
export const CARVIOR_FEE = 100_000;

/**
 * 이 건에 카비어 수수료를 무는가.
 *
 * 안 적어 둔 건(null)은 검차 리포트가 있으면 문다 — 리포트는 카비어가 달아 주는
 * 거라 그게 있으면 쓴 것이다. 손으로 켜고 끈 건은 그 값이 이긴다.
 */
export function carviorOn(carvior: boolean | null | undefined, hasReport: boolean): boolean {
  return carvior ?? hasReport;
}

export function carviorFeeOf(carvior: boolean | null | undefined, hasReport: boolean): number {
  return carviorOn(carvior, hasReport) ? CARVIOR_FEE : 0;
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

/**
 * 판매수익 = 차량판매가 − 총합계
 *
 * 그 차에 들어간 돈을 다 더한 게 총합계(총비용 + 주유·배터리·주차 같은 차량비용)다.
 * 판 값에서 그걸 빼면 그 차에서 남은 돈이다.
 *
 * 세금은 안 뗀다.
 *
 * 예전에는 여기서 13.3%를 뺐다. 그런데 세금은 상사(삼장)가 정산해 줄 때 이미 떼고
 * 넣어 준다 — 판매가에서 매입가와 재고 금융을 뺀 금액에 부가세와 원천세를 매긴다.
 * 우리가 여기서 또 떼면 두 번 뗀 숫자가 되고, 매는 밑금액도 저쪽과 다르다.
 * 상사 정산서와 견줄 수 있게 뺀 돈 그대로 둔다.
 *
 * 현금 수수료·할부 피·보험 피·차대금업은 적어두기만 하고 여기서는 안 센다.
 * 아직 안 판 차는 차량판매가가 0이라 총합계만큼 마이너스로 나온다 — 판 다음에 본다.
 */
export function saleProfit(
  salePrice: number,
  grandTotalWon: number,
  /** 상사 정산서 맨 아래 '실제지급액' — 적혀 있으면 이걸 기준으로 낸다 */
  payoutAmount = 0,
  purchasePrice = 0,
): number {
  /*
    실제지급액을 적었으면 그 숫자에서 낸다.

    상사는 판매가에서 매입가와 이전비와 재고 금융을 빼고, 부가세와 원천세까지 뗀 뒤에
    통장으로 넣어 준다. 그 숫자가 실제지급액이다. 그러니 거기서 더 뺄 것은 저쪽 계산에
    안 들어간 것뿐이다 — 구전·플랫폼 수수료·상품화·차량비용.

    매입가와 이전비는 이미 저쪽에서 빠졌으므로 다시 빼지 않는다. 총합계에서 그 둘을
    덜어 내고 뺀다 — 두 번 빼면 그만큼 손해로 보인다.

    추가이전비는 총비용에서 이미 빠져 있다 — 실제지급액을 적으면 purchaseGrandTotal 이
    안 더한다. 그래서 여기서는 매입가만 덜어 내면 된다.

    이렇게 하면 재고 금융 이자도 세금도 우리가 따로 적을 필요가 없다. 이미 빠진 금액이다.
  */
  if (payoutAmount > 0) return payoutAmount - (grandTotalWon - purchasePrice);
  return salePrice - grandTotalWon;
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
  /** 외부 주차장에서 세워 둔 차를 닦아 주시는 값 — 상품화의 광택·세차와 다르다 */
  wash: number; // 원
  repair: number; // 원 — 소모품·수리
  etc: number; // 원 — 기타
  total: number; // 원
  count: number; // 이력 건수
}

export const EMPTY_VEHICLE_COST: VehicleCostSummary = {
  fuel: 0,
  battery: 0,
  parking: 0,
  wash: 0,
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
  platformFee = 0,
  /** 실제지급액 — 적혀 있으면 이전비는 안 더한다(상사가 먼저 뗀 돈이다) */
  payoutAmount = 0,
  /** 카비어 수수료 — 무는 건만 붙는다 */
  carviorFee = 0,
): number {
  return (
    purchaseGrandTotal(purchasePrice, prepTotal, transferFee, brokerFee, platformFee, payoutAmount, carviorFee) +
    vehicleCost.total
  );
}

/**
 * 매도정산 — 판매수익을 나누는 비율.
 *
 * 차장·본부장이 매도 쪽을 맡은 건은 그 차 판매수익의 일부를 가져간다. 신차에서 넘어온
 * 차와 개인에게서 사온 차가 다르다.
 *
 * 비어 있으면 안 정한 것이라 0원이다 — 정하지 않은 건을 섞어 더하면 합계가 사실보다 커진다.
 */
export const PROFIT_SHARES = [
  { key: 'NEW', label: '신차', rate: 0.3 },
  { key: 'PERSON', label: '개인', rate: 0.5 },
] as const;

export type ProfitShareKey = (typeof PROFIT_SHARES)[number]['key'];

export function profitShareRate(key: string | null | undefined): number {
  return PROFIT_SHARES.find((s) => s.key === key)?.rate ?? 0;
}

/** 그 사람이 가져가는 몫 — 손해 본 차는 0이다(마이너스를 나눠 가질 수는 없다) */
export function profitShareAmount(saleProfitWon: number, key: string | null | undefined): number {
  if (saleProfitWon <= 0) return 0;
  return Math.round(saleProfitWon * profitShareRate(key));
}
