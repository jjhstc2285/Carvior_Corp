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
}

export type AttendanceStatus = 'normal' | 'late' | 'earlyLeave' | 'lateAndEarly' | 'missing' | 'dayOff' | 'annualLeave' | 'halfDay' | 'fieldWork';

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

export type NotificationType =
  | 'MISSING'
  | 'CORRECTION_REQUEST'
  | 'ATTENDANCE_REQUEST'
  | 'MILEAGE_GAP'
  | 'DEALER_FEE'
  | 'APPROVAL';

/** 결재 문서 종류. 지금은 시말서 하나지만 휴가원·지출결의서처럼 늘어난다. */
export type ApprovalKind = 'INCIDENT_REPORT';

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  INCIDENT_REPORT: '시말서',
};

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
  content: string;
  writtenOn: string; // YYYY-MM-DD
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
  monthlyFee: number; // 매달 회비(원). 대당처럼 정액이 아니면 0
  feeNote: string; // "대당 5만" 처럼 정액이 아닐 때
  /** 대당 얼마(원). 0이면 대당이 아니다 */
  perUnitFee: number;
  /** 매입처에 이 말이 들어가면 이 영업소로 센다. 쉼표로 여럿, 비면 업체명 */
  matchKeywords: string;
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
// 이전비 잔액 / 현금 수수료 / 할부 피 / 보험 피 / 기타비용 / 판매 수익 / 정산받을금액
// (수익금·판매 수익은 저장하지 않고 항상 계산해서 씀 — 서버도 같은 식을 쓴다)
// ─────────────────────────────────────────────────────────────
export interface BrokerageSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  vehicleNumber: string;
  vehicleName: string;
  totalSaleAmount: number; // 총 진행 판매금액
  ownerDeposit: number; // 실차주입금
  transferFee: number; // 이전비
  transferFeeBalance: number; // 이전비 잔액
  cashCommission: number; // 현금 수수료
  installmentFee: number; // 할부 피
  insuranceFee: number; // 보험 피
  etcCost: number; // 기타비용
  settlementAmount: number; // 정산받을금액
  employeeId: string;
  status: SettlementStatus;
  memo: string;
  createdAt: string;
}

// 수익금 = 총 진행 판매금액 − 실차주입금
export function brokerageProfit(r: Pick<BrokerageSettlement, 'totalSaleAmount' | 'ownerDeposit'>): number {
  return r.totalSaleAmount - r.ownerDeposit;
}

// 판매 수익 = 수익금 + 이전비 잔액 + 현금 수수료 + 할부 피 + 보험 피 − 기타비용
export function brokerageSaleProfit(
  r: Pick<BrokerageSettlement, 'totalSaleAmount' | 'ownerDeposit' | 'transferFeeBalance' | 'cashCommission' | 'installmentFee' | 'insuranceFee' | 'etcCost'>,
): number {
  return brokerageProfit(r) + r.transferFeeBalance + r.cashCommission + r.installmentFee + r.insuranceFee - r.etcCost;
}

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
  prepCosts: PurchasePrepCost[]; // 상품화 비용 명세
  settlementAmount: number; // 정산금액
  newCarName: string; // 신차이름
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

// 매입+상품화총비용 = 매입가 + 상품화총비용
export function purchaseGrandTotal(purchasePrice: number, prepTotal: number): number {
  return purchasePrice + prepTotal;
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
  stockCapital: string; // 할부사
  stockAmount: number; // 재고금액(원)
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
// 매입리스트 — 재고금융(캐피탈 대출) 장부
// ─────────────────────────────────────────────

// 금액 단위는 정산(만원)과 달리 전부 '원'이다. 엑셀에 원 단위로 적어온 것을 그대로 옮긴다.
export interface PurchaseListItem {
  id: string;
  seq: number;
  date: string | null; // 매입 날짜 YYYY-MM-DD
  vehicleNumber: string;
  vehicleName: string;
  managerName: string;
  askingPrice: number; // 제시가(원)
  modelYear: string; // 년식
  mileage: number; // 주행거리(km)

  stockCapital: string | null; // 재고 — 캐피탈사
  stockAmount: number; // 재고 — 금액(원)

  // 재고가능금액 — 캐피탈사별(원)
  limitBmw: number;
  limitWoori: number;
  limitKb: number;
  limitMeritz: number;
  limitHana: number;
  limitHyundai: number;

  note: string; // 비고 — 특이사항

  loanDate: string | null; // 대출일자
  interestRate: number | null; // 이율(%)
  repayDate: string | null; // 상환일자 — 월별 현황은 이 날짜로 모은다
  loanStatus: string; // 대출상황
  repaidDate: string | null; // 상환날짜 — 실제로 갚은 날
  repaymentAmount: number; // 상환금액(원)

  createdAt: string;
  updatedAt: string;
}

/** 재고가능금액 칸 — 헤더의 한도는 엑셀 시트지에 적혀 있던 값 그대로다. */
export const CAPITAL_LIMIT_COLUMNS = [
  { key: 'limitBmw', label: 'BMW', quota: '10억', head: 'bg-emerald-200' },
  { key: 'limitWoori', label: '우리', quota: '15억', head: 'bg-yellow-200' },
  { key: 'limitKb', label: '케이비', quota: '6억', head: 'bg-teal-200' },
  { key: 'limitMeritz', label: '메리츠', quota: '7억', head: 'bg-orange-200' },
  { key: 'limitHana', label: '하나', quota: '2억', head: 'bg-sky-200' },
  { key: 'limitHyundai', label: '현대', quota: '10억', head: 'bg-amber-300' },
] as const;

export type CapitalLimitKey = (typeof CAPITAL_LIMIT_COLUMNS)[number]['key'];

export interface PurchaseListSummary {
  month: string; // YYYY-MM
  count: number;
  repaymentTotal: number; // 그 달 상환금액 합계(원)
  stockTotal: number; // 그 달 재고금액 합계(원)
}

// ─────────────────────────────────────────────
// 매입 관리 — 차를 사올 때 받아 적는 인수 내역
// ─────────────────────────────────────────────

// 매입리스트(재고금융)와는 다른 단계다 — 여기는 '사올 때 확인한 것'이다.
// 금액 단위는 매입리스트와 같은 '원'이다.
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
