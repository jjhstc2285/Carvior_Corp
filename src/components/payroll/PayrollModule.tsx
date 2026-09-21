import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Trash2, Wallet } from 'lucide-react';
import { api, ApiError, getPayrollPass, setPayrollPass } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import type { PayrollEntry } from '../../types';

/**
 * 인건비.
 *
 * 종이로 돌던 급여표를 그대로 옮긴 것이다 — 급여, 회사공제, 본인공제, 식대, 실 이체.
 *
 * 실 이체액은 저장하지 않는다. 급여에서 공제를 빼고 식대를 더하면 나오는 값이라,
 * 저장해 두면 금액을 고쳤을 때 둘이 어긋난다. 볼 때마다 다시 낸다.
 *
 * 로그인만으로는 안 열린다. 보는 사람을 이름으로 좁히고 번호를 한 번 더 받는다 —
 * 자리를 비운 사이 남의 급여가 열린 채로 있으면 안 된다.
 */

/*
  칸마다 너비를 따로 준다 — 여기에 w-full 을 같이 넣으면 둘이 부딪쳐 칸이 찌그러진다.
*/
const INPUT =
  'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

/** 공제를 누가 지는가 — 종이에 적혀 있던 말 그대로 */
const BURDENS = ['본인all', '세금 all 회사부담', '공제없음'];

/** 실 이체 = 급여 − 회사공제 − 본인공제 + 식대 */
function netOf(r: PayrollEntry): number {
  return r.monthlyPay - r.companyDeduction - r.selfDeduction + r.mealAllowance;
}

