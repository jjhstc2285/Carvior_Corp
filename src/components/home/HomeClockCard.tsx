import { useState } from 'react';
import dayjs from 'dayjs';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useStore } from '../../store';
import { useCurrentIp } from '../../lib/useCurrentIp';
import { ipAllowed } from '../../lib/ipMatch';
import { punch } from '../../lib/punch';
import { ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { MEAL_IN_BY, MEAL_OUT_FROM } from '../../lib/attendance';

/**
 * 홈의 출퇴근 — 누르는 일만 남긴다.
 *
 * 출퇴근 화면의 카드를 그대로 가져왔더니 홈에서 제일 큰 덩어리가 됐다. 원형 게이지와
 * 근무 시간, 구내식당 체크까지 다 들어 있는데, 홈에서 할 일은 둘 중 하나를 누르는 것뿐이다.
 *
 * 그래서 여기서는 지금 상태와 단추 두 개만 둔다. 자세한 건 출퇴근 화면이 보여 준다.
 *
 * 구내식당 체크만 같이 둔다. 그건 그날 안에 눌러야 하는 값인데, 출퇴근 화면까지 들어가야
 * 보이니 아무도 안 눌렀다 — 밖에서 먹은 날이 그대로 식대에 올라갔다.
 *
 * 막히는 규칙(등록 안 된 PC·사무실 밖 네트워크)은 lib/punch 에 모아 두고 양쪽이 같이
 * 쓴다 — 각자 들고 있으면 한쪽만 고치는 날이 오고, 같은 상황에서 다른 말이 뜬다.
 */
export default function HomeClockCard() {
  const { state, clockIn, clockOut, setMeal } = useStore();
  const { ip, loading: ipLoading } = useCurrentIp();
  const [busy, setBusy] = useState(false);
  const [mealBusy, setMealBusy] = useState(false);

  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  if (!me) return null;

  const today = dayjs().format('YYYY-MM-DD');
  const record = state.records.find(r => r.employeeId === me.id && r.date === today);
  const clockedIn = !!record?.clockIn;
  const clockedOut = !!record?.clockOut;

  // 허용 IP 목록은 관리자만 받아 간다 — 다른 사람 화면에는 빈 목록이라 애초에 안 걸린다
  const isAdmin = me.role === 'ADMIN';
  const whitelistEnabled = state.ipWhitelist.length > 0 && !isAdmin;
  const ipOk = !whitelistEnabled || (!!ip && ipAllowed(state.ipWhitelist, ip));

  const canIn = !clockedIn && (isAdmin || (!ipLoading && ipOk));
  const canOut = clockedIn && !clockedOut;

  const hit = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await punch(action);
    } finally {
      setBusy(false);
    }
  };

  /*
    구내식당을 먹은 날인가.

    손으로 켜거나 끈 날은 그 값이고, 안 건드린 날은 출퇴근 시각으로 본다 — 출퇴근
    화면과 같은 자를 쓴다. 평소에는 아무도 안 눌러도 맞게 켜져 있고, 밖에서 먹은
    날만 끄면 된다.
  */
  const mealAuto =
    !!record?.clockIn && !!record.clockOut && record.clockIn <= MEAL_IN_BY && record.clockOut >= MEAL_OUT_FROM;
  const mealOn = record?.mealUsed ?? mealAuto;
  const mealSet = record?.mealUsed !== null && record?.mealUsed !== undefined;

  /* 누르면 바로 적는다. 기다렸다 받아야 한다 — 안 기다리면 실패해도 체크된 채로 남는다 */
  const toggleMeal = async (next: boolean) => {
    setMealBusy(true);
    try {
      await setMeal(next);
    } catch (e) {
      await alertError('구내식당 체크를 바꾸지 못했습니다', e instanceof ApiError ? e.message : '잠시 후 다시 눌러 주세요.');
    } finally {
      setMealBusy(false);
    }
  };

  const badge = clockedOut
    ? { text: '퇴근', tone: 'bg-slate-100 text-slate-500' }
    : clockedIn
      ? { text: '근무중', tone: 'bg-emerald-100 text-emerald-700' }
      : { text: '미출근', tone: 'bg-rose-100 text-rose-600' };

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={18} className="text-indigo-600" />
        <p className="text-base font-bold text-slate-800">오늘 출퇴근</p>
        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${badge.tone}`}>{badge.text}</span>
      </div>

      {/* 찍은 시각은 작게 — 단추가 먼저 보여야 한다 */}
      {(clockedIn || clockedOut) && (
        <p className="mb-2.5 text-xs text-slate-400">
          출근 <b className="font-bold text-slate-600">{record?.clockIn ?? '—'}</b>
          {clockedOut && (
            <>
              {' · '}퇴근 <b className="font-bold text-slate-600">{record?.clockOut}</b>
            </>
          )}
        </p>
      )}

      <div className="flex flex-1 flex-col justify-center gap-2.5">
        <button
          onClick={() => void hit(clockIn)}
          disabled={!canIn || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <LogIn size={17} /> 출근하기
        </button>
        <button
          onClick={() => void hit(clockOut)}
          disabled={!canOut || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3.5 text-base font-bold text-slate-600 transition hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
        >
          <LogOut size={17} /> 퇴근하기
        </button>
      </div>

      {/* 그날 안에 눌러야 하는 값이라 홈에 둔다 — 출퇴근 화면까지 들어가면 아무도 안 누른다 */}
      <label
        className={`mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
          clockedIn ? 'cursor-pointer border-slate-200 bg-slate-50' : 'border-slate-100 bg-slate-50/60'
        }`}
      >
        <input
          type="checkbox"
          checked={mealOn}
          disabled={!clockedIn || mealBusy}
          onChange={e => void toggleMeal(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-indigo-600 disabled:cursor-not-allowed"
        />
        <span className="leading-snug">
          <span className="font-semibold text-slate-700">구내식당</span>
          <span className="ml-1 text-slate-400">
            {!clockedIn
              ? '출근을 찍은 뒤 체크할 수 있습니다.'
              : mealBusy
                ? '적는 중…'
                : mealSet
                  ? mealOn
                    ? '먹은 날로 적혀 있습니다.'
                    : '안 먹은 날로 적혀 있습니다.'
                  : '출퇴근 시각으로 자동 판정 중입니다. 밖에서 먹은 날은 체크를 끄세요.'}
          </span>
        </span>
      </label>

      {/* 왜 못 누르는지 — 안 적으면 "버튼이 안 눌린다"로 돌아온다 */}
      {!clockedIn && !canIn && !ipLoading && (
        <p className="mt-2.5 text-xs text-amber-600">사무실 네트워크에서만 출근을 찍을 수 있습니다.</p>
      )}
    </div>
  );
}
