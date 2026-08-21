import dayjs from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, AttendanceRequestKind, AttendanceStatus } from '../types';

export const WORK_START = '09:00';
export const WORK_END = '18:00';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// 오늘(진행중)인 날은 아직 퇴근 전일 수 있어서 "누락"으로 판정하지 않는다 —
// 과거 날짜의 결측만 실제 "누락"으로 취급.
export function computeStatus(record: AttendanceRecord | undefined, date: string, approvedKind: AttendanceRequestKind | null = null): AttendanceStatus {
  // 주말(휴무)은 출퇴근 여부와 무관하게 항상 휴무 — 과거/미래 상관없이 고정값
  if (!isWorkday(date)) return 'dayOff';
  // 승인된 연차/외근은 결근·지각 판정보다 우선 — 출퇴근을 안 찍었어도 "누락"이 아니라 연차/외근으로 표시
  if (approvedKind === 'ANNUAL_LEAVE') return 'annualLeave';
  if (approvedKind === 'FIELD_WORK') return 'fieldWork';

  const isPast = dayjs(date).isBefore(dayjs(), 'day');
  const isToday = dayjs(date).isSame(dayjs(), 'day');

  const clockIn = record?.clockIn ?? null;
  const clockOut = record?.clockOut ?? null;

  if (!clockIn && !clockOut) {
    return isPast ? 'missing' : 'normal';
  }
  if (isPast && (!clockIn || !clockOut)) {
    return 'missing';
  }
  if (isToday && !clockOut) {
    // 퇴근 전 — 지각 여부만 판단
    const late = clockIn ? toMinutes(clockIn) > toMinutes(WORK_START) : false;
    return late ? 'late' : 'normal';
  }

  const late = clockIn ? toMinutes(clockIn) > toMinutes(WORK_START) : false;
  const early = clockOut ? toMinutes(clockOut) < toMinutes(WORK_END) : false;
  if (late && early) return 'lateAndEarly';
  if (late) return 'late';
  if (early) return 'earlyLeave';
  return 'normal';
}

export function workedMinutes(record: AttendanceRecord | undefined): number | null {
  if (!record?.clockIn || !record?.clockOut) return null;
  return toMinutes(record.clockOut) - toMinutes(record.clockIn);
}

export function formatMinutes(min: number | null): string {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간 ${m}분`;
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  normal: '정상',
  late: '지각',
  earlyLeave: '조퇴',
  lateAndEarly: '지각+조퇴',
  missing: '누락',
  dayOff: '휴무',
  annualLeave: '연차',
  fieldWork: '외근/출장',
};

export const STATUS_COLOR: Record<AttendanceStatus, string> = {
  normal: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  late: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  earlyLeave: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  lateAndEarly: 'bg-red-50 text-red-700 ring-red-600/20',
  missing: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  dayOff: 'bg-red-50 text-red-500 ring-red-500/20',
  annualLeave: 'bg-violet-50 text-violet-600 ring-violet-500/20',
  fieldWork: 'bg-sky-50 text-sky-600 ring-sky-500/20',
};

// 그날 승인된 연차/외근 신청이 있으면 그 종류를 반환 — computeStatus의 approvedKind 인자로 넘겨 씀
export function approvedRequestKind(requests: AttendanceRequest[], employeeId: string, date: string): AttendanceRequestKind | null {
  return requests.find(r => r.employeeId === employeeId && r.date === date && r.status === 'APPROVED')?.kind ?? null;
}

// 평일만 근무일로 취급(주말은 대시보드/통계에서 제외)
export function isWorkday(date: string): boolean {
  const day = dayjs(date).day();
  return day !== 0 && day !== 6;
}
