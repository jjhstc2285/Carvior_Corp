// 서버(Prisma) enum과 값을 그대로 맞춘다.
// 중간에 변환 계층을 두면 어긋났을 때 찾기 어려워서, 프론트가 서버 표기를 따라간다.

export type Role = 'ADMIN' | 'EMPLOYEE';

/**
 * 팀(부서). 작업일지를 팀끼리 나눠 보는 기준이다.
 * 손으로 적으면 '광고팀'과 '광고 팀'이 따로 놀아 같은 팀이 갈라지므로 목록에서 고른다.
 * 서버 src/employees/departments.ts 와 같아야 한다.
 */
export const DEPARTMENTS = ['광고팀', '계약팀', '매입팀', '차량관리팀', '알선팀'] as const;

export type Department = (typeof DEPARTMENTS)[number];

export interface Employee {
  id: string;
  name: string;
  position: string; // 직책 — 대표 / 본부장 / 사무장 / 차장 / 과장 / 매니저
  department: string | null;
  phones: string[];
  role: Role;
  active: boolean;
  /** 지금 상태 — 본인이 적는다("🚗 외근 중"). 안 적었으면 null */
  statusEmoji?: string | null;
  statusText?: string | null;
  statusAt?: string | null;
}

/**
 * 'pending' — 오늘이거나 앞으로의 날인데 아직 출퇴근을 안 찍은 상태.
 * 예전에는 이걸 정상으로 뒀는데 출근을 안 했는데도 정상으로 세어져 통계가 부풀었다.
 */
export type AttendanceStatus = 'normal' | 'late' | 'earlyLeave' | 'lateAndEarly' | 'missing' | 'pending' | 'dayOff' | 'annualLeave' | 'halfDay' | 'fieldWork';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
};

// 근태 신청 종류 — 연차(휴가)는 쉬는 날, 외근/출장은 정상 근무지만 출퇴근을 못 찍는 경우
export type AttendanceRequestKind = 'ANNUAL_LEAVE' | 'HALF_DAY' | 'FIELD_WORK' | 'AWAY' | 'LATE_EXCUSE';

export const ATTENDANCE_REQUEST_KIND_LABEL: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '연차',
  HALF_DAY: '반차',
  FIELD_WORK: '외근/출장',
  AWAY: '자리비움',
  LATE_EXCUSE: '지각·조퇴 소명',
};

/** 신청 화면에서 종류별로 무엇을 적는 자리인지 알려준다. */
export const ATTENDANCE_REQUEST_KIND_HINT: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '쉬는 날입니다. 출퇴근을 안 찍어도 결근으로 잡히지 않습니다.',
  HALF_DAY: '반나절만 쉽니다. 연차를 0.5일 씁니다. 승인되면 그날은 지각·조퇴로 잡히지 않습니다.',
  FIELD_WORK: '정상 근무지만 출퇴근을 못 찍는 날입니다.',
  AWAY:
    '근무 중 잠깐 자리를 비웁니다. 승인 없이 바로 기록되고 관리자에게 알림이 갑니다. 근태 판정은 바뀌지 않습니다 — 언제부터 언제까지인지 사유에 적어 주세요. 컴퓨터를 30분 동안 안 만지면 자동으로도 올라갑니다.',
  LATE_EXCUSE: '이미 지각·조퇴로 찍힌 날의 사유를 적습니다. 승인되면 그날이 정상 출근으로 바뀝니다.',
};

// 연차 — 근로기준법 기준 연 15일 고정으로 단순화(입사연차 가산 등은 미반영, MVP 틀)
export const ANNUAL_LEAVE_QUOTA = 15;

export interface AttendanceRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD, 연차/외근 사용일
  kind: AttendanceRequestKind;
  reason: string;
  status: RequestStatus;
  createdAt: string; // ISO
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // HH:mm
  clockOut: string | null; // HH:mm
}

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  reason: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  status: RequestStatus;
  createdAt: string; // ISO
  reviewedAt: string | null;
  reviewNote: string | null;
}

import type { Reinspection } from './lib/reinspection';

export type NotificationType =
  | 'MISSING'
  | 'CORRECTION_REQUEST'
  | 'ATTENDANCE_REQUEST'
  | 'MILEAGE_GAP'
  | 'DEALER_FEE'
  | 'APPROVAL'
  | 'AD_QUOTA'
  | 'RELEASE_PENDING'
  | 'REINSPECTION';

/**
 * 광고 계약.
 *
 * 광고 상품은 '월 몇 대'로 팔린다 — 22만원짜리가 월 30대, 3개월이면 90대다.
 * 약정 대수를 다 못 쓰면 그만큼 돈이 날아간다.
 * 금액은 원 단위다(22만원처럼 만원으로 안 떨어지는 경우가 있다).
 */
