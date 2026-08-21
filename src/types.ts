export interface Employee {
  id: string;
  name: string;
  department: string;
  position: string;
}

export type AttendanceStatus = 'normal' | 'late' | 'earlyLeave' | 'lateAndEarly' | 'missing' | 'dayOff' | 'annualLeave' | 'fieldWork';

export type AttendanceRequestStatus = 'pending' | 'approved' | 'rejected';

// 근태 신청 종류 — 연차(휴가)는 쉬는 날, 외근/출장은 정상 근무지만 출퇴근을 못 찍는 경우
export type AttendanceRequestKind = 'annualLeave' | 'fieldWork';

export const ATTENDANCE_REQUEST_KIND_LABEL: Record<AttendanceRequestKind, string> = {
  annualLeave: '연차',
  fieldWork: '외근/출장',
};

// 연차 — 근로기준법 기준 연 15일 고정으로 단순화(입사연차 가산 등은 미반영, MVP 틀)
export const ANNUAL_LEAVE_QUOTA = 15;

export interface AttendanceRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD, 연차/외근 사용일
  kind: AttendanceRequestKind;
  reason: string;
  status: AttendanceRequestStatus;
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

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  reason: string;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  status: CorrectionStatus;
  createdAt: string; // ISO
  reviewedAt: string | null;
  reviewNote: string | null;
}

export type NotificationType = 'missing' | 'correctionRequest' | 'attendanceRequest';

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  employeeId: string;
  date: string; // related attendance date
  createdAt: string; // ISO
  read: boolean;
}

export type SettlementStatus = 'inProgress' | 'completed';

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

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  inProgress: '진행중',
  completed: '정산완료',
};

export function netProfit(r: Pick<SettlementRecord, 'purchaseCost' | 'prepCost' | 'saleAmount' | 'feeAmount'>): number {
  return r.saleAmount - r.purchaseCost - r.prepCost - r.feeAmount;
}

// ─────────────────────────────────────────────────────────────
// 알선 정산 — 실제 시트지 컬럼 그대로
// 일자 / 차량번호 / 차량명 / 총 진행 판매금액 / 실차주입금 / 수익금 / 이전비 / 이전비 잔액 /
// 현금 수수료 / 할부 피 / 보험 피 / 기타비용 / 판매 수익 / 정산받을금액
// (수익금·판매 수익은 저장하지 않고 항상 계산해서 씀)
// ─────────────────────────────────────────────────────────────
export interface BrokerageSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  vehicleNumber: string; // 차량번호
  vehicleName: string; // 차량명
  totalSaleAmount: number; // 총 진행 판매금액
  ownerDeposit: number; // 실차주입금
  transferFee: number; // 이전비
  transferFeeBalance: number; // 이전비 잔액
  cashCommission: number; // 현금 수수료
  installmentFee: number; // 할부 피
  insuranceFee: number; // 보험 피
  etcCost: number; // 기타비용
  settlementAmount: number; // 정산받을금액
  employeeId: string; // 담당자
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
// 매입 정산 — 실제 시트지 컬럼 그대로
// 일자 / 차량명 / 차량번호 / 이전비+추가이전비 / 매입가 / 광택 및 세차 / 판금 및 덴트 / 성능비 /
// 탁송비 / 수리비 / 구전 / 진단비 / 상품화총비용 / 매입+상품화총비용 / 정산금액 / 신차이름
// (상품화총비용·매입+상품화총비용은 저장하지 않고 항상 계산해서 씀)
// ─────────────────────────────────────────────────────────────
export interface PurchaseSettlement {
  id: string;
  date: string; // 일자 YYYY-MM-DD
  vehicleName: string; // 차량명
  vehicleNumber: string; // 차량번호
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
  employeeId: string; // 담당자
  status: SettlementStatus;
  memo: string;
  createdAt: string;
}

export type PurchasePrepFields = Pick<
  PurchaseSettlement,
  'polishWashCost' | 'dentCost' | 'performanceCost' | 'deliveryCost' | 'repairCost' | 'brokerFee' | 'diagnosisCost'
>;

// 상품화총비용 = 광택및세차 + 판금및덴트 + 성능비 + 탁송비 + 수리비 + 구전 + 진단비
// (이전비는 상품화가 아니라 별도 항목이라 여기 안 넣음 — 포함하려면 이 함수만 고치면 됨)
export function purchasePrepTotal(r: PurchasePrepFields): number {
  return r.polishWashCost + r.dentCost + r.performanceCost + r.deliveryCost + r.repairCost + r.brokerFee + r.diagnosisCost;
}

// 매입+상품화총비용 = 매입가 + 상품화총비용
export function purchaseGrandTotal(r: PurchasePrepFields & Pick<PurchaseSettlement, 'purchasePrice'>): number {
  return r.purchasePrice + purchasePrepTotal(r);
}

export type ConsultationStatus = 'inProgress' | 'contracted' | 'onHold' | 'closed';

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  inProgress: '진행중',
  contracted: '계약',
  onHold: '보류',
  closed: '종결',
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
  fileNames: string[]; // 첨부파일 이름만(목업 — 실제 업로드 없음)
  createdAt: string;
}

export type ParkingStatus = '전시중' | '판매완료' | '예약중' | '이동중';

export const PARKING_STATUS_LABEL: Record<ParkingStatus, string> = {
  전시중: '전시중',
  판매완료: '판매완료',
  예약중: '예약중',
  이동중: '이동중',
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

// 사진은 base64로 localStorage에 들어가므로 장수를 제한한다(브라우저 저장 한도 ~5MB)
export const VEHICLE_POST_PHOTO_MAX = 5;

export interface VehiclePost {
  id: string;
  site: string; // 사이트 (엔카/KB차차차 등)
  vehicleNumber: string; // 차량번호
  vehicleModel: string; // 차명
  customerPhone: string; // 손님번호
  content: string; // 내용
  photos: string[]; // 사진 data URL (최대 VEHICLE_POST_PHOTO_MAX장)
  employeeId: string; // 등록자
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
  consultations: ConsultationRecord[];
  parkingVehicles: ParkingVehicle[];
  attendanceRequests: AttendanceRequest[];
  vehiclePosts: VehiclePost[];
  brokerageSettlements: BrokerageSettlement[];
  purchaseSettlements: PurchaseSettlement[];
}