export default function PayrollModule() {
  const [rows, setRows] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // 잠금 — 번호를 받기 전에는 아무것도 안 보여준다
  const [locked, setLocked] = useState(!getPayrollPass());
  const [denied, setDenied] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PayrollEntry[]>('/payroll'));
      setDenied(false);
      setLocked(false);
    } catch (e) {
      // 통행증이 시간 지나 막힌 것과, 아예 볼 수 없는 계정을 갈라 본다
      if (e instanceof ApiError && e.code === 'PAYROLL_LOCKED') {
        setPayrollPass(null);
        setLocked(true);
      } else if (e instanceof ApiError && e.status === 403) {
        setDenied(true);
      } else {
        void alertError('불러오지 못했습니다', e instanceof ApiError ? e.message : '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = async () => {
    setUnlocking(true);
    setCodeError(null);
    try {
      const res = await api<{ pass: string }>('/payroll/unlock', { method: 'POST', body: { code } });
      setPayrollPass(res.pass);
      setCode('');
      setLocked(false);
      await load();
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.message : '열지 못했습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  const patch = async (row: PayrollEntry, body: Partial<PayrollEntry>) => {
    setBusyId(row.id);
    try {
      await api(`/payroll/${row.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    try {
      await api('/payroll', { method: 'POST', body: { name: '새 직원' } });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: PayrollEntry) => {
    const ok = await confirmDanger(
      `${row.name} 줄을 지울까요?`,
      '그만둔 분이면 지우지 말고 [지급중] 체크를 풀어 주세요 — 지난 달 인건비도 기록입니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/payroll/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const shown = rows.filter(r => showInactive || r.active);

  const totals = useMemo(() => {
    const live = rows.filter(r => r.active);
    return {
      count: live.length,
      pay: live.reduce((s, r) => s + r.monthlyPay, 0),
      company: live.reduce((s, r) => s + r.companyDeduction, 0),
      self: live.reduce((s, r) => s + r.selfDeduction, 0),
      meal: live.reduce((s, r) => s + r.mealAllowance, 0),
      net: live.reduce((s, r) => s + netOf(r), 0),
    };
  }, [rows]);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Lock size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">인건비는 정해진 분만 볼 수 있습니다.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Lock size={26} className="mx-auto text-indigo-500" />
          <h1 className="mt-3 text-base font-bold text-slate-800">인건비</h1>
          <p className="mt-1 text-xs text-slate-500">번호를 넣어 주세요. 창을 닫으면 다시 물어봅니다.</p>
          <input
            type="password"
            inputMode="numeric"
            value={code}
            onChange={e => {
              setCode(e.target.value);
              setCodeError(null);
            }}
            onKeyDown={e => e.key === 'Enter' && void unlock()}
            placeholder="••••"
            className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-indigo-400"
          />
          {codeError && <p className="mt-2 text-xs font-medium text-red-500">{codeError}</p>}
          <button
            onClick={() => void unlock()}
            disabled={unlocking || !code.trim()}
            className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {unlocking ? '여는 중…' : '열기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold text-slate-900">
            <Wallet size={18} className="text-indigo-600" /> 인건비
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            급여에서 공제를 빼고 식대를 더한 <b>실 이체액</b>을 자동으로 냅니다 — 금액을 고치면 바로 따라갑니다.
          </p>
        </div>
        <button
          onClick={() => void addRow()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 직원 추가
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">한 달 실 이체</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {totals.net.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">{totals.count}명</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">급여 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.pay.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">공제 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {(totals.company + totals.self).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">
            회사 {totals.company.toLocaleString()} · 본인 {totals.self.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">식대 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.meal.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          그만둔 분도 보기
        </label>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${shown.length}명`}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-3" />
                <th className="px-3 py-3 font-medium">이름</th>
                <th className="px-3 py-3 font-medium">직책</th>
                <th className="px-3 py-3 text-right font-medium">급여</th>
                <th className="px-3 py-3 text-right font-medium">회사공제</th>
                <th className="px-3 py-3 text-right font-medium">본인공제</th>
                <th className="px-3 py-3 font-medium">부담</th>
                <th className="px-3 py-3 text-right font-medium">식대</th>
                <th className="px-3 py-3 text-right font-medium">실 이체</th>
                <th className="px-3 py-3 font-medium">메모</th>
                <th className="px-3 py-3 text-center font-medium">지급중</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '적어둔 인건비가 없습니다. [직원 추가]로 시작하세요.'}
                  </td>
                </tr>
              )}
              {shown.map(r => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 last:border-0 ${r.active ? '' : 'bg-slate-50/60 text-slate-400'}`}
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={() => void removeRow(r)}
                      disabled={busyId === r.id}
                      className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      aria-label="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.name}
                      onBlur={e => e.target.value.trim() !== r.name && void patch(r, { name: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.position}
                      onBlur={e => e.target.value !== r.position && void patch(r, { position: e.target.value })}
                      disabled={busyId === r.id}
                      placeholder="부장"
                      className={`${INPUT} w-20`}
                    />
                  </td>

                  {(['monthlyPay', 'companyDeduction', 'selfDeduction'] as const).map(field => (
                    <td key={field} className="px-3 py-2">
                      <input
                        defaultValue={withCommas(String(r[field] || ''))}
                        onBlur={e => {
                          const next = Number(digitsOnly(e.target.value)) || 0;
                          if (next !== r[field]) void patch(r, { [field]: next });
                        }}
                        disabled={busyId === r.id}
                        inputMode="numeric"
                        placeholder="0"
                        className={`${INPUT} w-28 text-right`}
                      />
                    </td>
                  ))}

                  <td className="px-3 py-2">
                    {/* 종이에 적혀 있던 말 그대로 둔다 — '본인all' 같은 표현이 뜻을 더 잘 담는다 */}
                    <input
                      defaultValue={r.burden}
                      onBlur={e => e.target.value !== r.burden && void patch(r, { burden: e.target.value })}
                      disabled={busyId === r.id}
                      list="payroll-burdens"
                      placeholder="공제없음"
                      className={`${INPUT} w-32`}
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      defaultValue={withCommas(String(r.mealAllowance || ''))}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== r.mealAllowance) void patch(r, { mealAllowance: next });
                      }}
                      disabled={busyId === r.id}
                      inputMode="numeric"
                      placeholder="0"
                      className={`${INPUT} w-24 text-right`}
                    />
                  </td>

                  {/* 실 이체는 적는 칸이 아니다 — 위 숫자를 고치면 따라온다 */}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-indigo-700">
                    {netOf(r).toLocaleString()}
                  </td>

                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.memo}
                      onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-40`}
                    />
                  </td>

                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={e => void patch(r, { active: e.target.checked })}
                      disabled={busyId === r.id}
                      className="size-4 accent-indigo-600"
                      aria-label="지급중"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="payroll-burdens">
        {BURDENS.map(b => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <p className="mt-2 text-[11px] text-slate-400">
        칸을 고치고 <b>칸 밖을 누르면 바로 저장</b>됩니다. <b>실 이체 = 급여 − 회사공제 − 본인공제 + 식대</b> 로
        자동 계산되니 그 칸은 적지 않습니다.
        <br />
        그만둔 분은 지우지 말고 <b>지급중 체크를 풀어</b> 주세요 — 지난 달 인건비도 기록입니다.
      </p>
    </div>
  );
}