export interface AdPosting {
  id: string;
  vehicleNumber: string;
  postedOn: string; // YYYY-MM-DD
  /** 매입 관리에서 자동으로 붙은 건지 */
  auto: boolean;
  memo: string;
}

export interface AdContract {
  id: string;
  platform: string;
  productName: string;
  monthlyFee: number; // 원
  monthlyQuota: number; // 월 약정 대수
  months: number;
  startOn: string;
  endOn: string;
  note: string;
  active: boolean;
  postings: AdPosting[];
  /** 월별 집계 — "9월에 몇 건 하고 광고비 얼마 썼나" */
  monthly: {
    label: string; // "2026년 9월"
    from: string;
    quota: number;
    count: number;
    fee: number;
    /** 그 달에 못 쓴 건수만큼의 광고비 */
    wasted: number;
  }[];

  // ── 서버가 계산해 내려주는 값 (저장하지 않는다) ──
  totalQuota: number; // 월 대수 × 개월
  used: number;
  remaining: number;
  daysLeft: number;
  /** 남은 기간에 하루 몇 대를 올려야 다 쓰는지 */
  perDayNeeded: number;
  totalFee: number;
  /** 기간이 끝났는데 못 쓴 대수만큼의 광고비 */
  wastedFee: number;
}

/** 결재 문서 종류. 지금은 시말서 하나지만 휴가원·지출결의서처럼 늘어난다. */
export type ApprovalKind = 'INCIDENT_REPORT' | 'LEAVE' | 'EXPENSE';

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  INCIDENT_REPORT: '시말서',
  LEAVE: '휴가원',
  EXPENSE: '지출결의서',
};

/** 휴가 종류 — 목록에서 고른다. 손으로 적으면 '연차'와 '연 차'가 따로 논다. */
export const LEAVE_KINDS = ['연차', '반차', '병가', '경조', '공가', '기타'] as const;

/** 회사 시말서 양식에 박혀 있는 서약 문구 — 사람마다 다르게 적으면 다른 문서가 된다. */
export const INCIDENT_REPORT_PLEDGE =
  '본인은 직원으로서 맡은바 책임과 의무를 다하며 성실히 근무하여야 함에도 불구하고 아래와 같이 ' +
  '회사의 관련규정을 위반하였기에 이에 시말서를 제출하고 차후 본 건을 계기로 과오의 재발이 없을 것임을 서약합니다.';

export interface ApprovalDocument {
  id: string;
  kind: ApprovalKind;
  employeeId: string;
  /** 작성 시점의 값 — 나중에 부서가 바뀌어도 옛 문서는 그때 소속으로 남는다 */
  department: string;
  position: string;
  name: string;
  content: string; // 시말서는 경위, 휴가원은 사유, 지출결의서는 적요
  writtenOn: string; // YYYY-MM-DD

  // 양식마다 칸이 달라 비어 있을 수 있다
  leaveKind: string;
  startOn: string | null;
  endOn: string | null;
  days: number | null;
  spentOn: string | null;
  amount: number;
  payee: string;

  status: RequestStatus;
  reviewerId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  employee?: { id: string; name: string; position: string; department: string | null };
  reviewer?: { id: string; name: string; position: string } | null;
  createdAt: string;
}

/** 상조회비를 어떻게 받는가 */
export type DealerFeeMethod = 'AUTO' | 'DIRECT' | 'CANCELED';

export const DEALER_FEE_METHOD_LABEL: Record<DealerFeeMethod, string> = {
  AUTO: '자동이체',
  DIRECT: '직접이체',
  CANCELED: '자동이체 해지',
};

/**
 * 신차영업소 상조회비 납부현황 한 줄.
 *
 * 이체날짜·기한은 꼴이 제각각이라(매달5일 / 10-01 / 매달1일고정 / 직접이체)
 * 날짜형이 아니라 적힌 그대로 둔다.
 */
export interface DealerFeeAccount {
  id: string;
  dealerName: string; // 업체명
  managerName: string; // 담당자
  managerPhone: string; // 담당연락처
  startedOn: string | null; // 거래시작일
  bank: string;
  accountHolder: string; // 예금주
  accountNumber: string; // 자동이체계좌
  transferDay: string; // 자동이체날짜 — 적힌 그대로
  /** 위 문장에서 뽑아낸 이체일(1~31). 0이면 정해진 날이 없다 */
  transferDayOfMonth: number;
  monthlyFee: number; // 매달 회비(원)
  feeNote: string; // 정액이 아닐 때 적어두는 말
  method: DealerFeeMethod;
  autoTransferUntil: string; // 자동이체기한
  note: string; // 비고
  memo: string;
  active: boolean; // 거래중
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  employeeId: string;
  date: string; // related attendance date
  createdAt: string; // ISO
  read: boolean;
}

