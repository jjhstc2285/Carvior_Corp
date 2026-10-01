import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, UserMinus, Users2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../lib/alert';
import { useStore } from '../store';
import { DEPARTMENTS, REFERRAL_TITLES, REFERRAL_TITLE_EMOJI, REFERRAL_TITLE_LABEL, type Employee } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import ReferralTitleBadge from './ReferralTitleBadge';

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

  /**
   * 직급을 고친다.
   *
   * 지금까지 글자로만 찍혀 있어 고칠 데가 없었다 — 승진하거나 잘못 적힌 직급을 바꾸려면
   * 손댈 자리가 없었다. 돈 장부(상조회비·부동산)를 직급으로 가르므로 틀린 채로 두면
   * 봐야 할 사람이 못 보거나 안 볼 사람이 본다.
   */
  const setPosition = async (employee: Employee, position: string) => {
    const next = position.trim();
    if (!next || next === employee.position) return;
    setBusyId(employee.id);
    try {
      await api(`/employees/${employee.id}`, { method: 'PATCH', body: { position: next } });
      await refresh();
    } catch (e) {
      void alertError('직급을 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  /** 알선팀 타이틀 — 실적으로 오르내리는 값이라 여기서 바로 바꾼다 */
  const setTitle = async (employee: Employee, referralTitle: string) => {
    setBusyId(employee.id);
    try {
      await api(`/employees/${employee.id}`, { method: 'PATCH', body: { referralTitle } });
      await refresh();
    } catch (e) {
      void alertError('타이틀을 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const setDepartment = async (employee: Employee, department: string) => {
    setBusyId(employee.id);
    try {
      await api(`/employees/${employee.id}`, {
        method: 'PATCH',
        body: {
          department: department || null,
          /*
            알선팀을 떠나면 타이틀도 같이 내린다.

            남겨 두면 광고팀 사람 이름 앞에 팀장 표가 붙은 채로 돌아다닌다 — 고칠 칸은
            알선팀일 때만 보이니 되돌릴 방법도 없다.
          */
          ...(department !== '알선팀' && employee.referralTitle ? { referralTitle: '' } : {}),
        },
      });
      await load();
      // 작업일지가 이 값으로 팀을 가르니 전역 목록도 같이 받아둔다.
      await refresh();
    } catch (e) {
      void alertError('팀을 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * 휴대번호 저장.
   *
   * 두 개인 분이 있어 쉼표로 여러 개를 받는다(본부장님·강예원 매니저님). 적힌 순서대로
   * 저장되고, 앞에 적은 번호가 대표 번호가 된다.
   * 칸을 벗어날 때만 저장한다 — 한 글자 칠 때마다 보내면 번호를 지우는 도중에도 저장된다.
   */
  const savePhones = async (employee: Employee, text: string) => {
    const phones = text
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (phones.join(',') === employee.phones.join(',')) return;

    setBusyId(employee.id);
    try {
      await api(`/employees/${employee.id}`, { method: 'PATCH', body: { phones } });
      await load();
      // 연락망을 보는 다른 화면도 같이 받아둔다
      await refresh();
    } catch (e) {
      void alertError('번호를 저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
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
                  <th className="px-3 py-2 font-medium">휴대번호</th>
                  <th className="px-3 py-2 font-medium">팀</th>
                  <th className="px-3 py-2 font-medium">알선 타이틀</th>
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
                      <span className="flex items-center gap-2">
                        <ReferralTitleBadge title={e.referralTitle} />
                        <EmployeeAvatar name={e.name} size={26} />
                        <span className={e.active ? '' : 'opacity-60'}>{e.name}</span>
                        {!e.active && (
                          <span className="rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-500">퇴사</span>
                        )}
                      </span>
                    </td>
                    {/* 직급으로 갈리는 화면이 있다(상조회비·부동산) — 틀린 채로 두면 안 된다 */}
                    <td className="px-3 py-2">
                      <input
                        key={`pos-${e.id}-${e.position}`}
                        defaultValue={e.position}
                        onBlur={ev => void setPosition(e, ev.target.value)}
                        disabled={busyId === e.id}
                        list="employee-positions"
                        placeholder="매니저"
                        className="w-24 rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400 disabled:opacity-50"
                      />
                    </td>
                    {/* 번호가 두 개인 분이 있어 쉼표로 받는다 */}
                    <td className="px-3 py-2">
                      <input
                        defaultValue={e.phones.join(', ')}
                        onBlur={ev => void savePhones(e, ev.target.value)}
                        disabled={busyId === e.id}
                        placeholder="010-0000-0000"
                        className={`w-48 rounded-lg border px-1.5 py-1 font-mono text-xs outline-none focus:border-indigo-400 disabled:opacity-50 ${
                          e.phones.length > 0 ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                        }`}
                      />
                    </td>
                    {/* 작업일지가 이 값으로 팀을 가른다 — 비어 있으면 본인 것만 보인다 */}
                    <td className="px-3 py-2">
                      <select
                        value={e.department ?? ''}
                        onChange={ev => void setDepartment(e, ev.target.value)}
                        disabled={busyId === e.id}
                        className={`rounded-lg border px-1.5 py-1 text-xs outline-none focus:border-indigo-400 disabled:opacity-50 ${
                          e.department ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                        }`}
                      >
                        <option value="">팀 없음</option>
                        {DEPARTMENTS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </td>
                    {/* 알선팀 안에서의 등급 — 이름 왼쪽에 붙고, 인센티브 정산이 이 값으로 팀장을 가른다 */}
                    <td className="px-3 py-2">
                      {/* 알선팀에만 다는 표다 — 팀이 아니면 고를 일이 없다 */}
                      {e.department === '알선팀' ? (
                        <select
                          value={e.referralTitle ?? ''}
                          onChange={ev => void setTitle(e, ev.target.value)}
                          disabled={busyId === e.id}
                          className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400 disabled:opacity-50"
                        >
                          <option value="">없음</option>
                          {REFERRAL_TITLES.map(t => (
                            <option key={t} value={t}>
                              {REFERRAL_TITLE_EMOJI[t]} {REFERRAL_TITLE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-300" title="팀을 알선팀으로 바꾸면 고를 수 있습니다">
                          알선팀만
                        </span>
                      )}
                    </td>
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
            {/* 자주 쓰는 직급 — 목록에 없으면 그냥 적는다 */}
            <datalist id="employee-positions">
              {['대표', '본부장', '사무장', '차장', '과장', '대리', '매니저', '주임', '사원'].map(p => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            <b>휴대번호</b>는 칸을 벗어나면 저장됩니다. 번호가 두 개면 쉼표로 나눠 적으세요 —
            앞에 적은 번호가 대표 번호가 됩니다.
            <br />
            <b>팀</b>은 작업일지를 나눠 보는 기준입니다 — 같은 팀끼리 서로의 일지가 보이고, 팀이 없으면 본인 것만 보입니다.
            <br />
            퇴사 처리해도 <b>기록은 지워지지 않습니다</b> — 출퇴근·정산·상담이 그 사람을 가리키고 있어서
            실제로 지우면 이력이 통째로 사라집니다. 목록과 담당자 선택에서만 빠집니다.
          </p>
        </>
      )}
    </div>
  );
}
