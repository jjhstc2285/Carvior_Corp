import dayjs from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, CorrectionRequest, Employee } from '../types';
import { approvedRequestKind, computeStatus, isWorkday, WORK_END, WORK_START } from './attendance';

/**
 * 그 달 출퇴근 순위 — 기준보다 얼마나 더 일했는가로 매긴다.
 *
 * 처음에는 '정상 출근한 날 수'로 셌는데, 달이 막 시작된 날에는 모두가 하루씩이라 전원이
 * 1위가 됐다. 그다음에는 찍힌 시각을 그대로 다 더했는데, 그러면 많이 나온 사람이 거의
 * 무조건 이긴다 — 그 달에 스무 날 나온 사람과 스무이틀 나온 사람이 같은 자에 선다.
 *
 * 그래서 두 가지를 바꿨다.
 *
 * ① 기준보다 이르게 온 만큼 쌓고, 일찍 간 만큼 깎고, 늦게까지 있은 만큼 쌓는다.
 *    9:30 보다 일찍 오면 그만큼 쌓이고 늦으면 깎인다.
 *    퇴근은 두 자를 쓴다. 18시 전에 가면 그만큼 깎고, 18:30 을 넘겨 찍으면 넘긴 만큼
 *    쌓는다 — 그 사이는 아무 일도 없다. 18:10 에 간 날을 조퇴로 잡으면 안 되고, 그렇다고
 *    18:10 이 더 일한 것도 아니다.
 *    늦게까지 있은 몫을 안 쌓아 봤더니 일찍 오는 사람만 상을 받았다. 저녁에 손님을 보고
 *    늦게까지 남는 자리도 있는데, 그쪽은 아무리 남아도 0이었다.
 *    9:30 에 와서 18:00~18:30 사이에 간 날이 0이다 — 그게 '정상'이라는 뜻이다.
 *
 * ② 스무 날 기준으로 맞춘다. 사람마다 나온 날이 달라서 합계로는 견줄 수 없다.
 *    하루 평균을 내고 스무 날로 환산한다 — 며칠 나왔든 같은 자에 선다.
 *
 * 깎이는 자리는 넷이다. 늦게 온 날, 일찍 간 날, 안 찍은 날, 그리고 고쳐 적은 날이다.
 *
 * 근무일인데 안 찍고 그대로 둔 날은 하루치(9시간)를 뺀다 — 그날은 일하지 않은 것으로 본다.
 * 정정 요청으로 시각을 채우면 그 시각으로 다시 매기고, 거기서 삼십 분만 깎는다. 안 찍은
 * 사실은 남지만 고친 사람과 안 고친 사람이 같을 수는 없다.
 *
 * 승인받은 연차·반차·외근은 아예 안 센다 — 쌓이지도 깎이지도 않고, 평균을 내는 날 수에도
 * 안 들어간다. 쉬기로 하고 쉰 날을 손해로 만들면 연차를 안 쓰게 된다.
 *
 * 휴일에 나온 날도 점수에 안 넣는다. 휴일 근무는 차례가 도는 자리라 아예 기회가 없는
 * 사람이 있다 — 그걸 점수에 넣으면 당번을 받은 사람이 이기는 표가 된다. 평일 스무 날로만
 * 견준다. 몇 시간 나왔는지는 따로 세어 두기만 한다.
 */

/** 기본 근무 — 판정과 같은 값을 쓴다. 두 곳에 적어 두었더니 서로 다른 값으로 갈렸다 */
export { WORK_END, WORK_START };

/** 하루 기준 근무(분) — 적어 둔 정상 근무 9:30~18:30 */
const FULL_DAY = 9 * 60;

/** 몇 날을 기준으로 견주는가 — 나온 날이 달라도 같은 자에 세운다 */
export const BASIS_DAYS = 20;

/**
 * 고쳐 적은 날에 깎는 몫(분).
 *
 * 안 찍은 날은 하루치가 깎이는데, 정정으로 시각을 채우면 그 시각으로 다시 매긴다.
 * 그 자리에 아무것도 안 남기면 '안 찍고 나중에 채워 넣기'가 그냥 정상 출근과 같아진다.
 */
const FIXED_PENALTY = 30;