export type SettlementStatus = 'IN_PROGRESS' | 'COMPLETED';

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  IN_PROGRESS: '진행중',
  COMPLETED: '정산완료',
};

export interface SettlementRecord {
  id: string;
  employeeId: string; // 담당자
  vehicleInfo: string; // 차량번호/차종
  purchaseCost: number; // 매입가
  prepCost: number; // 상품화 비용
  saleAmount: number; // 판매금액
  feeAmount: number; // 수수료
  status: SettlementStatus;
  date: string; // YYYY-MM-DD, 정산 기준일
  memo: string;
  createdAt: string;
}

export function netProfit(r: Pick<SettlementRecord, 'purchaseCost' | 'prepCost' | 'saleAmount' | 'feeAmount'>): number {
  return r.saleAmount - r.purchaseCost - r.prepCost - r.feeAmount;
}

// ─────────────────────────────────────────────────────────────
// 알선 정산 — 시트지 컬럼 그대로
// 일자 / 차량번호 / 차량명 / 총 진행 판매금액 / 실차주입금 / 수익금 / 이전비 /
// 이전비 잔액 / 현금 수수료 / 할부 피 / 보험 피 / 차대금업 / 정산받을금액
// (수익금·판매 수익은 저장하지 않고 항상 계산해서 씀 — 서버도 같은 식을 쓴다)
// ─────────────────────────────────────────────────────────────
export interface BrokerageSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  /** 알선 / 수출 — 상담에서 넘어올 때 그쪽 종류를 물려받는다 */
  kind: ConsultationKind;
  vehicleNumber: string;
  vehicleName: string;
  totalSaleAmount: number; // 총 진행 판매금액
  ownerDeposit: number; // 실차주입금
  transferFee: number; // 이전비
  transferFeeBalance: number; // 이전비 잔액
  cashCommission: number; // 현금 수수료
  /** 대표가 현금 수수료를 받았다고 찍은 때. 안 찍었으면 null */
  cashConfirmedAt?: string | null;
  installmentFee: number; // 할부 피
  insuranceFee: number; // 보험 피
  etcCost: number; // 차대금업 (DB 칸 이름은 그대로 둔다 — 지난 자료가 들어 있다)
  settlementAmount: number; // 정산받을금액
  employeeId: string;
  status: SettlementStatus;
  memo: string;
  createdAt: string;

  // ── 결재 ── (매입 정산과 같은 흐름 — 본부장 → 대표)
  /** 계약서 사진 경로 — 한 장 */
  contractPhotos?: string;
  /** 담당자가 다 채워 올린 때 */
  submittedAt?: string | null;
  chiefApprovedAt?: string | null;
  chiefApprover?: string;
  ceoApprovedAt?: string | null;
  ceoApprover?: string;
  /** 서버가 날짜로 내주는 단계 */
  stage?: SettlementStage;
  /** 본부장이 찍은 뒤부터는 못 고친다 */
  locked?: boolean;
  /** 본부장을 거치는 건인가 — 담당자에 따라 대표만 찍는 건이 있다 */
  chiefRequired?: boolean;
}

/**
 * 수익금 = 현금 수수료 + 할부 피 + 보험 피 + 차대금업
 *
 * 예전에는 '총 진행 판매금액 − 실차주입금' 이었다. 차값이 오가는 건 회사 돈이 들고 나는
 * 것이고, 알선으로 실제로 남는 건 수수료·피 쪽이라 그것만 센다.
 * 총 판매금액과 실차주입금은 그대로 적어둔다 — 얼마짜리 거래였는지는 남아야 한다.
 */
export function brokerageProfit(r: Pick<BrokerageSettlement, 'cashCommission' | 'installmentFee' | 'insuranceFee' | 'etcCost'>): number {
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

/**
 * 매입 정산 결재 단계.
 *
 * 작성 중 → 승인 요청 → 본부장 승인 → 대표 승인(확정).
 * 서버(settlements/approvers.ts)와 같은 이름을 쓴다 — 고칠 땐 양쪽을 같이 본다.
 */
export type SettlementStage = 'DRAFT' | 'SUBMITTED' | 'CHIEF' | 'DONE';

export const SETTLEMENT_STAGE_LABEL: Record<SettlementStage, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '본부장 승인 대기',
  CHIEF: '대표 승인 대기',
  DONE: '확정',
};

