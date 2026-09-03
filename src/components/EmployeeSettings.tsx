import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, UserMinus, Users2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../lib/alert';
import { useStore } from '../store';
import type { Employee } from '../types';

/**
 * 직원 관리 — 퇴사 처리와 복직.
 *
 * 서버에는 진작 있던 기능인데 부르는 화면이 없어서, 퇴사한 사람을 지우려면 DB를 직접
 * 만져야 했다. 사람이 나가고 들어오는 건 계속 있는 일이라 화면으로 뺀다.
 *
 * 지우는 게 아니라 '퇴사'로 표시한다. 출퇴근·정산·상담 기록이 그 사람을 가리키고 있어서
 * 실제로 지우면 이력이 통째로 날아간다. 퇴사 처리된 사람은 목록·담당자 고르기에서 빠진다.
 */
export default function EmployeeSettings() {
  const { refresh } = useStore();
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 퇴사자까지 봐야 복직시킬 수 있다.
      setRows(await api<Employee[]>('/employees?includeInactive=true'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '직원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setActive = async (employee: Employee, active: boolean) => {
    setBusyId(employee.id);
    try {
      if (active) {
        await api(`/employees/${employee.id}`, { method: 'PATCH', body: { active: true } });
      } else {
        await api(`/employees/${employee.id}`, { method: 'DELETE' });
      }
      await load();
      // 담당자 고르기 같은 목록이 전역 상태를 보고 있어서 같이 받아둔다.
      await refresh();
      await alertSuccess(`${employee.name}님을 ${active ? '복직' : '퇴사'} 처리했습니다`);
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const confirmLeave = async (employee: Employee) => {
    const ok = await confirmDanger(
      `${employee.name}님을 퇴사 처리할까요?`,
      '기록은 그대로 남고 목록과 담당자 선택에서만 빠집니다. 언제든 복직할 수 있습니다.',
      '퇴사 처리',
    );
    if (ok) await setActive(employee, false);
  };

  const working = rows.filter(e => e.active);
  const left = rows.filter(e => !e.active);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Users2 size={15} className="text-slate-500" />
        <p className="text-sm font-bold text-slate-700">직원 관리</p>
        <span className="text-xs text-slate-400">
          재직 {working.length}명{left.length > 0 && ` · 퇴사 ${left.length}명`}
        </span>
      </div>

      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}
      {loading && <p className="py-6 text-center text-sm text-slate-400">불러오는 중…</p>}

      {!loading && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">직급</th>
                  <th className="px-3 py-2 font-medium">부서</th>
                  <th className="px-3 py-2 font-medium">권한</th>
                  <th className="px-3 py-2 text-right font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr
                    key={e.id}
                    className={`border-b border-slate-50 last:border-0 ${e.active ? '' : 'bg-slate-50/60 text-slate-400'}`}
                  >
                    <td className="px-3 py-2 font-medium">
                      {e.name}
                      {!e.active && (
                        <span className="ml-1.5 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-500">퇴사</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{e.position}</td>
                    <td className="px-3 py-2 text-xs">{e.department ?? '-'}</td>
                    <td className="px-3 py-2 text-xs">{e.role === 'ADMIN' ? '관리자' : '직원'}</td>
                    <td className="px-3 py-2 text-right">
                      {e.active ? (
                        <button
                          onClick={() => void confirmLeave(e)}
                          disabled={busyId === e.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <UserMinus size={12} /> 퇴사 처리
                        </button>
                      ) : (
                        <button
                          onClick={() => void setActive(e, true)}
                          disabled={busyId === e.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <RotateCcw size={12} /> 복직
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            퇴사 처리해도 <b>기록은 지워지지 않습니다</b> — 출퇴근·정산·상담이 그 사람을 가리키고 있어서
            실제로 지우면 이력이 통째로 사라집니다. 목록과 담당자 선택에서만 빠집니다.
          </p>
        </>
      )}
    </div>
  );
}