/** "HH:mm" → 자정부터 몇 분. 꼴이 아니면 null */
function minutesOf(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const START_AT = minutesOf(WORK_START) ?? 9 * 60 + 30;
/** 이 시각 전에 가면 그만큼 깎는다 — 18:10 에 간 날을 조퇴로 잡지 않으려고 느슨하게 둔다 */
const END_AT = minutesOf(WORK_END) ?? 18 * 60;

/**
 * 이 시각을 넘겨 찍으면 넘긴 만큼 쌓는다 — 적어 둔 정상 근무가 끝나는 18:30 이다.
 *
 * 깎는 자(18:00)와 다른 값이다. 깎는 쪽은 느슨해야 18:10 퇴근이 조퇴가 안 되고,
 * 쌓는 쪽은 제 시각이어야 18:10 이 '더 일한 것'이 안 된다. 사이 삼십 분은 0이다.
 */
const OVER_AT = 18 * 60 + 30;

/**
 * 하루에 쌓을 수 있는 늦은 퇴근(분) — 두 시간까지.
 *
 * 퇴근을 안 찍고 간 날이 있다. 다음 날 아침이나 밤늦게 찍히면 그 하루가 다른 모든 날을
 * 덮어 버린다 — 점수는 보통 몇십 분인데 그런 날 하나가 다섯 시간씩 들어온다.
 *
 * 지금까지 찍힌 가장 늦은 퇴근이 20:17 이라, 이 테두리에 걸리는 날은 아직 없다.
 */
const OVER_CAP = 120;

export interface AttendanceRankRow {
  employeeId: string;
  name: string;
  /** 스무 날로 환산한 점수(분) — 일찍 온 만큼 쌓고 일찍 간 만큼 깎은 값이다 */
  minutes: number;
  /** 점수를 센 근무일 수 — 이 날수로 평균을 내 스무 날로 환산했다 */
  days: number;
  /** 한 번이라도 찍은 날 수 — 0 이면 등수를 안 매긴다 */
  punched: number;
  /** 휴일에 나와 일한 시간(분) — 점수에는 안 넣고 세어 두기만 한다 */
  holidayMinutes: number;
  /** 정정으로 시각을 채운 날 수 — 그 날마다 삼십 분이 깎인다 */
  fixed: number;
  normal: number;
  late: number;
  earlyLeave: number;
  /** 근무일인데 찍힌 게 없는 날 */
  missing: number;
  /** 1부터. 점수가 같으면 같은 등수다 */
  rank: number;
  /** 한 번도 안 늦고 안 빠졌는가 — 순위와는 따로 본다 */
  perfect: boolean;
}

/** 분 → "32시간 10분". 모자란 쪽은 앞에 빼기를 붙인다 */
export function hoursLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}분`;
  return m === 0 ? `${sign}${h}시간` : `${sign}${h}시간 ${m}분`;
}

export function attendanceRanking(
  employees: Employee[],
  records: AttendanceRecord[],
  requests: AttendanceRequest[],
  month: string,
  /** 승인된 정정 요청 — 고쳐 적은 날을 가리는 데 쓴다. 안 주면 안 가린다 */
  corrections: CorrectionRequest[] = [],
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
    /*
      테스트 계정은 뺀다 — 사람이 아니라 확인하려고 만든 자리인데, 출퇴근을 안 찍으니
      날마다 하루치가 깎여서 꼴찌 자리에 둘이 서 있었다(조직도에서도 같은 까닭으로 뺀다).
    */
    .filter(e => e.active && !e.name.includes('테스트'))
    .map(e => {
      /** 근무일에서 쌓인 점수와, 그 점수를 센 날 수 */
      let score = 0;
      let counted = 0;
      /** 한 번이라도 찍은 날이 있는가 — 아예 안 쓰는 사람은 등수를 안 매긴다 */
      let punched = 0;
      let holidayMinutes = 0;
      let fixed = 0;
      let normal = 0;
      let late = 0;
      let earlyLeave = 0;
      let missing = 0;

      for (const date of days) {
        const record = records.find(r => r.employeeId === e.id && r.date === date);
        const inAt = minutesOf(record?.clockIn);
        const outAt = minutesOf(record?.clockOut);
        const approved = approvedRequestKind(requests, e.id, date);
        /* 안 찍고 나중에 채워 넣은 날인가 — 채워졌으면 기록에는 시각이 들어 있다 */
        const wasFixed = corrections.some(
          c => c.employeeId === e.id && c.date === date && c.status === 'APPROVED',
        );

        /*
          휴일에 나온 날은 점수에 안 넣는다.

          한때 일한 만큼 전부 더했다. 그런데 휴일 근무는 차례가 도는 자리라 아예 기회가
          없는 사람이 있다 — 토요일 한 번 나온 것이 매일 한 시간 일찍 온 것을 단번에
          넘어서니, 성실도가 아니라 당번표를 세는 표가 된다.

          평일 스무 날로만 견준다. 몇 시간 나왔는지는 따로 세어 두기만 한다.
        */
        if (!isWorkday(date)) {
          if (inAt !== null && outAt !== null && outAt > inAt) holidayMinutes += outAt - inAt;
          continue;
        }

        const status = computeStatus(record, date, approved);

        if (status === 'normal') normal += 1;
        else if (status === 'late') late += 1;
        else if (status === 'earlyLeave') earlyLeave += 1;
        else if (status === 'lateAndEarly') {
          late += 1;
          earlyLeave += 1;
        } else if (status === 'missing') missing += 1;

        /*
          쉬기로 한 날과 아직 안 끝난 날은 센 날에서 뺀다.

          연차·반차·외근은 쌓지도 깎지도 않는다. 특히 반차는 늦게 오거나 일찍 가는 게
          정상인 날이라, 기준에 맞춰 깎으면 반차를 쓴 사람만 손해를 본다.

          오늘은 아직 퇴근을 안 찍었을 수 있다 — 끝나지도 않은 날을 조퇴로 세면 안 된다.
        */
        if (status === 'annualLeave' || status === 'halfDay' || status === 'fieldWork') continue;
        if (status === 'pending') continue;

        counted += 1;

        /*
          아무것도 안 찍힌 날 — 그날은 일하지 않은 것으로 봐서 하루치를 뺀다.

          0으로 두면 안 찍는 쪽이 늦게 온 쪽보다 이로워져서 찍지 않는 게 요령이 된다.
          정정 요청으로 시각을 채우면 그 시각으로 다시 매긴다.
        */
        if (inAt === null && outAt === null) {
          score -= FULL_DAY;
          continue;
        }
        punched += 1;

        /*
          한쪽만 찍힌 날 — 나오기는 나온 날이다. 하루치를 빼면 안 된다.

          한때 이것도 하루치로 뺐다. 그랬더니 퇴근을 안 찍는 사람이 열이틀 내리 아홉
          시간씩 깎여서, 순위가 '일을 얼마나 했나'가 아니라 '퇴근 단추를 눌렀나'가 됐다.

          찍힌 쪽은 그대로 세고, 안 찍힌 쪽은 모르는 값이라 0으로 둔 뒤 안 찍은 벌로
          삼십 분만 깎는다 — 고쳐 적은 날과 같은 몫이다.
        */
        if (inAt === null || outAt === null || outAt <= inAt) {
          if (inAt !== null) score += START_AT - inAt;
          if (outAt !== null) score += Math.min(0, outAt - END_AT);
          score -= FIXED_PENALTY;
          continue;
        }

        /*
          고쳐 적은 날 — 채운 시각으로 매기고 거기서 삼십 분을 깎는다.

          안 찍은 날은 하루치가 깎이니 고치는 쪽이 훨씬 낫다. 다만 깎는 게 아예 없으면
          '안 찍고 나중에 채워 넣기'가 제때 찍은 것과 같아진다.
        */
        if (wasFixed) {
          fixed += 1;
          score -= FIXED_PENALTY;
        }

        /*
          지각·조퇴 소명이 승인된 날은 정상으로 본다 — 깎지 않는다.
          다만 일찍 나온 몫도 안 쌓는다. 소명은 '없던 일로 한다'는 뜻이지 상이 아니다.
        */
        if (status === 'normal' && approved === 'LATE_EXCUSE') continue;

        /*
          일찍 온 만큼 쌓고, 일찍 간 만큼 깎고, 늦게까지 있은 만큼 쌓는다.

          퇴근 자가 둘이다. 18시 전에 가면 그만큼 깎고(END_AT), 18:30 을 넘기면 넘긴
          만큼 쌓는다(OVER_AT). 사이 삼십 분은 아무 일도 없다.

          늦게 남은 몫은 두 시간까지만 센다 — 안 찍고 간 날 하나가 그 달 전체를 덮으면
          안 된다.
        */
        score +=
          START_AT - inAt + Math.min(0, outAt - END_AT) + Math.min(OVER_CAP, Math.max(0, outAt - OVER_AT));
      }

      /*
        스무 날로 환산한다.

        하루 평균을 내고 스무 날을 곱한다 — 열 날 나온 사람과 스무이틀 나온 사람이 같은
        자에 선다. 휴일 근무는 안 섞는다(기회가 도는 자리라 넣으면 당번표가 순위가 된다).
      */
      const minutes = counted > 0 ? (score / counted) * BASIS_DAYS : 0;

      return {
        employeeId: e.id,
        name: e.name,
        minutes: Math.round(minutes),
        days: counted,
        punched,
        holidayMinutes,
        fixed,
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
    점수가 같으면 같은 등수다.

    한 날도 센 게 없는 사람은 등수를 안 매긴다 — 0점끼리 공동 1위가 되면 표가 뜻을 잃는다.
    점수가 음수인 사람은 등수에 넣는다. 기준에 모자란 것도 견줄 값이고, 빼면 꼴찌가 사라진다.
  */
  /*
    한 번도 안 찍은 사람은 등수를 안 매긴다.

    출퇴근을 아예 안 쓰는 사람이 있다. 그 사람은 날마다 하루치가 깎여서 늘 꼴찌에
    붙박이로 선다 — 견줄 값이 없는데 자리만 차지한다. 예전에 0분인 사람을 뺐던 것과
    같은 뜻이다.
  */
  const ranked = rows.filter(r => r.days > 0 && r.punched > 0);
  let rank = 0;
  let prev: number | null = null;
  // 등수를 안 매기는 사람은 세는 자리에서도 빼야 한다 — 끼워 두면 그 아래가 한 자씩 밀린다
  ranked.forEach((r, i) => {
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
