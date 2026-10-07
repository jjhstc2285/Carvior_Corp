import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../../store';
import { conversionOf, isOfKind } from '../../lib/consultationStats';

/**
 * 그 달 계약이 어디까지 왔나.
 *
 * 표를 훑어서는 "이번 달 몇 건 했지"가 안 나온다. 목표를 적어 두고, 지금 몇 건이고
 * 몇 건 남았는지를 한 장으로 본다.
 *
 * 세는 규칙은 전환율과 같다(lib/consultationStats.ts) — 계약 = 계약 + 판매완료,
 * 종결은 모수에서 뺀다. 두 곳이 다르게 세면 같은 화면에서 숫자가 어긋난다.
 *
 * 목표는 이 브라우저에만 남는다. 아직 대표 혼자 보는 숫자라 서버에 둘 일이 아니다 —
 * 팀장 자리가 생기면 그때 옮긴다.
 */

const LS_GOAL = 'contractGoalByMonth';

function goalsOf(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LS_GOAL) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export default function ContractGoalPanel({ month, allMonths }: { month: string; allMonths: boolean }) {
  const { state } = useStore();
  const [goals, setGoals] = useState<Record<string, number>>(goalsOf);

  const goal = goals[month] ?? 20;

  const setGoal = (next: number) => {
    const merged = { ...goals, [month]: Math.max(0, Math.round(next)) };
    setGoals(merged);
    try {
      localStorage.setItem(LS_GOAL, JSON.stringify(merged));
    } catch {
      // 저장 못 해도 화면은 돈다 — 다음에 들어오면 기본값으로 돌아갈 뿐이다
    }
  };

  /** 그 달 알선 상담 — 상담일 기준 */
  const stat = useMemo(() => {
    const rows = state.consultations
      .filter(c => isOfKind(c, 'BROKERAGE'))
      .filter(c => allMonths || c.date.startsWith(month));
    return conversionOf(rows);
  }, [state.consultations, month, allMonths]);

  /** 목표 대비 — 목표가 0이면 비율을 낼 수 없다 */
  const percent = goal > 0 ? Math.round((stat.contracted / goal) * 100) : 0;
  const left = goal - stat.contracted;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(percent, 100) / 100) * circumference;

  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-slate-900">
          {allMonths ? '전체 기간' : dayjs(month).format('M월')} 계약 체결 진행 현황
        </h3>
        <span className="text-[11px] text-slate-400">월간 목표 달성 지표</span>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${
            percent >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          달성률 {percent}%
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* 도넛 — 목표를 채운 만큼 */}
        <div className="relative mx-auto h-36 w-36 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="13" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={percent >= 100 ? '#059669' : '#2563eb'}
              strokeWidth="13"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900">{percent}%</span>
            <span className="text-[11px] text-slate-400">체결 달성률</span>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          {/* 목표는 손으로 적는다 — 달마다 다르다 */}
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">총 계약 목표</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <input
                type="number"
                min={0}
                value={goal}
                onChange={e => setGoal(Number(e.target.value))}
                disabled={allMonths}
                className="w-16 rounded border border-transparent bg-transparent text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-400 disabled:opacity-60"
              />
              <span className="text-sm font-medium text-slate-400">건</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {allMonths ? '달을 고르면 목표를 적습니다' : `${dayjs(month).format('M월')} 전체`}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle" />
              체결 완료
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {stat.contracted}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] italic text-emerald-600">
              비율 {stat.total > 0 ? Math.round((stat.contracted / stat.total) * 100) : 0}%
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400 align-middle" />
              진행/미체결
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {stat.total - stat.contracted}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] text-slate-400">
              비율 {stat.total > 0 ? Math.round(((stat.total - stat.contracted) / stat.total) * 100) : 0}%
              {stat.closed > 0 && ` · 종결 ${stat.closed}건 제외`}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">잔여 목표</p>
            <p className={`mt-0.5 text-xl font-bold ${left > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
              {Math.max(0, left)}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] text-slate-400">
              {left > 0 ? `목표까지 ${left}건` : `목표를 ${-left}건 넘겼습니다`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
