import dayjs from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, Employee } from '../types';
import { approvedRequestKind, computeStatus, isWorkday } from './attendance';

/**
 * 그 달 출퇴근 순위 — 일한 시간을 더해서 매긴다.
 *
 * 처음에는 '정상 출근한 날 수'로 셌는데, 달이 막 시작된 날에는 모두가 하루씩이라 전원이
 * 1위가 됐다. 날 수로는 여덟 시에 나와 여섯 시 반까지 있은 사람과 아홉 시 반에 나와
 * 똑같이 퇴근한 사람이 갈리지 않는다.
 *
 * 찍힌 시각 그대로 더한다. 기본 근무는 9:30~18:30 이고, 일찍 나오거나 늦게까지 있은
 * 만큼이 그대로 쌓인다.
 *
 * 승인받은 연차·반차·외근은 시간이 안 쌓이지만 깎지도 않는다 — 쉬기로 하고 쉰 날을
 * 손해로 만들면 연차를 안 쓰게 된다.
 */

/** 기본 근무 — 화면에 기준을 적을 때 쓴다 */
export const WORK_START = '09:30';
export const WORK_END = '18:30';

/** "HH:mm" → 자정부터 몇 분. 꼴이 아니면 null */
function minutesOf(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface AttendanceRankRow {
  employeeId: string;
  name: string;
  /** 그 달 일한 시간(분) — 출근·퇴근이 둘 다 찍힌 날만 쌓인다 */
  minutes: number;
  /** 시간이 쌓인 날 수 */
  days: number;
  normal: number;
  late: number;
  earlyLeave: number;
  /** 근무일인데 찍힌 게 없는 날 */
  missing: number;
  /** 1부터. 일한 시간이 같으면 같은 등수다 */
  rank: number;
  /** 한 번도 안 늦고 안 빠졌는가 — 순위와는 따로 본다 */
  perfect: boolean;
}

/** 분 → "32시간 10분" */
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function attendanceRanking(
  employees: Employee[],
  records: AttendanceRecord[],
  requests: AttendanceRequest[],
  month: string,
): AttendanceRankRow[] {
  const start = dayjs(`${month}-01`);
  const today = dayjs();
  // 이번 달이면 오늘까지, 지난달이면 그 달 끝까지
  const end = start.isSame(today, 'month') ? today : start.endOf('month');

  const days: string[] = [];
  for (let d = start; !d.isAfter(end, 'day'); d = d.add(1, 'day')) {
    days.push(d.format('YYYY-MM-DD'));
  }

  const rows = employees
    .filter(e => e.active)
    .map(e => {
      let minutes = 0;
      let worked = 0;
      let normal = 0;
      let late = 0;
      let earlyLeave = 0;
      let missing = 0;

      for (const date of days) {
        const record = records.find(r => r.employeeId === e.id && r.date === date);

        /*
          시간은 휴일에 나온 날도 센다.

          주말에 나와 일한 것도 일한 시간이다. 지각·조퇴 같은 '상태'만 근무일 기준으로
          센다 — 토요일에 늦게 나왔다고 지각이라 할 수는 없다.
        */
        const inAt = minutesOf(record?.clockIn);
        const outAt = minutesOf(record?.clockOut);
        if (inAt !== null && outAt !== null && outAt > inAt) {
          minutes += outAt - inAt;
          worked += 1;
        }

        if (!isWorkday(date)) continue;
        const status = computeStatus(record, date, approvedRequestKind(requests, e.id, date));
        if (status === 'normal') normal += 1;
        else if (status === 'late') late += 1;
        else if (status === 'earlyLeave') earlyLeave += 1;
        else if (status === 'lateAndEarly') {
          late += 1;
          earlyLeave += 1;
        } else if (status === 'missing') missing += 1;
      }

      return {
        employeeId: e.id,
        name: e.name,
        minutes,
        days: worked,
        normal,
        late,
        earlyLeave,
        missing,
        rank: 0,
        perfect: normal > 0 && late === 0 && earlyLeave === 0 && missing === 0,
      };
    });

  rows.sort((a, b) => b.minutes - a.minutes || b.days - a.days || a.name.localeCompare(b.name));

  /*
    일한 시간이 같으면 같은 등수다.

    한 번도 안 찍은 사람(0분)은 등수를 안 매긴다 — 0분끼리 공동 1위가 되면 표가 뜻을 잃는다.
  */
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    if (r.minutes <= 0) {
      r.rank = 0;
      return;
    }
    if (prev === null || r.minutes !== prev) {
      rank = i + 1;
      prev = r.minutes;
    }
    r.rank = rank;
  });

  return rows;
}

/** 등수에 붙는 표 — 3등까지만 단다. 넷째부터는 표가 아니라 목록이다 */
export const RANK_MARK: Record<number, { emoji: string; label: string; className: string }> = {
  1: { emoji: '👑', label: '1위', className: 'bg-amber-100 text-amber-800' },
  2: { emoji: '🥈', label: '2위', className: 'bg-slate-200 text-slate-700' },
  3: { emoji: '🥉', label: '3위', className: 'bg-orange-100 text-orange-800' },
};