export const SETTLEMENT_STAGE_CLASS: Record<SettlementStage, string> = {
  DRAFT: 'border-slate-200 bg-slate-100 text-slate-600',
  SUBMITTED: 'border-amber-300 bg-amber-50 text-amber-800',
  CHIEF: 'border-sky-300 bg-sky-50 text-sky-800',
  DONE: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

// ─────────────────────────────────────────────────────────────
// 매입 정산 — 시트지 컬럼 그대로
// ─────────────────────────────────────────────────────────────
// ── 상품화 비용 명세 ──
//
// 항목 6종으로 나누고, 항목 안에서 다시 업체·카테고리별로 적는다.
// 광택은 A광택집·B광택집으로 갈리고, 진단비는 플랫폼마다 광고 형태와 비용이 다르다.

export const PREP_COST_KINDS = ['POLISH_WASH', 'DENT', 'PERFORMANCE', 'DELIVERY', 'REPAIR', 'DIAGNOSIS'] as const;

export type PrepCostKind = (typeof PREP_COST_KINDS)[number];

export const PREP_COST_LABEL: Record<PrepCostKind, string> = {
  POLISH_WASH: '광택·세차',
  DENT: '판금·덴트',
  PERFORMANCE: '성능비',
  DELIVERY: '탁송비',
  REPAIR: '수리비',
  DIAGNOSIS: '진단비',
};

/** 진단비는 플랫폼 수수료라 업체가 아니라 '어떤 광고 상품인지'를 적는다. */
export const PREP_COST_VENDOR_HINT: Record<PrepCostKind, string> = {
  POLISH_WASH: '광택집 이름',
  DENT: '판금집 이름',
  PERFORMANCE: '성능점 이름',
  DELIVERY: '탁송업체',
  REPAIR: '정비소 이름',
  DIAGNOSIS: '플랫폼·광고상품',
};

export interface PurchasePrepCost {
  id?: string;
  kind: PrepCostKind;
  vendor: string; // 업체·카테고리
  amount: number; // 만원
  memo: string;
  sortOrder?: number;
}

export type PrepCostBreakdown = Record<PrepCostKind, number>;

export const EMPTY_PREP_BREAKDOWN: PrepCostBreakdown = {
  POLISH_WASH: 0,
  DENT: 0,
  PERFORMANCE: 0,
  DELIVERY: 0,
  REPAIR: 0,
  DIAGNOSIS: 0,
};

export interface PurchaseSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  vehicleName: string;
  vehicleNumber: string;
  transferFee: number; // 이전비 + 추가이전비
  purchasePrice: number; // 매입가
  brokerFee: number; // 구전 — 상품화가 아니라 별도 항목
  /** 구전 지급방식 — 현금으로 준 것만 판매수익에서 뺀다 */
  brokerFeePayout: BrokerFeePayout;
  /** 계약서 사진 경로 — 줄바꿈으로 이어 담는다. 결재하는 쪽에서 화면으로 본다 */
  contractPhotos?: string;
  prepCosts: PurchasePrepCost[]; // 상품화 비용 명세

  // ── 판매 쪽 — 상담이 판매완료로 끝나면 채운다 ──
  salePrice: number; // 차량판매가
  cashCommission: number; // 현금 수수료
  installmentFee: number; // 할부 피
  insuranceFee: number; // 보험 피
  dealerLoanFee: number; // 차대금업
  settlementAmount: number; // 정산금액
  /** 신차이름 — 화면에서 뺐다. 예전 기록에 남아 있어 칸만 둔다 */
  newCarName?: string;
  employeeId: string;
  status: SettlementStatus;
  memo: string;
  createdAt: string;

  // ── 서버 파생값 ──
  /** 상품화총비용 — 명세를 더한 값 */
  prepTotal?: number;
  /** 항목별 합계 6칸 */
  prepBreakdown?: PrepCostBreakdown;
  /** 매입가 + 상품화총비용 */
  grandTotal?: number;
  /** 차량번호가 일치하는 차량의 주유·배터리·주차·수리 비용(원). 차량관리에 없는 번호면 0. */
  vehicleCost?: VehicleCostSummary;
  /** 최종 합계(원) = (매입+상품화총비용) × 10,000 + 차량비용 */
  grandTotalWon?: number;
  // ── 결재 ──
  /** 계약팀이 다 채워 올린 때 */
  submittedAt?: string | null;
  chiefApprovedAt?: string | null;
  chiefApprover?: string;
  ceoApprovedAt?: string | null;
  ceoApprover?: string;
  /** 서버가 날짜로 내주는 단계 */
  stage?: SettlementStage;
  /** 본부장이 찍은 뒤부터는 못 고친다 */
  locked?: boolean;
  /** 본부장을 거치는 건인가 — 담당자에 따라 대표만 찍는 건이 있다 */
  chiefRequired?: boolean;

  /** 판매수익 — 현금 수수료 + 할부 피 + 보험 피 + 차대금업 − 현금으로 준 구전 */
  saleProfit?: number;
  /** 차량판매가 − (매입+부대비용) + 판매수익 */
  saleNet?: number;
}

/**
 * 차량관리(주유·배터리·주차)에서 차량번호로 자동으로 붙는 비용 — 단위는 '원'.
 * 서버가 조회할 때마다 계산해서 내려주는 파생값이라 저장되지 않는다.
 */
