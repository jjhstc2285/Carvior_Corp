import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { LogIn, LogOut, Search } from 'lucide-react';
import { useStore } from '../store';
import { api, ApiError } from '../lib/api';
import { alertError } from '../lib/alert';
import EmployeeAvatar from './EmployeeAvatar';
import type { AttendanceRecord } from '../types';

/**
 * 오늘 출퇴근 — 전 직원.
 *
 * 각자 자기 계정으로 찍는 게 원칙인데, 계정이 없는 사람도 있고 휴대폰을 안 들고
 * 다니는 사람도 있다. 그런 사람 몫을 사무실에서 대신 찍어 준다.
 *
 * 단말·네트워크 확인은 안 걸린다 — 관리자 PC 에서 누르는 것이라 그 확인이 뜻이 없다.
 * 대신 관리자만 열 수 있는 자리에 둔다.
 */
export default function TeamClockBoard() {
  const { state, refresh } = useStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hideDone, setHideDone] = useState(false);

  const today = dayjs().format('YYYY-MM-DD');

  /*
    오늘 기록은 여기서 따로 받는다.

    전역 목록은 관리자가 고른 달을 따라간다 — 지난달을 보고 있으면 오늘 찍은 게 안 보여서
    전원이 '아직 안 찍음'으로 뜨고, 그 상태로 누르면 '이미 출근 등록을 했습니다'만 난다.
  */
  const [recs, setRecs] = useState<AttendanceRecord[]>([]);
  const load = useCallback(async () => {
    try {
      setRecs(await api<AttendanceRecord[]>(`/attendance/records?month=${dayjs().format('YYYY-MM')}`));
    } catch {
      // 못 받아도 명단은 보여준다 — 그 상태로 찍으면 서버가 막는다
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 오늘 기록을 직원별로 — 목록을 매번 훑지 않게 한 번만 모은다 */
  const todayOf = useMemo(() => {
    const map = new Map<string, { clockIn: string | null; clockOut: string | null }>();
    for (const r of recs) {
      if (r.date !== today) continue;
      map.set(r.employeeId, { clockIn: r.clockIn, clockOut: r.clockOut });
    }
    return map;
  }, [recs, today]);

  const rows = useMemo(() => {
    const q = query.trim();
    return state.employees
      .filter(e => e.active)
      .filter(e => !q || e.name.includes(q) || (e.department ?? '').includes(q))
      .filter(e => !hideDone || !todayOf.get(e.id)?.clockOut)
      .sort((a, b) => (a.department ?? '').localeCompare(b.department ?? '') || a.name.localeCompare(b.name));
  }, [state.employees, query, hideDone, todayOf]);

  const punched = state.employees.filter(e => e.active && todayOf.get(e.id)?.clockIn).length;
  const left = state.employees.filter(e => e.active && todayOf.get(e.id)?.clockOut).length;

  const punch = async (employeeId: string, kind: 'in' | 'out') => {
    setBusyId(employeeId);
    try {
      await api(`/attendance/clock-${kind === 'in' ? 'in' : 'out'}/${employeeId}`, { method: 'POST' });
      await load();
      // 오늘 근무 현황처럼 다른 자리도 같이 바뀐다
      await refresh();
    } catch (e) {
      void alertError('찍지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">오늘 출퇴근 — 전 직원</h2>
        <span className="text-xs text-slate-400">
          출근 {punched} · 퇴근 {left} / {state.employees.filter(e => e.active).length}명
        </span>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={e => setHideDone(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            퇴근한 사람 숨기기
          </label>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름·팀"
              className="w-32 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      <p className="px-5 pt-3 text-xs text-slate-500">
        본인 계정으로 못 찍는 사람 몫을 <b>대신 찍어 주는 자리</b>입니다. 누르면 <b>지금 시각</b>으로 찍힙니다 —
        시각을 고쳐야 하면 정정 요청으로 받으세요.
      </p>

      <div className="grid gap-2 px-5 py-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400">해당하는 사람이 없습니다.</p>
        )}
        {rows.map(e => {
          const rec = todayOf.get(e.id);
          const busy = busyId === e.id;
          return (
            <div
              key={e.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                rec?.clockOut
                  ? 'border-slate-200 bg-slate-50/70'
                  : rec?.clockIn
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <EmployeeAvatar name={e.name} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {e.name}
                  <span className="ml-1 text-xs font-normal text-slate-400">{e.position}</span>
                </p>
                {/* 찍힌 시각이 곧 상태다 — 따로 배지를 달지 않는다 */}
                <p className="text-[11px] text-slate-500">
                  {rec?.clockIn ? (
                    <>
                      출근 <b className="text-slate-700">{rec.clockIn}</b>
                      {rec.clockOut && (
                        <>
                          {' · '}퇴근 <b className="text-slate-700">{rec.clockOut}</b>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">아직 안 찍음</span>
                  )}
                </p>
              </div>

              {!rec?.clockIn ? (
                <button
                  onClick={() => void punch(e.id, 'in')}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <LogIn size={12} /> 출근
                </button>
              ) : !rec.clockOut ? (
                <button
                  onClick={() => void punch(e.id, 'out')}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <LogOut size={12} /> 퇴근
                </button>
              ) : (
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                  완료
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
