import { useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import type { AttendanceRecord } from '../types';

/**
 * 자리비움 자동 감지.
 *
 * 출근을 찍고 아직 퇴근을 안 찍은 사람의 컴퓨터가 30분 동안 아무 조작이 없으면
 * 자리비움으로 올리고 관리자에게 알린다. 사람이 매번 신청하지 않아도 되게.
 *
 * 알아둘 것:
 *  - 브라우저 탭이 열려 있어야 잡힌다. 탭을 닫으면 아무 신호도 못 준다.
 *    (화면을 잠그거나 자리를 뜬 채 탭만 켜둔 경우가 잡으려는 상황이라 실제로는 맞아떨어진다)
 *  - 흐른 시간을 '몇 번 울렸나'가 아니라 시각 차이로 잰다. 브라우저는 안 보이는 탭의
 *    타이머를 늦추거나 아예 멈추는데, 횟수로 세면 그만큼 늦게 잡힌다.
 *  - 한 번 비운 걸로 잡으면 돌아올 때까지 다시 올리지 않는다. 30분마다 계속 올리면
 *    관리자 알림이 도배된다.
 */

/** 조작이 없다고 볼 시간 */
const IDLE_MS = 30 * 60 * 1000;
/** 얼마나 자주 재볼지 — 30분 기준이라 1분이면 넉넉하다 */
const CHECK_MS = 60 * 1000;

/** 사람이 만지고 있다는 신호. passive 로 붙여 스크롤을 막지 않는다. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

interface Options {
  /** 지금 로그인한 직원. 없으면 아무것도 안 한다 */
  employeeId: string | null;
  /** 이번 달 출퇴근 기록 — 오늘 출근을 찍었는지 본다 */
  records: AttendanceRecord[];
  submit: (input: { date: string; kind: 'AWAY'; reason: string }) => Promise<void>;
}

export function useIdleAway({ employeeId, records, submit }: Options): void {
  const lastActivity = useRef(Date.now());
  /** 이번에 비운 걸 이미 올렸는지 */
  const reported = useRef(false);
  /** 렌더마다 바뀌는 값을 타이머가 들여다보게 — 타이머를 다시 걸지 않으려고 */
  const latest = useRef({ employeeId, records, submit });
  latest.current = { employeeId, records, submit };

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
      // 돌아왔으면 다음에 또 비울 때 다시 올릴 수 있게 푼다.
      reported.current = false;
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, touch, { passive: true });
    }
    // 탭을 다시 보는 것도 돌아온 걸로 친다 — 다른 창에서 일하다 온 경우다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') touch();
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer = window.setInterval(() => {
      void check();
    }, CHECK_MS);

    const check = async () => {
      const { employeeId: id, records: rows, submit: send } = latest.current;
      if (!id || reported.current) return;
      if (Date.now() - lastActivity.current < IDLE_MS) return;

      // 출근 전이거나 이미 퇴근했으면 자리를 비운 게 아니다.
      const today = dayjs().format('YYYY-MM-DD');
      const record = rows.find(r => r.employeeId === id && r.date === today);
      if (!record?.clockIn || record.clockOut) return;

      // 먼저 올렸다고 표시한다. 요청이 오가는 사이에 다음 차례가 돌아 두 번 올리는 걸 막는다.
      reported.current = true;
      try {
        const since = dayjs(lastActivity.current).format('HH:mm');
        await send({
          date: today,
          kind: 'AWAY',
          reason: `자동 감지 — ${since}부터 30분간 컴퓨터 조작이 없었습니다.`,
        });
      } catch {
        // 못 올렸으면 다음 차례에 다시 해본다. 자리비움 하나 때문에 화면을 막지 않는다.
        reported.current = false;
      }
    };

    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, touch);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);
}

/** 화면에 문구로 적을 때 쓴다 — 기준을 두 곳에 적으면 어긋난다. */
export const IDLE_AWAY_MINUTES = IDLE_MS / 60000;