export interface VehicleCostSummary {
  fuel: number; // 주유
  battery: number; // 배터리
  parking: number; // 주차
  repair: number; // 소모품·수리
  etc: number; // 기타
  total: number;
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

// 매입 정산은 이제 원 단위로 저장한다(만원 정수로는 3.5를 못 담아서).
// 만원 표기는 src/lib/money.ts 의 wonToManwon / manwonToWon 이 맡는다.

// 상품화총비용 = 광택·세차 + 판금·덴트 + 성능비 + 탁송비 + 수리비 + 진단비
// 구전과 이전비는 상품화가 아니라 별도 항목이라 제외한다.
// (서버 settlement.calc.ts 와 같은 식 — 고칠 땐 양쪽을 같이 본다)
export function purchasePrepTotal(costs: { amount: number }[]): number {
  return costs.reduce((sum, c) => sum + c.amount, 0);
}

/** 항목별 합계 — 명세 여러 줄을 6칸으로 접는다. */
export function prepBreakdown(costs: { kind: PrepCostKind; amount: number }[]): PrepCostBreakdown {
  const result = { ...EMPTY_PREP_BREAKDOWN };
  for (const c of costs) result[c.kind] += c.amount;
  return result;
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

// 상담 → 계약 → 판매완료 → (정산) 순으로 간다. 보류·종결은 그 흐름에서 빠지는 갈래다.
export type ConsultationStatus = 'IN_PROGRESS' | 'CONTRACTED' | 'SOLD' | 'ON_HOLD' | 'CLOSED';

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  IN_PROGRESS: '진행중',
  CONTRACTED: '계약',
  SOLD: '판매완료',
  ON_HOLD: '보류',
  CLOSED: '종결',
};

/**
 * 상담 유입 경로 — 버튼으로 눌러 채운다.
 * 목록에 없는 곳도 있어서 칸은 자유 입력으로 열어둔다.
 */
export const CONSULTATION_PLATFORMS = ['엔카', '차차차', '오토벨', '114', '자사몰', '인스타', '기타'] as const;

/**
 * 상담 종류. 알선과 수출은 받는 창구도 손님도 다르지만 적는 내용과 흐름
 * (상담 → 계약 → 종결 → 판매완료)이 같아서, 한 곳에 쌓고 구분만 나눈다.
 */
export type ConsultationKind = 'BROKERAGE' | 'EXPORT';

export const CONSULTATION_KIND_LABEL: Record<ConsultationKind, string> = {
  BROKERAGE: '알선',
  EXPORT: '수출',
};

/** 유입 경로 빠른 선택 — 수출은 들어오는 곳이 다르다. 어느 쪽이든 직접 입력도 된다. */
export const CONSULTATION_PLATFORMS_BY_KIND: Record<ConsultationKind, readonly string[]> = {
  BROKERAGE: CONSULTATION_PLATFORMS,
  EXPORT: ['카비어', '딜러', '직거래', '기타'],
};

/** 손님이 차값을 어떻게 치렀는가 */
export type PayMethod = 'UNKNOWN' | 'CASH' | 'INSTALLMENT';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  UNKNOWN: '미정',
  CASH: '현금',
  INSTALLMENT: '할부',
};

export interface ConsultationRecord {
  id: string;
  kind: ConsultationKind;
  platform: string; // 유입 경로
  vehicleNumber: string;
  vehicleName: string; // 차명
  customerPhone: string; // 손님번호
  /** 예전 양식의 고객명 — 손님번호로 바꾸기 전 상담에만 남아 있다 */
  customerName: string;
  employeeId: string; // 담당자
  status: ConsultationStatus;
  date: string; // YYYY-MM-DD, 상담일시(날짜만)
  time: string; // HH:mm
  content: string; // 상담내용
  /** 손님 방문 예정일 */
  visitDate: string | null;
  /** 방문 시각 — "오후 3시~4시"처럼 적힌 그대로 둔다(범위나 두루뭉술한 표현이 많다) */
  visitTime: string;
  /** 출고 시 입금액(만원) — 카톡방에 올리는 "입금1000만원"이 이 값이다 */
  depositAmount: number;
  nextContactDate: string | null; // 다음 연락 예정일

  /**
   * 현금인가 할부인가.
   *
   * 할부면 어느 캐피탈로 얼마를 깔았는지 같이 적는다 — 재고금융을 쓴 캐피탈에
   * 약정만큼 채웠는지 세는 값이다. 지난 상담은 안 적혀 있어 '미정'이다.
   */
  payMethod?: PayMethod;
  installmentCapital?: string;
  installmentAmount?: number; // 원

  files: { id: string; fileName: string; url: string }[];
  createdAt: string;
}

