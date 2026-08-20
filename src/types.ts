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
}
