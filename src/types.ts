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
  /** 알선팀 타이틀 — 비어 있으면 알선팀이 아니다 */
  referralTitle?: ReferralTitle | '';
}

/**
 * 알선팀 타이틀.
 *
 * 직책과 다르다. 직책은 회사 안에서의 자리고, 이건 알선팀 안에서의 등급이라 실적으로
 * 오르내린다. 이름 왼쪽에 붙여 누가 팀장인지 한눈에 보이게 한다.
 */
export const REFERRAL_TITLES = ['LEADER', 'PRO', 'JUNIOR'] as const;
export type ReferralTitle = (typeof REFERRAL_TITLES)[number];

export const REFERRAL_TITLE_LABEL: Record<ReferralTitle, string> = {
  LEADER: '팀장',
  PRO: '프로',
  JUNIOR: '주니어',
};

/**
 * 이름 앞에 붙는 그림.
 *
 * 글자로 달면 이름 앞이 글자 두 겹이 되어 정작 이름이 안 읽힌다. 한 자리만 쓰고 멀리서도
 * 갈리는 그림으로 둔다 — 주니어는 애기, 프로는 정장, 팀장은 차려입은 사람이다.
 */
export const REFERRAL_TITLE_EMOJI: Record<ReferralTitle, string> = {
  LEADER: '🕴️',
  PRO: '🧑‍💼',
  JUNIOR: '👶',
};

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

/*
  연차 한도는 두지 않는다.

  근로기준법 15일로 박아 뒀었는데 입사일·근속에 따라 사람마다 다르고, 그 원본 자료가
  우리한테 없다. 모르는 값을 아는 척해 '남은 연차'를 띄우면 그걸 믿고 쓴다.
  쓴 날만 세고, 한도는 사람이 판단한다.
*/

export interface AttendanceRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD, 연차/외근 사용일
  kind: AttendanceRequestKind;
  reason: string;
  /**
   * 증빙 사진 — 반차·조퇴에 병원 영수증 같은 것을 붙인다. 여러 장이면 줄바꿈으로 이었다.
   *
   * 본인과 관리자에게만 내려온다 — 남의 신청은 날짜와 사유만 보이고 여기는 빈 칸이다.
   */
  photos?: string;
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
  /** 구내식당에서 먹었는가 — null 이면 출퇴근 시각으로 자동 판정한다 */
  mealUsed?: boolean | null;
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
 * 광고 상품은 '대당 얼마'로 팔린다 — 22만원 상품은 한 대 찍을 때마다 22만원이다.
 * 22만원 상품에는 분기마다 90대를 찍어야 하는 약정이 붙고, 10만원 상품은 대수 제약이 없다.
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

/** 월별 광고비 채널 — 자주 쓰는 이름. 치다 보면 '114우선문의'와 '114 우선문의'로 갈려서 골라 넣게 한다 */
export const AD_SPEND_CHANNELS = [
  '구글 애즈',
  '114 우선문의',
  '스마트로그',
  '인스타그램',
  '네이버 파워링크',
  '채널웍스',
  '알바천국',
] as const;

export const AD_SPEND_STATUSES = ['신규', '유지', '중지', '종료'] as const;