export type ParkingStatus = 'DISPLAY' | 'SOLD' | 'RESERVED' | 'MOVING';

export const PARKING_STATUS_LABEL: Record<ParkingStatus, string> = {
  DISPLAY: '전시중',
  // DB 값은 그대로 두고 이름만 바꾼다 — 예전 자료를 옮기지 않아도 되고,
  // 부르는 이름은 앞으로도 또 바뀔 수 있다.
  SOLD: '엔카 진단예정',
  RESERVED: '출고대기',
  MOVING: '이동중',
};

export interface ParkingVehicle {
  id: string;
  lot: string; // 주차장 (예: B4F-B05)
  zone: string; // 구역 (예: 9구역)
  slot: string; // 위치 (예: 앞 / 뒤)
  vehicleNumber: string;
  vehicleModel: string;
  status: ParkingStatus;
  employeeId: string; // 담당자
  memo: string;
  updatedAt: string;

  // ── 서버 파생값 ── (차량관리의 이전일자를 차량번호로 짝지어 붙여 준다)
  /** 이전일자 — 차량관리에 없는 번호면 null */
  transferDate?: string | null;
  /** 재검을 받은 날 — 받았으면 이 날부터 다시 넉 달을 센다 */
  lastInspectedOn?: string | null;
  /** 재검 시기. 아직 멀었으면 null */
  reinspect?: Reinspection | null;
}

// 매물 사진 게시판 — 사이트에 올릴 차량 정보와 사진을 올려두고 전 직원이 같이 보는 용도
export const VEHICLE_POST_SITES = ['엔카', 'KB차차차', '보배드림', '차란차', '당근마켓', '기타'] as const;

export const VEHICLE_POST_PHOTO_MAX = 5;

export interface VehiclePost {
  id: string;
  site: string; // 사이트 (엔카/KB차차차 등)
  vehicleNumber: string; // 차량번호
  vehicleModel: string; // 차명
  customerPhone: string; // 손님번호
  content: string; // 내용
  photos: { id: string; url: string }[]; // 서버에 올린 사진 경로
  employeeId: string; // 등록자
  createdAt: string;
  updatedAt: string;
}

// 작업일지 — 날짜별 할 일 한 줄이 한 레코드. 화면에서는 주간 플래너로 모아 본다.
export interface WorkLog {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  content: string;
  done: boolean;
  sortOrder: number; // 같은 날 안에서의 순서
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 차량 관리 — 외부 이동 리스트 / 주유·배터리 비용
// ─────────────────────────────────────────────────────────────

// 매입되어 단지로 들어온 차량. 어느 리스트에 뜰지는 체크박스 조합으로 계산한다(lib/vehicle.ts).
/** 차종 — 주차 배치가 차종부터 갈린다(SUV·화물은 평동, 소형차는 팬슬) */
export type VehicleBodyType = 'COMPACT' | 'SEDAN' | 'SUV' | 'TRUCK' | 'VAN' | 'OTHER';

export const VEHICLE_BODY_TYPE_LABEL: Record<VehicleBodyType, string> = {
  COMPACT: '소형차',
  SEDAN: '세단',
  SUV: 'SUV',
  TRUCK: '화물',
  VAN: '승합',
  OTHER: '미분류',
};

/** 판매 유형 — 수출은 고색동 A·B, 일반광고는 고색동 C */
export type VehicleSaleType = 'GENERAL' | 'EXPORT';

export const VEHICLE_SALE_TYPE_LABEL: Record<VehicleSaleType, string> = {
  GENERAL: '일반광고',
  EXPORT: '수출',
};

export interface ManagedVehicle {
  id: string;
  vehicleNumber: string; // "12가3456" / "123가4567"
  plateTail: string; // 뒤 4자리
  vehicleModel: string;
  prepared: boolean; // 상품화
  advertised: boolean; // 광고 완료 — 상품화 없이는 켤 수 없다
  moveBlocked: boolean; // 외부 이동 금지 — 켜지면 무조건 이동금지

  // ── 주차 배치 기준 ──
  priceManwon: number; // 시세 또는 매입가(만원)
  fuel: string;
  bodyType: VehicleBodyType;
  saleType: VehicleSaleType;
  isTaxi: boolean; // 택시 — 배양동 외부로 간다

  // ── 제시 가능 여부를 가리는 값 (매입 관리에서 채워진다) ──
  modelYear: string; // 연식 — "2016"
  mileage: number; // 주행거리(km)

