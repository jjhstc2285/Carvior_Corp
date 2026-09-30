import dayjs from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, Employee } from '../types';
import { approvedRequestKind, computeStatus, isWorkday } from './attendance';

/**
 * 그 달 출퇴근 성실도 순위.
 *
 * 누가 제때 오고 제때 가는지는 근태 표에 다 있는데, 표를 펴 보는 사람만 안다. 이름 옆에
 * 달아 두면 매일 눈에 띈다 — 잘 찍는 사람이 드러나는 게 안 찍는 사람을 나무라는 것보다 낫다.
 *
 * 승인받은 연차·반차·외근은 세지 않는다. 쉬기로 하고 쉰 날을 결석으로 세면, 연차를 쓴
 * 사람이 순위에서 밀려 연차를 안 쓰게 된다 — 그건 이 순위가 바라는 바가 아니다.
 *
 * 아직 오지 않은 날도 세지 않는다. 안 찍은 게 아니라 아직 안 온 날이다.
 */

/** 점수 — 정상 하루에 1점, 지각·조퇴는 반 점씩 깎고, 안 찍은 날은 한 점 깎는다 */
const LATE_PENALTY = 0.5;
const MISSING_PENALTY = 1;

export interface AttendanceRankRow {
  employeeId: string;
  name: string;
  /** 정상으로 다 찍은 날 */
  normal: number;
  late: number;
  earlyLeave: number;
  /** 근무일인데 찍힌 게 없는 날 */
  missing: number;
  /** 센 근무일 — 연차·외근처럼 안 세는 날은 빠져 있다 */
  counted: number;
  score: number;
  /** 1부터. 점수가 같으면 같은 등수다 */
  rank: number;
  /** 한 번도 안 늦고 안 빠졌는가 — 순위보다 이쪽이 더 값지다 */
  perfect: boolean;
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
    const date = d.format('YYYY-MM-DD');
    if (isWorkday(date)) days.push(date);
  }

  const rows = employees
    .filter(e => e.active)
    .map(e => {
      let normal = 0;
      let late = 0;
      let earlyLeave = 0;
      let missing = 0;

      for (const date of days) {
        const record = records.find(r => r.employeeId === e.id && r.date === date);
        const kind = approvedRequestKind(requests, e.id, date);
        const status = computeStatus(record, date, kind);

        if (status === 'normal') normal += 1;
        else if (status === 'late') late += 1;
        else if (status === 'earlyLeave') earlyLeave += 1;
        else if (status === 'lateAndEarly') {
          late += 1;
          earlyLeave += 1;
        } else if (status === 'missing') missing += 1;
        // 연차·반차·외근·휴무·아직 안 찍은 오늘은 세지 않는다
      }

      const counted = normal + late + earlyLeave + missing;
      const score = normal - (late + earlyLeave) * LATE_PENALTY - missing * MISSING_PENALTY;

      return {
        employeeId: e.id,
        name: e.name,
        normal,
        late,
        earlyLeave,
        missing,
        counted,
        score,
        rank: 0,
        perfect: counted > 0 && late === 0 && earlyLeave === 0 && missing === 0,
      };
    })
    /*
      한 번도 안 센 사람은 순위에 넣지 않는다.

      이번 달에 들어온 사람이나 계정만 있고 안 찍는 사람이 0점으로 꼴찌에 박히면,
      순위가 성실도가 아니라 입사일 표가 된다.
    */
    .filter(r => r.counted > 0);

  rows.sort((a, b) => b.score - a.score || b.normal - a.normal || a.name.localeCompare(b.name));

  // 점수가 같으면 같은 등수다 — 하루도 안 빠진 두 사람에게 1등과 2등을 매길 이유가 없다
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    if (prev === null || r.score !== prev) {
      rank = i + 1;
      prev = r.score;
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
