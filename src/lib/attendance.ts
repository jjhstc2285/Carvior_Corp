import dayjs from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, AttendanceRequestKind, AttendanceStatus } from '../types';

/**
 * 근무 시각 기준.
 *
 * 출근은 09:30:59까지 정상이다 — 기록이 'HH:mm'(초 버림)으로 남으므로 09:30:59는
 * '09:30'으로 저장되고, 아래 판정이 '기준보다 늦으면 지각'이라 09:30은 통과하고
 * 09:31부터 지각이 된다. 초까지 저장하도록 바꾸면 이 규칙도 같이 봐야 한다.
 */
export const WORK_START = '09:30';
/*
  퇴근 기준은 18:00 이다.

  적어 둔 정상 근무는 9:30~18:30 인데, 퇴근은 러프하게 본다 — 18시를 넘겨 찍었으면
  정상이다. 손님을 보내고 찍거나 정리하다 늦게 찍는 날이 흔해서 퇴근 시각은 사람마다
  들쭉날쭉하고, 거기서 삼십 분을 다투게 하면 찍는 시각만 눈치 보게 된다.

  18:30 으로 올려 봤다가 되돌렸다. 그러면 18:10 에 간 날이 모두 조퇴로 잡힌다.

  일찍 오는 쪽은 그대로 센다(순위에서 쌓이는 자리는 출근이다).
*/
export const WORK_END = '18:00';

/*
  구내식당 체크가 처음에 켜져 있는 기준.

  서버가 식대를 셀 때 쓰는 것과 같은 시각이다. 출퇴근 화면과 홈이 따로 들고 있으면
  한쪽만 고치는 날이 오고, 같은 날이 화면마다 다르게 보인다.
*/
export const MEAL_IN_BY = '09:30';
export const MEAL_OUT_FROM = '18:00';

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

  const status = rawStatus(record, date);

  // 반차는 반나절만 나오는 날이라 출근이 늦거나 퇴근이 이른 게 정상이다.
  // 다만 아예 안 찍은 날은 덮지 않는다 — 반차라도 나온 반나절은 찍어야 한다.
  if (approvedKind === 'HALF_DAY') {
    return status === 'missing' ? 'missing' : 'halfDay';
  }

  // 지각·조퇴 소명이 승인되면 그날을 정상 출근으로 본다.
  // 다만 '누락'까지 덮지는 않는다 — 출퇴근을 아예 안 찍은 날은 소명할 대상이 없고,
  // 그건 시각을 채워 넣는 정정 요청으로 처리해야 한다. (찍힌 시각 자체는 그대로 남는다)
  if (approvedKind === 'LATE_EXCUSE' && (status === 'late' || status === 'earlyLeave' || status === 'lateAndEarly')) {
    return 'normal';
  }
  return status;
}

/** 출퇴근 시각만 보고 내리는 판정 — 승인된 신청은 위(computeStatus)에서 따로 다룬다. */
function rawStatus(record: AttendanceRecord | undefined, date: string): AttendanceStatus {

  const isPast = dayjs(date).isBefore(dayjs(), 'day');
  const isToday = dayjs(date).isSame(dayjs(), 'day');

  const clockIn = record?.clockIn ?? null;
  const clockOut = record?.clockOut ?? null;

  // 아직 안 찍은 날. 지난 날이면 누락이고, 오늘·앞으로는 '아직 안 찍음'이다.
  // 예전에는 이걸 정상으로 뒀는데, 출근을 안 했는데도 정상으로 세어져 통계가 부풀었다.
  if (!clockIn && !clockOut) {
    return isPast ? 'missing' : 'pending';
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
  pending: '아직 안 찍음',
  dayOff: '휴무',
  annualLeave: '연차',
  halfDay: '반차',
  fieldWork: '외근/출장',
};

export const STATUS_COLOR: Record<AttendanceStatus, string> = {
  normal: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  late: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  earlyLeave: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  lateAndEarly: 'bg-red-50 text-red-700 ring-red-600/20',
  missing: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  pending: 'bg-slate-50 text-slate-400 ring-slate-300/20',
  dayOff: 'bg-red-50 text-red-500 ring-red-500/20',
  annualLeave: 'bg-violet-50 text-violet-600 ring-violet-500/20',
  halfDay: 'bg-violet-50 text-violet-500 ring-violet-400/20',
  fieldWork: 'bg-sky-50 text-sky-600 ring-sky-500/20',
};

// 그날 승인된 신청(연차·외근·소명)이 있으면 그 종류를 반환 — computeStatus의 approvedKind 인자로 넘겨 씀
/**
 * 근태 판정을 바꾸는 순서.
 *
 * 하루에 승인된 신청이 여럿일 수 있다 — 자리비움은 하루에 몇 번이고 올라오고 승인 없이
 * 바로 확정된다. 예전에는 그날 것 중 먼저 잡히는 하나만 봐서, 자리비움이 걸리면 지각
 * 소명이 통째로 무시됐다(지각을 소명해도 계속 지각으로 남았다).
 *
 * 자리비움은 아예 안 본다 — 근태 판정을 바꾸는 신청이 아니다.
 */
const STATUS_CHANGING_KINDS: AttendanceRequestKind[] = [
  'ANNUAL_LEAVE',
  'HALF_DAY',
  'FIELD_WORK',
  'LATE_EXCUSE',
];

export function approvedRequestKind(requests: AttendanceRequest[], employeeId: string, date: string): AttendanceRequestKind | null {
  const approved = requests.filter(
    r => r.employeeId === employeeId && r.date === date && r.status === 'APPROVED',
  );
  // 위 목록 순서가 곧 우선순위다 — 연차가 있으면 소명보다 연차가 먼저다.
  return STATUS_CHANGING_KINDS.find(kind => approved.some(r => r.kind === kind)) ?? null;
}

// 평일만 근무일로 취급(주말은 대시보드/통계에서 제외)
/**
 * 쉬는 날 — 주말 말고 달력에 빨간 날.
 *
 * 주말만 빼고 있었다. 그랬더니 한글날에 아무도 안 찍은 게 전원 '누락'으로 잡혀서,
 * 출퇴근 순위가 그날 하루로 다같이 아홉 시간씩 깎였다.
 *
 * 날짜가 고정인 날만 적어 둔다. 설날·추석·부처님오신날은 음력이라 해마다 다르고,
 * 대체공휴일도 그때 정해진다 — 지어 넣으면 멀쩡히 나온 날이 휴일이 되거나 그 반대가
 * 된다. 회사 휴무일 표를 받아 여기에 적어 넣는다.
 */
const HOLIDAYS = new Set([
  '2026-01-01', // 신정
  '2026-03-01', // 삼일절
  '2026-05-05', // 어린이날
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-10-03', // 개천절
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
]);

export function isHoliday(date: string): boolean {
  return HOLIDAYS.has(date);
}

export function isWorkday(date: string): boolean {
  const day = dayjs(date).day();
  return day !== 0 && day !== 6 && !HOLIDAYS.has(date);
}