/** 광고 운영 현황 메모 — 대행사 주차별 보고처럼 여러 줄짜리 글 */
export interface AdReport {
  id: string;
  month: string; // YYYY-MM
  channel: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

/** 월별 광고비 — 엔카·차차차 약정 외 광고에 그 달 쓴 돈(원) */
export interface AdSpend {
  id: string;
  month: string; // YYYY-MM
  channel: string;
  amount: number;
  status: string;
  owner: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdContract {
  id: string;
  platform: string;
  productName: string;
  /** 대당 금액(원) — 22만원 상품이면 220,000. 찍은 대수만큼 나간다 */
  unitFee: number;
  /** 약정 주기 — 분기 / 월 / 없음(대수 제약 없는 상품) */
  quotaCycle: '분기' | '월' | '없음';
  /** 그 주기에 찍어야 하는 대수 — 분기 90 */
  quotaCount: number;
  months: number;
  startOn: string;
  endOn: string;
  note: string;
  active: boolean;
  postings: AdPosting[];

  // ── 서버가 계산해 내려주는 값 (저장하지 않는다) ──
  /** 주기별 집계 — 분기 약정이면 달력 분기로 끊는다 */
  periods: {
    label: string; // "2026년 3분기"
    from: string;
    to: string; // 다음 주기 첫날 (이 날은 안 들어간다)
    quota: number; // 0이면 대수 제약 없음
    count: number;
    fee: number; // 대당 금액 × 찍은 대수
    shortfall: number; // 모자란 대수
  }[];
  used: number; // 계약 전체로 찍은 대수
  daysLeft: number; // 계약 마감까지
  totalFee: number; // 대당 금액 × 찍은 대수
  /** 오늘이 들어 있는 주기. 계약이 끝났거나 아직 시작 전이면 null */
  current: {
    label: string;
    quota: number;
    count: number;
    fee: number;
    remaining: number;
    daysLeft: number;
    perDayNeeded: number;
  } | null;
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
  content: string; // 시말서는 '1. 사건 및 경위', 휴가원은 사유, 지출결의서는 적요
  writtenOn: string; // YYYY-MM-DD

  /*
    시말서 — 회사 종이 양식을 그대로 옮긴 칸들.

    네 꼭지(사건 및 경위 / 발생 원인 및 사유 / 조치 사항 / 재발 방지 대책)와 발생
    일시·장소가 양식에 있다. 한 칸에 몰아 적게 두면 적는 사람마다 꼭지를 빼먹거나
    순서가 달라져서, 뽑아 놓으면 종이 양식과 다른 문서가 된다.

    '사건 및 경위'는 content 를 그대로 쓴다 — 이미 적힌 시말서를 옮겨 적게 하지 않는다.
    발생 시각은 글자다("오후 3시쯤"처럼 적어 온다).
  */
  occurredOn?: string | null;
  occurredTime?: string;
  occurredPlace?: string;
  cause?: string;
  action?: string;
  prevention?: string;

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
  /**
   * 사진 한 장 — 명함·간판·약정서처럼 글로 못 적는 것.
   *
   * 한 장만 받는다. 여러 장을 받으면 어느 게 지금 맞는 것인지 아무도 모른다.
   */
  photo: string;
  active: boolean; // 거래중
  createdAt: string;
  updatedAt: string;

  /**
   * 업체명에서 뽑은 제조사 — 서버가 볼 때마다 낸다(따로 적게 하면 업체명과 어긋난다).
   * 못 알아본 곳은 null. 화면에서 '기타'로 묶는다.
   */
  brand?: string | null;
}

/** 제조사 이름 — 서버 dealer-match.ts 의 key 와 짝이다. 보여주기용이라 여기만 고치면 된다. */
export const DEALER_BRAND_LABEL: Record<string, string> = {
  hyundai: '현대',
  kia: '기아',
  renault: '르노삼성',
  byd: 'BYD',
  zeekr: '지커',
  bmw: 'BMW',
  benz: '벤츠',
  audi: '아우디',
  vw: '폭스바겐',
  porsche: '포르쉐',
  volvo: '볼보',
  toyota: '토요타',
  lexus: '렉서스',
  ford: '포드',
  jeep: '지프',
  cadillac: '캐딜락',
  landrover: '랜드로버',
};

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
  /**
   * 그 차를 얼마에 사 왔고 구전을 얼마 줬나 — 매입 관리에서 차량번호로 붙여 준다.
   * 매입 기록이 없으면 0이다. 수출 정산에서 사 온 값과 같이 놓고 본다.
   */
  purchaseAmount?: number;
  intakeBrokerFee?: number;
  totalSaleAmount: number; // 총 진행 판매금액
  ownerDeposit: number; // 실차주입금
  transferFee: number; // 이전비
  transferFeeBalance: number; // 이전비 잔액
  cashCommission: number; // 현금 수수료
  /** 대표가 현금 수수료를 받았다고 찍은 때. 안 찍었으면 null */
  cashConfirmedAt?: string | null;
  installmentFee: number; // 할부 피 — 우리가 받은 수수료
  /** 어느 캐피탈로 얼마를 깔았는가 — 재고 금융 약정을 세는 값 */
  installmentCapital: string;
  installmentAmount: number; // 할부 실행액(원) — 손님이 깔아 준 원금
  insuranceFee: number; // 보험 피
  etcCost: number; // 차대금업 (DB 칸 이름은 그대로 둔다 — 지난 자료가 들어 있다)
  realSalePrice: number; // 실 차량판매가 — 0이면 아직 안 적은 것이다
  /** 어디서 들어온 건인가 — 엔카 · 차차차 · 자사몰 · 지인소개 … 목록에 없는 것도 적는다 */
  platform: string;
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
 * 실 차량판매가 — 차가 실제로 얼마에 나갔나.
 *
 * 실차주입금이 먼저다. 네 곳(상담·제시 금융·알선 정산·매입 정산)이 같이 쓰는 판매가가
 * 그 칸에 들어간다 — 어디서 고치든 그 값으로 맞춰진다(서버 sale-price).
 *
 * 그 전에는 '실 차량판매가' 칸을 먼저 봤다. 적는 사람이 거의 안 쓰는 칸이라 대개
 * 비어 있었고, 그래서 실차주입금 + 차대금업으로 대중을 잡았다. 지금은 맞춰 넣는
 * 자리가 실차주입금이라 그걸 그대로 쓴다 — 더하면 두 번 더하는 셈이 된다.
 *
 * 둘 다 비면 0이다. 0은 '아직 안 적음'이다 — 공짜로 판 차는 없다.
 */
export function brokerageSalePrice(
  r: Pick<BrokerageSettlement, 'ownerDeposit' | 'etcCost'> & { realSalePrice?: number },
): number {
  if (r.ownerDeposit > 0) return r.ownerDeposit;
  return r.realSalePrice && r.realSalePrice > 0 ? r.realSalePrice : 0;
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
  /** 플랫폼 수수료(원) — 헤이딜러·엔카 경매장에서 사오면 내는 돈 */
  platformFee: number;
  /** 구전 지급방식 — 현금으로 준 것만 판매수익에서 뺀다 */
  brokerFeePayout: BrokerFeePayout;

  /**
   * 상사 정산서 맨 아래 '실제지급액' — 통장에 실제로 들어온 돈.
   * 적혀 있으면 판매수익을 이 금액으로 낸다(매입가·재고 금융·세금은 이미 빠져 있다).
   */
  payoutAmount?: number;
  /*
    카비어 수수료를 무는가.

    null 이면 '검차 리포트 따라감'이다 — 리포트가 붙은 차만 문다. true/false 면
    사람이 손으로 켜거나 끈 것이고, 그 값이 이긴다.
  */
  carvior?: boolean | null;
  /*
    견적 본 사람 — 차를 보러 가서 값을 매긴 사람.

    담당자와 다르다. 담당자는 이 정산을 적는 계약팀이고, 견적은 이우주·김진후·안원용
    처럼 매입을 뛰는 사람이 본다. 한 칸에 섞으면 둘 중 하나가 지워진다.

    비어 있으면 서버가 매입 관리의 실차 확인자를 대신 담아 보낸다.
  */
  appraiser?: string;
  /** 매입 관리에 적힌 실차 확인자 — 견적 칸이 비었을 때 어디서 온 이름인지 */
  inspector?: string;
  /*
    중복으로 잡혀 지울 때가 찍힌 줄.

    바로 안 지운다 — 하루 동안 줄을 그어 두고 보여 준 다음에 지운다. 사람이 보고
    '남겨두기'를 누를 틈이 있어야 한다.
  */
  deleteAt?: string | null;
  /** 이 차에 검차 리포트가 붙어 있나 — 서버가 매입 관리에서 붙여 준다 */
  hasReport?: boolean;
  /** 셈한 결과 — 실제로 무는가 */
  carviorOn?: boolean;
  /** 무는 금액(원). 안 물면 0 */
  carviorFee?: number;
  /** 매도정산 배분 — NEW(신차 30%) / PERSON(개인 50%). 빈 글자면 아직 안 정한 것 */
  profitShare?: string;
  /** 매도정산을 이미 받았는가 — 받은 건은 이번 달 받을 돈에서 뺀다 */
  profitSharePaid?: boolean;
  /** 그 사람이 가져가는 몫(원) — 서버가 판매수익에 비율을 곱해 내려준다 */
  shareAmount?: number;
  /**
   * 차가 들어온 날(입고일) — 매입 관리의 매입일을 서버가 차량번호로 붙여 준다.
   * 매입 기록이 없으면 재고 금융의 제시일자로 대신한다. 재고를 언제부터 들고 있었나.
   */
  intakeDate?: string | null;
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
  wash: number; // 외부주차장 세차
  repair: number; // 소모품·수리
  etc: number; // 기타
  total: number;
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
 * 매도정산 — 판매수익을 나누는 비율.
 *
 * 서버에도 같은 표가 있다(settlements/settlement.calc.ts) — 고칠 땐 양쪽을 같이 본다.
 * 금액은 서버가 내려준 것(shareAmount)을 쓴다. 화면에서 다시 곱하면 반올림이 어긋난다.
 */
export const PROFIT_SHARES = [
  { key: 'NEW', label: '신차', rate: 0.3 },
  { key: 'PERSON', label: '개인', rate: 0.5 },
] as const;

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

// 상담 → 계약 → 판매완료 → (정산) 순으로 간다. 보류·종결은 그 흐름에서 빠지는 갈래다.
export type ConsultationStatus =
  | 'IN_PROGRESS'
  | 'CONTRACTED'
  | 'SOLD'
  | 'ON_HOLD'
  | 'CLOSED'
  /**
   * 방문취소 — 약속은 잡혔는데 손님이 안 온 것(노쇼 포함).
   *
   * 맡은 딜러는 그 시간을 비워 두고 기다렸을 뿐 손님을 맞은 게 아니다. 방문 배정에서
   * 안 세고, 그 시간도 다시 빈 자리가 된다. 종결과는 다르다 — 종결은 상담이 끝난
   * 것이고, 이건 그날 안 온 것뿐이라 다시 부를 손님이다.
   */
  | 'VISIT_CANCELED';

/** 고르는 차례 — 흐름대로 늘어놓는다(진행중 → 계약 → 판매완료, 그리고 빠지는 갈래) */
export const CONSULTATION_STATUSES: ConsultationStatus[] = [
  'IN_PROGRESS',
  'CONTRACTED',
  'SOLD',
  'ON_HOLD',
  'VISIT_CANCELED',
  'CLOSED',
];

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  IN_PROGRESS: '진행중',
  CONTRACTED: '계약',
  SOLD: '판매완료',
  ON_HOLD: '보류',
  VISIT_CANCELED: '방문취소',
  CLOSED: '종결',
};

/**
 * 상담 유입 경로 — 버튼으로 눌러 채운다.
 * 목록에 없는 곳도 있어서 칸은 자유 입력으로 열어둔다.
 */
export const CONSULTATION_PLATFORMS = ['엔카', '차차차', '오토벨', '114', '자사몰', '인스타·SNS', '기타'] as const;

/**
 * 상담 종류. 알선과 수출은 받는 창구도 손님도 다르지만 적는 내용과 흐름
 * (상담 → 계약 → 종결 → 판매완료)이 같아서, 한 곳에 쌓고 구분만 나눈다.
 */
/**
 * 상담 다섯 — 누구 물건을 누가 파느냐로 갈린다.
 *
 * 돈이 어디로 가는지가 거기서 정해진다. 기타는 파는 사람이 우리 직원이 아니라
 * 담당자 자리에 남의 딜러·상사 이름이 들어간다.
 *
 * 타사는 다른 상사 차를 손님에게 붙이는 건이다. 들어오는 길이 카모두·카매니저 같은
 * 딜러 플랫폼이라, 자사 상담과 섞어 세면 어느 쪽이 얼마나 들어오는지 알 수 없다.
 */
export type ConsultationKind = 'SALE' | 'PARTNER' | 'BROKERAGE' | 'EXPORT' | 'OTHER';

export const CONSULTATION_KIND_LABEL: Record<ConsultationKind, string> = {
  SALE: '판매',
  PARTNER: '타사',
  BROKERAGE: '알선',
  EXPORT: '수출',
  OTHER: '기타',
};

/** 무엇을 뜻하는지 — 처음 보는 사람이 다섯을 못 가른다 */
export const CONSULTATION_KIND_HINT: Record<ConsultationKind, string> = {
  SALE: '우리 담당자가 우리 상사 물건을 팝니다',
  PARTNER: '다른 상사 물건을 손님에게 붙입니다 — 카모두·카매니저로 많이 들어옵니다',
  BROKERAGE: '우리 담당자가 타 상사 물건을 팝니다',
  EXPORT: '수출한 물건입니다',
  OTHER: '전화문의·방문처럼 차를 안 짚고 들어온 건입니다',
};

/** 그래프·배지에서 쓰는 색 */
export const CONSULTATION_KIND_COLOR: Record<ConsultationKind, { bar: string; chip: string; hex: string }> = {
  SALE: { bar: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700', hex: '#6366f1' },
  PARTNER: { bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700', hex: '#8b5cf6' },
  BROKERAGE: { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', hex: '#10b981' },
  EXPORT: { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', hex: '#0ea5e9' },
  OTHER: { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800', hex: '#f59e0b' },
};

/** 유입 경로 빠른 선택 — 수출은 들어오는 곳이 다르다. 어느 쪽이든 직접 입력도 된다. */
export const CONSULTATION_PLATFORMS_BY_KIND: Record<ConsultationKind, readonly string[]> = {
  SALE: CONSULTATION_PLATFORMS,
  // 타사 차를 붙이는 건은 딜러끼리 쓰는 데서 들어온다
  PARTNER: ['카모두', '카매니저', '엔카', '차차차', '전화', '기타'],
  BROKERAGE: ['엔카', '차차차', '자사몰', '지인소개', '기타'],
  EXPORT: ['엔카', '차차차', '기존거래처', '카비어', '기타'],
  OTHER: ['전화문의', '방문', '기타'],
};

/**
 * 거래처 분류 — 자주 쓰는 것을 미리 골라둔다.
 * 목록에 없는 것도 표에 들어 있으면 같이 고를 수 있다(분류는 글자로 저장한다).
 * 앞의 다섯은 매입 정산의 상품화 비용 항목과 짝이다.
 */
export const VENDOR_CATEGORIES = [
  '광택·세차',
  '판금·덴트',
  '휠복원',
  '성능',
  '탁송',
  '공업사',
  '배터리',
  '유리',
  '할부사',
  '보험',
  '기타',
] as const;

export const LEASE_KINDS = ['전대차', '임대차'] as const;
export const LEASE_RENT_TYPES = ['월세', '전세'] as const;

/**
 * 부동산 임대차·전대차 계약서 한 장.
 *
 * 금액은 원. 면적·지목처럼 등기부에서 옮겨 적는 값은 숫자로만 안 떨어져서 글자로 둔다.
 * 주민등록번호·법인등록번호는 담지 않는다 — 인쇄물에 손으로 적는다.
 */
export interface LeaseContract {
  id: string;
  propertyId: string;
  kind: string; // 전대차 / 임대차
  rentType: string; // 월세 / 전세

  address: string;
  landCategory: string;
  landArea: string;
  buildingStructure: string;
  buildingArea: string;
  leasedPart: string;
  leasedArea: string;

  deposit: number;
  downPayment: number;
  interimPayment: number;
  interimOn: string | null;
  balance: number;
  balanceOn: string | null;
  monthlyRent: number;
  payDay: number;

  handoverOn: string | null;
  startOn: string | null;
  endOn: string | null;

  brokerageRate: string;
  special: string;
  writtenOn: string | null;

  lessorName: string;
  lessorAddress: string;
  lessorPhone: string;
  lessorAgent: string;
  lessorAgentPhone: string;

  lesseeName: string;
  lesseeAddress: string;
  lesseePhone: string;
  lesseeAgent: string;
  lesseeAgentPhone: string;

  brokerOffice: string;
  brokerAddress: string;
  brokerName: string;
  brokerRegNo: string;
  brokerPhone: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * 우리가 어느 쪽인가 — 빌려 쓰는 자리인지, 빌려준 자리인지.
 * 월세·보증금이 나가는 돈인지 들어오는 돈인지가 여기서 갈린다.
 */
export const PROPERTY_SIDES = ['임차', '임대'] as const;

/** 자리에 달마다 나가는 돈의 종류 */
export const PROPERTY_COST_KINDS = ['월세', '관리비', '주차 임대료', '전기·수도', '보험료', '기타'] as const;
export const PROPERTY_COST_METHODS = ['자동이체', '직접이체'] as const;

/**
 * 자리마다 달마다 나가는 돈.
 * 금액은 부가세까지 더한 '실제로 빠져나가는 돈'으로 적는다 — 통장에서 나간 돈과 맞춰야
 * 매달 다시 계산하지 않는다.
 */
export interface PropertyCost {
  id: string;
  propertyId: string;
  kind: string;
  amount: number; // 원(부가세 포함)
  /** 대당 단가 · 대수 — 둘 다 적으면 금액은 곱한 값으로 서버가 낸다 */
  unitPrice: number;
  units: number;
  payDay: number; // 내는 날. 0이면 정해진 날 없음
  method: string; // 자동이체 / 직접이체
  payee: string; // 받는 곳
  account: string; // 은행·계좌
  memo: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 부동산 용도 — 자주 쓰는 것을 미리 골라둔다 */
export const PROPERTY_USAGES = ['사무실', '주차장', '창고', '전시장', '기타'] as const;

/**
 * 부동산 — 사무실·주차장·창고로 쓰는 자리. 대표만 본다.
 * 보증금·월세는 원 단위다.
 */
export interface Property {
  id: string;
  name: string;
  /** 임차 = 우리가 빌려 쓴다(돈이 나간다) · 임대 = 우리가 빌려준다(돈이 들어온다) */
  side: string;
  /** 그 자리에 달마다 나가는 돈 합계(원) — 서버가 볼 때마다 더해서 내준다 */
  monthlyCost?: number;
  usage: string;
  address: string;
  ownerName: string; // 임대인
  ownerPhone: string;
  deposit: number; // 보증금(원)
  monthlyRent: number; // 월세(원)
  /** 월세 내는 날(1~31). 0이면 정해진 날이 없다 */
  payDay: number;
  startOn: string | null;
  endOn: string | null;
  memo: string;
  /** 계약이 끝났으면 내린다 — 지우지 않는다(지난 계약도 기록이다) */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 거래처 담당자 한 사람 — 한 곳에 여럿이다(메인팀장·하부세척·픽업이 따로) */
export interface VendorContact {
  id: string;
  vendorId: string;
  name: string;
  phone: string;
  sort: number;
}

/**
 * 인건비 한 줄.
 *
 * 실 이체액은 담지 않는다 — 급여에서 공제를 빼고 식대를 더하면 나오는 값이라,
 * 저장해 두면 금액을 고쳤을 때 둘이 어긋난다.
 */
export interface PayrollEntry {
  id: string;
  name: string;
  position: string;
  monthlyPay: number; // 급여(원)
  /** 인센티브(원) — 급여와 따로 둔다. 섞어 적으면 기본급이 얼마였는지 못 되짚는다 */
  incentive: number;
  companyDeduction: number; // 회사공제(원)
  selfDeduction: number; // 본인공제(원)
  mealAllowance: number; // 식대(원)
  /** 공제를 누가 지는가 — '본인all' / '세금 all 회사부담' / '공제없음' */
  burden: string;
  memo: string;
  /** 그만두면 내린다 — 지우지 않는다(지난 달 인건비다) */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  category: string;
  name: string;
  phone: string;
  /** 번호가 둘인 곳 */
  phone2: string;
  manager: string;
  /** 어디로 가면 되는지 */
  address: string;
  memo: string;
  /** 대표 번호 말고 더 있는 사람들 */
  contacts: VendorContact[];
  /** 거래 끊으면 내린다 — 지우지 않는다(지난 비용 명세가 이 이름을 가리킨다) */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  /** 기타 상담에서 판 사람 — 남의 딜러나 그 상사 이름 */
  outsideDealer?: string;
  /** 매입날짜(제시일자) — 차량 관리에서 맞춰 붙여 준다. 저장하지 않는다 */
  offerDate?: string | null;
  employeeId: string; // 담당자
  status: ConsultationStatus;
  date: string; // YYYY-MM-DD, 상담일시(날짜만)
  time: string; // HH:mm
  content: string; // 상담내용
  /** 손님 방문 예정일 */
  visitDate: string | null;
  /** 방문 시각 — "오후 3시~4시"처럼 적힌 그대로 둔다(범위나 두루뭉술한 표현이 많다) */
  visitTime: string;
  /** 그날 손님을 맞을 담당 딜러 — 전화를 받아 적은 사람(employeeId)과 다를 수 있다 */
  visitDealerId: string | null;

  /**
   * 왜 계약이 안 됐는가 — 손님이 다녀간 뒤 담당이 적는다.
   * 적는 칸이 따로 있어서(알선 정산의 '방문 리뷰') 상담 등록 창에서는 안 보낸다.
   */
  missReason?: string;
  missReview?: string;
  missReviewBy?: string;
  missReviewAt?: string | null;

  /**
   * 리콜 — 안 된 건에 팀장(지금은 대표)이 다시 전화를 걸어 본 기록.
   * 담당자가 적는 리뷰와 다른 일이라 칸을 따로 둔다.
   */
  recallResult?: string;
  recallNote?: string;
  recallBy?: string;
  recallAt?: string | null;
  /** 출고 시 입금액(만원) — 카톡방에 올리는 "입금1000만원"이 이 값이다 */
  depositAmount: number;
  /**
   * 차가 얼마에 팔렸나(원).
   *
   * 남의 딜러가 우리 상사 차를 팔아 주면 우리 딜러가 정산을 안 받는다 — 전화를 받은
   * TM 말고는 얼마에 팔렸는지 아무도 모른다. 입금액과는 다른 값이다(그건 만원 단위).
   */
  salePrice?: number;
  nextContactDate: string | null; // 다음 연락 예정일

  /**
   * 현금인가 할부인가.
   *
   * 할부면 어느 캐피탈로 얼마를 깔았는지 같이 적는다 — 재고 금융을 쓴 캐피탈에
   * 약정만큼 채웠는지 세는 값이다. 지난 상담은 안 적혀 있어 '미정'이다.
   */
  payMethod?: PayMethod;
  installmentCapital?: string;
  installmentAmount?: number; // 원

  files: { id: string; fileName: string; url: string }[];
  createdAt: string;
}

export type ParkingStatus = 'DISPLAY' | 'SOLD' | 'RESERVED' | 'MOVING' | 'REPAIR';

export const PARKING_STATUS_LABEL: Record<ParkingStatus, string> = {
  DISPLAY: '전시중',
  // DB 값은 그대로 두고 이름만 바꾼다 — 예전 자료를 옮기지 않아도 되고,
  // 부르는 이름은 앞으로도 또 바뀔 수 있다.
  SOLD: '엔카 진단예정',
  RESERVED: '출고대기',
  MOVING: '이동중',
  // 수정 들어간 차 — 돌아올 때까지 빼면 안 된다
  REPAIR: '카모두수정',
};

export interface ParkingVehicle {
  id: string;
  /** 매도일자 — 적혀 있으면 차가 나간 것이라 주차장 화면에서 내린다 */
  soldDate?: string | null;
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

/**
 * 매물을 올리는 사이트 — 광고 계약에서 플랫폼을 고를 때 쓴다.
 * (매물 사진 등록 화면에서 쓰던 목록이다. 그 화면은 없앴지만 이 목록은 광고 관리가 쓴다)
 */
export const VEHICLE_POST_SITES = ['엔카', 'KB차차차', '보배드림', '차란차', '당근마켓', '기타'] as const;

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
  /**
   * 알선차 — 우리가 사온 차가 아니다.
   *
   * 남의 상사 차를 알선으로 팔면 매도는 매도인데 우리가 판 대수에 섞이면 안 된다.
   * 언제 무엇을 넘겼는지는 남아야 해서 줄은 두되, 이 표를 달고 집계에서 뺀다.
   */
  brokered?: boolean;
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

  // ── 재고 금융(제시) ──
  /** 등록증상 최초등록일 — 10년차 경계를 월까지 봐야 갈릴 때만 채운다 */
  firstRegisteredOn: string | null;
  /** 재고 금융이 안 되는 차. 현금으로 산다 */
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
  /**
   * 매도금액(원) — 차가 얼마에 나갔나.
   *
   * 같은 값이 네 곳에 적힌다: 상담 등록의 차량판매가, 제시 금융의 매도금액(여기),
   * 알선 정산의 실 차량판매가, 매입 정산의 차량판매가. 어디서 적든 나머지 셋에
   * 같이 들어간다 — 나중에 적은 사람이 이긴다.
   */
  salePrice: number;
  /** 이 차 한 대에 쓴 광고비(원) — 광고 관리에서 적는다 */
  adCost: number;
  repayDate: string | null; // 상환일자 — 월별로 모아 본다

  createdAt: string;
  updatedAt: string;
}

export type VehicleExpenseKind = 'FUEL' | 'BATTERY' | 'WASH' | 'REPAIR' | 'ETC';

export const VEHICLE_EXPENSE_KIND_LABEL: Record<VehicleExpenseKind, string> = {
  FUEL: '주유',
  BATTERY: '배터리',
  /*
    외부 주차장에서 세워 둔 차를 계속 닦아 주시는 분께 드리는 돈.

    상품화의 '광택·세차'와 이름이 겹치면 안 된다 — 그쪽은 팔려고 한 번 제대로 맡기는
    일이고 매입 정산에 들어가지만, 이건 세워 두는 동안 달마다 나가는 관리비다.
    붙는 자리가 달라서 한 칸에 섞이면 원가가 틀어진다.
  */
  WASH: '외부주차장 세차',
  REPAIR: '소모품 수리',
  ETC: '기타',
};

/**
 * 메모를 받는 종류.
 * 항목 이름만으로는 무엇에 쓴 돈인지 알 수 없는 것들이다 —
 * 같은 '소모품 수리'라도 타이어인지 썬팅인지가 나중에 정산에서 갈린다.
 */
export const VEHICLE_EXPENSE_MEMO_KINDS: VehicleExpenseKind[] = ['WASH', 'REPAIR', 'ETC'];

/** 무엇을 적으면 되는지 보여주는 예시 — 실제로 자주 올라오는 항목들이다. */
export const VEHICLE_EXPENSE_MEMO_PLACEHOLDER = '사이드미러, 블랙박스, 썬팅, 타이어, 와이퍼, 케미칼류, 유리';

/**
 * 종류에 따라 다른 예시를 보여준다.
 *
 * 세차 칸에 '사이드미러, 블랙박스'가 떠 있으면 무엇을 적으라는 건지 알 수 없다 —
 * 예시는 그 자리에서 실제로 적는 말이어야 쓸모가 있다.
 */
export function expenseMemoPlaceholder(kind: VehicleExpenseKind): string {
  if (kind === 'WASH') return '몇 대, 어느 주차장 — 예: 배양동 12대';
  return VEHICLE_EXPENSE_MEMO_PLACEHOLDER;
}

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
  /** 등록증상 최초등록일 — 재고 금융 10년차 경계를 월까지 가릴 때 쓴다 */
  firstRegisteredOn: string | null;
  fuel: string; // 연료
  keyCount: number; // 차키갯수
  mileage: number; // 주행거리(km) — 매입할 때 받아 적은 값
  /** 실차 확인자가 차를 보고 다시 적은 주행거리. 0이면 아직 확인 안 함 */
  checkedMileage: number;

  // ── 실차 검차 ──
  /** 확인한 항목 키를 쉼표로 — lib/inspectionCheck 의 CHECK_ITEMS 와 같은 키 */
  checkedItems?: string;
  panelCount?: number; // 판 몇 곳
  dentCount?: number; // 덴트 몇 곳
  dentLargeCount?: number; // 그중 큰 덴트
  wheelCount?: number; // 휠 복원 몇 짝
  fuelLevel?: string; // 기름 — 많음 / 적정 / 없음
  /** 검차 리포트 주소 — 카비어가 계약에 달아 주는 성능점검 결과 */
  reportUrl?: string;
  prepVendor?: string; // 판금 업체 — 대산 / KS
  imported?: boolean; // 수입차인가 — 판 단가가 갈린다
  note: string; // 특이사항

  purchaseAmount: number; // 실매입금액(원)
  brokerFee: number; // 구전(원)
  brokerFeeType: BrokerFeeType; // 구전 지급 방식
  /** 차량 관리에 올라가 있는가 — 안 올라가 있으면 재고 금융 제시 대상에 안 뜬다 */
  registered?: boolean;
  /**
   * 상품화 — 실차를 보고 상품으로 낼 수 있게 손본 차.
   * 차량 관리 쪽 값이지만, 켜는 사람은 실차를 본 사람이라 매입 화면에서 같이 다룬다.
   */
  prepared?: boolean;
  /** 이 차가 얼마에 팔렸는지(원). 아직 안 팔았으면 0 */
  salePrice?: number;
  /**
   * 입고일 — 조합 전산에 제시를 잡은 날(없으면 매입일).
   *
   * 조합 전산이 우선이라 달을 셀 때는 이 날짜로 센다. 매입일은 '언제 검차했나'로 그대로 남는다.
   */
  intakeOn?: string;
  /** 매도일자 — 차가 실제로 나간 날. 아직 안 나갔으면 null */
  soldOn?: string | null;
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