  // ── 재고금융(제시) ──
  /** 등록증상 최초등록일 — 10년차 경계를 월까지 봐야 갈릴 때만 채운다 */
  firstRegisteredOn: string | null;
  /** 재고금융이 안 되는 차. 현금으로 산다 */
  cashVehicle: boolean;
  offerDate: string | null; // 제시일자 — 캐피탈에 제시한 날
  transferDate: string | null; // 이전일자 — 명의 이전한 날
  /** 매도일자 — 손님에게 실제로 넘긴 날. 적으면 매도 차량으로 넘어간다 */
  soldDate: string | null;
  /** 출고 예정 — 상담이 판매완료인데 아직 매도일자를 안 적었다. 서버가 상담과 맞춰 내려준다 */
  releasePending?: boolean;
  /** 매입 관리에 적은 매입금액(원). 매입 기록이 없으면 null */
  intakeAmount?: number | null;
  /** 매입 관리에 적은 매입일. 제시 대상을 달별로 볼 때 쓴다 */
  intakeDate?: string | null;
  stockCapital: string; // 할부사
  stockAmount: number; // 재고금액(원)
  /** 이 차 한 대에 쓴 광고비(원) — 광고 관리에서 적는다 */
  adCost: number;
  repayDate: string | null; // 상환일자 — 월별로 모아 본다

  createdAt: string;
  updatedAt: string;
}

export type VehicleExpenseKind = 'FUEL' | 'BATTERY' | 'REPAIR' | 'ETC';

export const VEHICLE_EXPENSE_KIND_LABEL: Record<VehicleExpenseKind, string> = {
  FUEL: '주유',
  BATTERY: '배터리',
  REPAIR: '소모품 수리',
  ETC: '기타',
};

/**
 * 메모를 받는 종류.
 * 항목 이름만으로는 무엇에 쓴 돈인지 알 수 없는 것들이다 —
 * 같은 '소모품 수리'라도 타이어인지 썬팅인지가 나중에 정산에서 갈린다.
 */
export const VEHICLE_EXPENSE_MEMO_KINDS: VehicleExpenseKind[] = ['REPAIR', 'ETC'];

/** 무엇을 적으면 되는지 보여주는 예시 — 실제로 자주 올라오는 항목들이다. */
export const VEHICLE_EXPENSE_MEMO_PLACEHOLDER = '사이드미러, 블랙박스, 썬팅, 타이어, 와이퍼, 케미칼류, 유리';

// 주유 비고 — 배터리에는 쓰지 않는다
export type VehicleUsageNote = 'IN_PREP' | 'TEST_DRIVE' | 'SOLD';

export const VEHICLE_USAGE_NOTE_LABEL: Record<VehicleUsageNote, string> = {
  IN_PREP: '상품중',
  TEST_DRIVE: '시승중',
  SOLD: '판매완료',
};

// 등록할 때마다 쌓이는 이력. 금액 단위는 정산(만원)과 달리 '원'이다.
export interface VehicleExpenseLog {
  id: string;
  vehicleId: string;
  kind: VehicleExpenseKind;
  amount: number; // 원
  date: string; // YYYY-MM-DD
  note: VehicleUsageNote | null;
  memo: string; // 무엇에 쓴 돈인지 — 소모품·수리와 기타에서 쓴다
  employeeId: string;
  vehicle: { id: string; vehicleNumber: string; vehicleModel: string };
  employee: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 관리자 ↔ 직원 메시지
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null; // 상대가 읽은 시각
  createdAt: string;
  sender: { id: string; name: string; role: Role; position: string };
}

export interface ChatConversation {
  id: string;
  /** 대화 상대 — 내가 관리자면 직원이, 직원이면 관리자가 온다 */
  partner: { id: string; name: string; position: string; role: Role };
  lastMessage: Pick<ChatMessage, 'id' | 'body' | 'senderId' | 'createdAt' | 'readAt'> | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface AppState {
  employees: Employee[];
  records: AttendanceRecord[];
  requests: CorrectionRequest[];
  notifications: AppNotification[];
  currentEmployeeId: string;
  ipWhitelist: string[];
  settlements: SettlementRecord[];
  brokerageSettlements: BrokerageSettlement[];
  purchaseSettlements: PurchaseSettlement[];
  consultations: ConsultationRecord[];
  parkingVehicles: ParkingVehicle[];
  attendanceRequests: AttendanceRequest[];
  vehiclePosts: VehiclePost[];
}

// ─────────────────────────────────────────────
// 매입 관리 — 차를 사올 때 받아 적는 인수 내역
// ─────────────────────────────────────────────

// 금액 단위는 정산(만원)과 달리 '원'이다.
/**
 * 구전 지급 방식. 세금 처리가 달라 금액만으로는 실지급액을 알 수 없다.
 * 현금이 제일 많아 기본값으로 둔다.
 */
export type BrokerFeeType = 'CASH' | 'WITHHOLD_3_3' | 'WITHHOLD_13_3';

export const BROKER_FEE_TYPE_LABEL: Record<BrokerFeeType, string> = {
  CASH: '현금',
  WITHHOLD_3_3: '3.3% 원천징수',
  WITHHOLD_13_3: '13.3% 원천징수',
};

/** 원천징수 비율 — 현금은 떼는 게 없다 */
export const BROKER_FEE_TYPE_RATE: Record<BrokerFeeType, number> = {
  CASH: 0,
  WITHHOLD_3_3: 0.033,
  WITHHOLD_13_3: 0.133,
};

export interface PurchaseIntake {
  id: string;
  date: string; // YYYY-MM-DD

