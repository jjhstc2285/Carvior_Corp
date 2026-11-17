import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../store';
import { ApiError } from '../lib/api';
import { alertError } from '../lib/alert';
// 막히는 규칙은 홈의 출퇴근과 같이 쓴다 — 각자 들고 있으면 한쪽만 고치는 날이 온다
import { punch } from '../lib/punch';
import { askMealThen } from '../lib/askMeal';
import { MEAL_IN_BY, MEAL_OUT_FROM } from '../lib/attendance';

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const FULL_WORK_MINUTES = 8 * 60;

/*
  구내식당 체크가 처음에 켜져 있는 기준 — 서버가 식대를 셀 때 쓰는 것과 같은 시각이다.

  여기 있는 값은 보여주기만 한다. 실제로 며칠치를 주는지는 서버가 정한다 — 둘이 어긋나면
  급여가 어긋나는 쪽이 아니라 체크 표시만 어긋난다.

  평소에는 아무도 안 눌러도 맞게 켜져 있고, 밖에서 먹은 날만 끄면 된다.
*/


function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export default function ClockCard() {
  const { state, clockIn, clockOut, setMeal } = useStore();
  const [mealBusy, setMealBusy] = useState(false);

  /*
    체크를 누르면 바로 서버에 적는다 — 따로 저장 버튼을 두지 않는다.

    기다렸다 받아야 한다. 안 기다리면 실패해도 화면은 체크된 채로 남아, 먹지도 않은 날이
    그대로 식대에 올라간다.
  */
  const toggleMeal = async (next: boolean) => {
    setMealBusy(true);
    try {
      await setMeal(next);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.';
      await alertError('구내식당 체크를 바꾸지 못했습니다', message);
    } finally {
      setMealBusy(false);
    }
  };
  const [, forceTick] = useState(0);

  // 출근~지금(또는 퇴근시각)까지 원형 게이지가 실시간으로 차오르게 1분마다 리렌더
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // 명단 캐시 등으로 내가 목록에서 잠깐 빠질 수 있다 — 단언하면 카드가 아니라 화면 전체가 죽는다.
  const employee = state.employees.find(e => e.id === state.currentEmployeeId);
  if (!employee) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
        <p className="text-sm text-slate-400">직원 정보를 불러오는 중입니다…</p>
      </section>
    );
  }

  const today = dayjs().format('YYYY-MM-DD');
  const record = state.records.find(r => r.employeeId === employee.id && r.date === today);



  const clockedIn = !!record?.clockIn;
  const clockedOut = !!record?.clockOut;

  /*
    구내식당을 먹은 날인가.

    손으로 켜거나 끈 날은 그 값이고, 안 건드린 날은 출퇴근 시각으로 본다. 출근을 찍기
    전에는 적을 데가 없다 — 그날 기록이 아직 없다.
  */
  const mealAuto =
    !!record?.clockIn && !!record.clockOut && record.clockIn <= MEAL_IN_BY && record.clockOut >= MEAL_OUT_FROM;
  const mealOn = record?.mealUsed ?? mealAuto;
  const mealSet = record?.mealUsed !== null && record?.mealUsed !== undefined;

  const canClockIn = !clockedIn;
  const canClockOut = clockedIn && !clockedOut;

  const nowMin = toMinutes(dayjs().format('HH:mm'));
  const workedMin = record?.clockIn
    ? (record.clockOut ? toMinutes(record.clockOut) : nowMin) - toMinutes(record.clockIn)
    : 0;
  const percent = Math.max(0, Math.min(100, Math.round((workedMin / FULL_WORK_MINUTES) * 100)));
  const h = Math.floor(Math.max(workedMin, 0) / 60);
  const m = Math.max(workedMin, 0) % 60;

  const statusMessage = clockedOut
    ? `${employee.name}님, 오늘 근무를 마쳤습니다.`
    : clockedIn
      ? `${employee.name}님, 근무 중입니다.\n오늘도 화이팅하세요.`
      : `${employee.name}님, 아직 출근 전입니다.`;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>오늘</span>
            <span>{dayjs().format('YY-MM-DD')} ({DAY_KO[dayjs().day()]}) {dayjs().format('HH:mm:ss')}</span>
          </div>
          <p className="mt-3 whitespace-pre-line text-base font-semibold text-slate-800">{statusMessage}</p>
          <div className="mt-3 space-y-0.5 text-sm text-slate-500">
            <p>출근 : {record?.clockIn ?? '-'}</p>
            <p>퇴근 : {record?.clockOut ?? '-'}</p>
          </div>

        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="50" cy="50" r={radius} fill="none" stroke="#4f7cff" strokeWidth="8"
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.4s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-slate-800">{percent}%</span>
              <span className="text-[11px] text-slate-400">근무시간</span>
              <span className="text-xs font-semibold text-slate-600">{h}h {m}m</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void punch(clockIn)}
              disabled={!canClockIn}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              style={canClockIn ? { backgroundColor: '#4f7cff' } : undefined}
            >
              출근
            </button>
            <button
              onClick={() => void punch(() => askMealThen(record?.mealUsed, setMeal, clockOut))}
              disabled={!canClockOut}
              className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              퇴근
            </button>
          </div>

          {/*
            구내식당.

            함바집은 먹은 끼니로 계산한다. 출퇴근만 보고 세면 손님 만나러 나가서 밖에서
            먹은 날까지 올라가니, 그날은 본인이 끈다.
          */}
          <label
            className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
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
                      : mealOn
                        ? '아직 안 정했습니다 — 지금 체크는 출퇴근 시각으로 어림한 값입니다. 퇴근할 때 여쭤봅니다.'
                        : '아직 안 정했습니다 — 퇴근할 때 여쭤봅니다. 먼저 체크해 두셔도 됩니다.'}
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
