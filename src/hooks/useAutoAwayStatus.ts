import { useEffect, useRef } from 'react';

/**
 * 30분 조작이 없으면 상태를 '자리비움'으로 바꾼다.
 *
 * 예전에는 이걸로 근태 신청(자리비움)을 올리고 관리자에게 알렸다. 마당에 나가 차를
 * 보는 게 일인 사람들이라 조작이 없는 게 자리를 비운 게 아니었고, 알림만 쌓였다.
 * 지금은 옆자리 사람이 보라고 상태만 바꾼다 — 기록도 알림도 남지 않는다.
 *
 * 본인이 적어둔 상태는 건드리지 않는다. '외근 중'이라고 적고 나간 사람을
 * 30분 뒤에 '자리비움'으로 덮으면 적은 뜻이 사라진다.
 * 자동으로 올린 것만 돌아왔을 때 내린다.
 *
 * 알아둘 것:
 *  - 브라우저 탭이 열려 있어야 잡힌다. 탭을 닫으면 아무 신호도 못 준다.
 *  - 흐른 시간을 '몇 번 울렸나'가 아니라 시각 차이로 잰다. 브라우저는 안 보이는 탭의
 *    타이머를 늦추거나 멈추는데, 횟수로 세면 그만큼 늦게 잡힌다.
 */

/** 조작이 없다고 볼 시간 */
const IDLE_MS = 30 * 60 * 1000;
/** 얼마나 자주 재볼지 — 30분 기준이라 1분이면 넉넉하다 */
const CHECK_MS = 60 * 1000;

/** 자동으로 올린 것임을 이 문구로 가린다. 사람이 적은 것과 섞이면 안 된다. */
export const AUTO_AWAY = { emoji: '🌙', text: '자리비움 (자동)' } as const;

/** 사람이 만지고 있다는 신호. passive 로 붙여 스크롤을 막지 않는다. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * 지금 자리비움으로 바꿔야 하는가.
 *
 * 판단만 따로 떼어 둔다 — 타이머·이벤트에 얽혀 있으면 규칙이 맞는지 확인할 수가 없다.
 */
export function shouldMarkAway(input: {
  now: number;
  lastActivity: number;
  /** 출근을 찍고 아직 퇴근을 안 찍었는가 */
  working: boolean;
  /** 지금 적혀 있는 상태 */
  statusText: string | null | undefined;
}): boolean {
  if (!input.working) return false;
  if (input.now - input.lastActivity < IDLE_MS) return false;
  // 이미 자리비움이면 그대로 둔다. 사람이 적어둔 상태는 덮지 않는다.
  return !input.statusText;
}

/** 돌아왔을 때 상태를 내려야 하는가 — 자동으로 올린 것만 내린다. */
export function shouldClearAway(statusText: string | null | undefined): boolean {
  return statusText === AUTO_AWAY.text;
}

interface Options {
  /** 출근을 찍고 아직 퇴근을 안 찍었는가 */
  working: boolean;
  /** 지금 적혀 있는 내 상태 */
  statusText: string | null | undefined;
  setStatus: (next: { emoji: string | null; text: string | null }) => Promise<void>;
}

export function useAutoAwayStatus({ working, statusText, setStatus }: Options): void {
  const lastActivity = useRef(Date.now());
  /** 렌더마다 바뀌는 값을 타이머가 들여다보게 — 타이머를 다시 걸지 않으려고 */
  const latest = useRef({ working, statusText, setStatus });
  latest.current = { working, statusText, setStatus };
  /** 보내는 중에 다음 차례가 돌아 두 번 보내는 걸 막는다 */
  const sending = useRef(false);

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();

      // 돌아왔다. 자동으로 올린 자리비움만 내린다.
      const { statusText: now, setStatus: send } = latest.current;
      if (!shouldClearAway(now) || sending.current) return;
      sending.current = true;
      void send({ emoji: null, text: null }).finally(() => {
        sending.current = false;
      });
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
      const { working: isWorking, statusText: now, setStatus: send } = latest.current;
      const due = shouldMarkAway({
        now: Date.now(),
        lastActivity: lastActivity.current,
        working: isWorking,
        statusText: now,
      });
      if (!due || sending.current) return;

      sending.current = true;
      void send({ emoji: AUTO_AWAY.emoji, text: AUTO_AWAY.text }).finally(() => {
        sending.current = false;
      });
    }, CHECK_MS);

    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, touch);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);
}

/** 화면에 문구로 적을 때 쓴다 — 기준을 두 곳에 적으면 어긋난다. */
export const IDLE_AWAY_MINUTES = IDLE_MS / 60000;