  customerPhone: string; // 고객번호
  customerName: string; // 고객이름
  source: string; // 매입처
  inspector: string; // 실차 확인자

  vehicleName: string; // 차명
  /** 세부모델(등급) — "2.4 GDI 프레스티지". 카비어에서 받아온 건 비어 있다 */
  detailModel: string;
  vehicleNumber: string;
  modelYear: string; // 연식
  /** 등록증상 최초등록일 — 재고금융 10년차 경계를 월까지 가릴 때 쓴다 */
  firstRegisteredOn: string | null;
  fuel: string; // 연료
  keyCount: number; // 차키갯수
  mileage: number; // 주행거리(km) — 매입할 때 받아 적은 값
  /** 실차 확인자가 차를 보고 다시 적은 주행거리. 0이면 아직 확인 안 함 */
  checkedMileage: number;
  note: string; // 특이사항

  purchaseAmount: number; // 실매입금액(원)
  brokerFee: number; // 구전(원)
  brokerFeeType: BrokerFeeType; // 구전 지급 방식
  /** 차량 관리에 올라가 있는가 — 안 올라가 있으면 재고금융 제시 대상에 안 뜬다 */
  registered?: boolean;
  /** 이 차가 얼마에 팔렸는지(원). 아직 안 팔았으면 0 */
  salePrice?: number;
  /** 서버 파생값 — 실매입금액 + 구전. 저장하지 않는다. */
  totalAmount: number;

  employeeId: string;
  employee?: { id: string; name: string; position: string };
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// 청소 관리 대장
// ─────────────────────────────────────────────

// 벽에 붙여두고 손으로 체크하던 대장을 그대로 옮긴 것.
//
// 층마다 대장이 따로 있고 항목도 다르다. 겹치는 것(쓸기·정수기·쓰레기·빗자루)은 저장 칸을
// 같이 쓰되 층에서 부르는 이름으로 보여준다 — 층이 늘면 여기에 한 줄 더 넣고,
// 새 항목이 필요하면 서버 CleaningLog 모델에 칸을 늘린다.
export type CleaningItemKey =
  | 'sweep'
  | 'wipe'
  | 'waterPurifier'
  | 'shredder'
  | 'trashBin'
  | 'paperCup'
  | 'broomClean'
  | 'wetMop'
  | 'boxDisposal'
  | 'deskTidy';

export interface CleaningItem {
  key: CleaningItemKey;
  label: string;
}

export interface CleaningFloor {
  key: string;
  label: string;
  items: CleaningItem[];
  /** 대장 위에 붙여두는 주의사항 — 체크하는 게 아니라 청소할 때 지킬 일이다 */
  notice?: string;
}

export const CLEANING_FLOORS: CleaningFloor[] = [
  {
    key: '5F',
    label: '5층',
    items: [
      { key: 'sweep', label: '쓸기' },
      { key: 'wipe', label: '닦기' },
      { key: 'waterPurifier', label: '정수기' },
      { key: 'shredder', label: '파쇄기' },
      { key: 'trashBin', label: '쓰레기통 누르기' },
      { key: 'paperCup', label: '종이컵 정리' },
      { key: 'broomClean', label: '빗자루닦기' },
      { key: 'boxDisposal', label: '박스 버리기' },
      { key: 'deskTidy', label: '책상 정리' },
    ],
    notice: '형광등으로 바꾸고 청소해야 잘 보입니다.',
  },
  {
    key: '1F',
    label: '1층',
    items: [
      { key: 'sweep', label: '쓸기' },
      { key: 'broomClean', label: '빗자루 청소' },
      { key: 'wetMop', label: '물걸레' },
      { key: 'waterPurifier', label: '정수기정리' },
      { key: 'trashBin', label: '쓰레기 비움' },
    ],
  },
];

export interface CleaningLog {
  id: string;
  floor: string; // '5F' | '1F'
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  employeeId: string;
  employee?: { id: string; name: string; position: string };

  sweep: boolean;
  wipe: boolean;
  waterPurifier: boolean;
  shredder: boolean;
  trashBin: boolean;
  paperCup: boolean;
  broomClean: boolean;
  wetMop: boolean;
  boxDisposal: boolean;
  deskTidy: boolean;

  note: string; // 기타
  createdAt: string;
  updatedAt: string;
}
