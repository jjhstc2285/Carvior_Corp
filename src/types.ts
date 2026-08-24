// 서버(Prisma) enum과 값을 그대로 맞춘다.
// 중간에 변환 계층을 두면 어긋났을 때 찾기 어려워서, 프론트가 서버 표기를 따라간다.

export type Role = 'ADMIN' | 'EMPLOYEE';

export interface Employee {
  id: string;
  name: string;
  position: string; // 직책 — 대표 / 본부장 / 사무장 / 차장 / 과장 / 매니저
  department: string | null;
  phones: string[];
  role: Role;
  active: boolean;
}

export type AttendanceStatus = 'normal' | 'late' | 'earlyLeave' | 'lateAndEarly' | 'missing' | 'dayOff' | 'annualLeave' | 'fieldWork';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
};

// 근태 신청 종류 — 연차(휴가)는 쉬는 날, 외근/출장은 정상 근무지만 출퇴근을 못 찍는 경우
export type AttendanceRequestKind = 'ANNUAL_LEAVE' | 'FIELD_WORK';

export const ATTENDANCE_REQUEST_KIND_LABEL: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '연차',
  FIELD_WORK: '외근/출장',
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

export type NotificationType = 'MISSING' | 'CORRECTION_REQUEST' | 'ATTENDANCE_REQUEST';

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
export interface PurchaseSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  vehicleName: string;
  vehicleNumber: string;
  transferFee: number; // 이전비 + 추가이전비
  purchasePrice: number; // 매입가
  polishWashCost: number; // 광택 및 세차
  dentCost: number; // 판금 및 덴트
  performanceCost: number; // 성능비
  deliveryCost: number; // 탁송비
  repairCost: number; // 수리비
  brokerFee: number; // 구전
  diagnosisCost: number; // 진단비
  settlementAmount: number; // 정산금액
  newCarName: string; // 신차이름
  employeeId: string;
  status: SettlementStatus;
  memo: string;
  createdAt: string;
}

export type PurchasePrepFields = Pick<
  PurchaseSettlement,
  'polishWashCost' | 'dentCost' | 'performanceCost' | 'deliveryCost' | 'repairCost' | 'brokerFee' | 'diagnosisCost'
>;

// 상품화총비용 = 광택및세차 + 판금및덴트 + 성능비 + 탁송비 + 수리비 + 구전 + 진단비
// (이전비는 상품화가 아니라 별도 항목이라 여기 안 넣음 — 포함하려면 이 함수와 서버 calc만 고치면 됨)
export function purchasePrepTotal(r: PurchasePrepFields): number {
  return r.polishWashCost + r.dentCost + r.performanceCost + r.deliveryCost + r.repairCost + r.brokerFee + r.diagnosisCost;
}

// 매입+상품화총비용 = 매입가 + 상품화총비용
export function purchaseGrandTotal(r: PurchasePrepFields & Pick<PurchaseSettlement, 'purchasePrice'>): number {
  return r.purchasePrice + purchasePrepTotal(r);
}

export type ConsultationStatus = 'IN_PROGRESS' | 'CONTRACTED' | 'ON_HOLD' | 'CLOSED';

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  IN_PROGRESS: '진행중',
  CONTRACTED: '계약',
  ON_HOLD: '보류',
  CLOSED: '종결',
};

export interface ConsultationRecord {
  id: string;
  vehicleNumber: string;
  customerName: string;
  employeeId: string; // 담당자
  status: ConsultationStatus;
  date: string; // YYYY-MM-DD, 상담일시(날짜만)
  time: string; // HH:mm
  content: string; // 상담내용
  nextContactDate: string | null; // 다음 연락 예정일
  files: { id: string; fileName: string; url: string }[];
  createdAt: string;
}

export type ParkingStatus = 'DISPLAY' | 'SOLD' | 'RESERVED' | 'MOVING';

export const PARKING_STATUS_LABEL: Record<ParkingStatus, string> = {
  DISPLAY: '전시중',
  SOLD: '판매완료',
  RESERVED: '예약중',
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
export interface ManagedVehicle {
  id: string;
  vehicleNumber: string; // "12가3456" / "123가4567"
  plateTail: string; // 뒤 4자리
  vehicleModel: string;
  prepared: boolean; // 상품화
  advertised: boolean; // 광고 완료 — 상품화 없이는 켤 수 없다
  moveBlocked: boolean; // 외부 이동 금지 — 켜지면 무조건 이동금지
  createdAt: string;
  updatedAt: string;
}

export type VehicleExpenseKind = 'FUEL' | 'BATTERY';

export const VEHICLE_EXPENSE_KIND_LABEL: Record<VehicleExpenseKind, string> = {
  FUEL: '주유',
  BATTERY: '배터리',
};

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
  employeeId: string;
  vehicle: { id: string; vehicleNumber: string; vehicleModel: string };
  employee: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
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
