import { useCallback, useEffect, useState } from 'react';
import { Coins, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import {
  PROPERTY_COST_KINDS,
  PROPERTY_COST_METHODS,
  type Property,
  type PropertyCost,
} from '../../types';

/**
 * 자리마다 달마다 나가는 돈.
 *
 * 고지서가 여러 장으로 흩어져 있다 — 주차 임대료 한 장, 호실마다 관리비 한 장.
 * 그래서 "한 달에 고정으로 얼마가 나가는가"를 아무도 바로 못 댔다. 자리 밑에 모아 둔다.
 *
 * 금액은 부가세까지 더한 '실제로 빠져나가는 돈'으로 적는다 — 공급가액으로 적으면
 * 통장에서 나간 돈과 안 맞아 매달 다시 계산하게 된다.
 * 달마다 오르내리는 것(전기·수도)은 대표값 하나만 적는다. 러프하게 보는 자리다.
 */

const INPUT =
  'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

export default function PropertyCostModal({
  property,
  onClose,
  onChanged,
}: {
  property: Property;
  onClose: () => void;
  /** 합계가 바뀌면 뒤에 있는 표도 다시 받아야 한다 */
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PropertyCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PropertyCost[]>(`/properties/${property.id}/costs`));
    } catch (e) {
      void alertError('불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [property.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: PropertyCost, body: Partial<PropertyCost>) => {
    setBusyId(row.id);
    try {
      await api(`/properties/costs/${row.id}`, { method: 'PATCH', body });
      await load();
      onChanged?.();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async (kind: string) => {
    try {
      await api(`/properties/${property.id}/costs`, { method: 'POST', body: { kind } });
      await load();
      onChanged?.();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: PropertyCost) => {
    const ok = await confirmDanger(
      `${row.kind}을(를) 지울까요?`,
      '더 안 나가는 돈이면 지우지 말고 [나감] 체크를 풀어 주세요 — 지난 달에 나간 기록입니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/properties/costs/${row.id}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const live = rows.filter(r => r.active);
  const total = live.reduce((sum, r) => sum + r.amount, 0);
  const auto = live.filter(r => r.method === '자동이체').reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800">
              <Coins size={16} className="text-indigo-600" /> 달마다 나가는 돈 — {property.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              월세 · 관리비 · 주차 임대료를 한곳에 적어둡니다. 금액은 <b>부가세까지 더한 실제 나가는 돈</b>으로
              적어 주세요 — 통장에서 빠진 금액과 맞아야 매달 다시 안 셉니다.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-sm text-slate-500">
            한 달 합계 <b className="text-lg text-indigo-700">{total.toLocaleString()}</b>원
          </span>
          {auto > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
              자동이체 {auto.toLocaleString()}원
            </span>
          )}
          {total > auto && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              직접 내는 돈 {(total - auto).toLocaleString()}원
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-1">
            {PROPERTY_COST_KINDS.map(k => (
              <button
                key={k}
                onClick={() => void addRow(k)}
                className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Plus size={11} /> {k}
              </button>
            ))}
          </span>
        </div>

        <div className="mt-3 max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2 font-medium">항목</th>
                <th className="px-3 py-2 text-right font-medium">대당 단가</th>
                <th className="px-3 py-2 text-right font-medium">대수</th>
                <th className="px-3 py-2 text-right font-medium">한 달 금액(원)</th>
                <th className="px-3 py-2 text-center font-medium">내는 날</th>
                <th className="px-3 py-2 font-medium">이체</th>
                <th className="px-3 py-2 font-medium">받는 곳</th>
                <th className="px-3 py-2 font-medium">계좌</th>
                <th className="px-3 py-2 font-medium">메모</th>
                <th className="px-3 py-2 text-center font-medium">나감</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '위의 [+ 월세] [+ 관리비] [+ 주차 임대료]를 눌러 추가하세요.'}
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className={`border-t border-slate-50 ${r.active ? '' : 'bg-slate-50/60 text-slate-400'}`}>
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
                    <select
                      value={r.kind}
                      onChange={e => void patch(r, { kind: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-28`}
                    >
                      {[...new Set([...PROPERTY_COST_KINDS, r.kind].filter(Boolean))].map(k => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* 대수가 오르내리는 건 단가·대수로 둔다 — 대수만 고치면 금액이 따라간다 */}
                  <td className="px-3 py-2">
                    <input
                      defaultValue={withCommas(String(r.unitPrice || ''))}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== r.unitPrice) void patch(r, { unitPrice: next });
                      }}
                      disabled={busyId === r.id}
                      inputMode="numeric"
                      placeholder="195,000"
                      className={`${INPUT} w-24 text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.units || ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== r.units) void patch(r, { units: next });
                      }}
                      disabled={busyId === r.id}
                      inputMode="numeric"
                      placeholder="74"
                      className={`${INPUT} w-16 text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      // 단가·대수를 적어두면 그 곱이 금액이라 여기는 못 고친다
                      key={`${r.id}-amount-${r.amount}`}
                      defaultValue={withCommas(String(r.amount || ''))}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== r.amount) void patch(r, { amount: next });
                      }}
                      disabled={busyId === r.id || (r.unitPrice > 0 && r.units > 0)}
                      inputMode="numeric"
                      title={r.unitPrice > 0 && r.units > 0 ? '단가 × 대수로 자동 계산됩니다' : undefined}
                      className={`${INPUT} w-32 text-right ${r.unitPrice > 0 && r.units > 0 ? 'bg-slate-50 font-semibold' : ''}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.payDay || ''}
                      onBlur={e => {
                        const next = Math.min(31, Number(digitsOnly(e.target.value)) || 0);
                        if (next !== r.payDay) void patch(r, { payDay: next });
                      }}
                      disabled={busyId === r.id}
                      inputMode="numeric"
                      placeholder="20"
                      className={`${INPUT} w-14 text-center`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.method}
                      onChange={e => void patch(r, { method: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-24 ${r.method === '자동이체' ? 'text-slate-500' : 'font-semibold text-amber-700'}`}
                    >
                      {PROPERTY_COST_METHODS.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.payee}
                      onBlur={e => e.target.value !== r.payee && void patch(r, { payee: e.target.value })}
                      disabled={busyId === r.id}
                      placeholder="㈜나이스에스케이브이원"
                      className={`${INPUT} w-40`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.account}
                      onBlur={e => e.target.value !== r.account && void patch(r, { account: e.target.value })}
                      disabled={busyId === r.id}
                      placeholder="농협 301-0382-0665-21"
                      className={`${INPUT} w-44 font-mono text-xs`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.memo}
                      onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                      disabled={busyId === r.id}
                      placeholder="74대 · 1대 195,000"
                      className={`${INPUT} w-44`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={e => void patch(r, { active: e.target.checked })}
                      disabled={busyId === r.id}
                      className="size-4 accent-indigo-600"
                      aria-label="나감"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">
          <b>러프하게</b> 잡으세요. 전기량에 따라 관리비가 오르내리니 113만이면 <b>120만</b>처럼 넉넉히
          올려 적는 편이 낫습니다 — 모자라게 잡는 것보다 남게 잡는 쪽이 안전합니다.
          <br />
          주차 임대료처럼 <b>대수가 바뀌는 것</b>은 <b>대당 단가</b>와 <b>대수</b>를 적어 두세요.
          50대가 들어오든 100대가 들어오든 <b>대수만 고치면</b> 금액이 따라갑니다(금액 칸은 자동).
          <br />
          더 안 나가는 돈은 지우지 말고 <b>나감 체크를 풀어</b> 주세요.
        </p>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
