import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { withCommas } from '../../lib/money';

/**
 * 이미 적어둔 성능비에 부가세를 올린다.
 *
 * 성능비는 부가세를 따로 붙여 청구해 오는데, 그동안 공급가만 적힌 건이 쌓였다. 그만큼
 * 원가가 낮게 잡혀 있다.
 *
 * 한꺼번에 곱하지 않는다. 이미 부가세가 붙은 건이 섞여 있으면 두 배가 되고, 두 배가 된
 * 건은 결재까지 가서야 눈에 띈다 — 되돌릴 방법도 없다. 그래서 한 줄씩 보여주고 고르게
 * 한다. 금액을 보면 어느 쪽인지 대개 안다(33,000 이면 이미 붙은 값이다).
 *
 * 결재가 끝난 건은 아예 안 나온다. 골라 봐야 못 고친다.
 */

interface Cost {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  date: string;
  vendor: string;
  memo: string;
  amount: number;
  withVat: number;
}

export default function PerformanceVatModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => Promise<void> }) {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api<Cost[]>('/settlements/purchase/performance-costs');
      setCosts(rows);
      /*
        아무것도 미리 고르지 않는다.

        전부 골라 두면 '반영'만 누르고 넘어가게 되는데, 이미 부가세가 붙은 건이 섞여
        있으면 그게 두 배가 된다. 한 줄씩 보게 하는 게 이 화면의 요점이다.
      */
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '성능비 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ updated: number }>('/settlements/purchase/performance-vat', {
        method: 'POST',
        body: { ids: [...picked] },
      });
      setDone(res.updated);
      await onApplied();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const gain = costs.filter(c => picked.has(c.id)).reduce((s, c) => s + (c.withVat - c.amount), 0);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">성능비 부가세 올리기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          이미 적어둔 성능비에 <b>10%</b>를 올립니다. <b className="text-amber-700">이미 부가세가 붙은 건은 고르지 마세요</b> —
          두 배가 되고 되돌릴 방법이 없습니다. 결재가 끝난 건은 목록에 없습니다.
        </p>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {done !== null && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <b>{done}건</b> 올렸습니다.
          </p>
        )}

        {loading && <p className="mt-6 text-center text-sm text-slate-400">불러오는 중…</p>}
        {!loading && costs.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">고칠 수 있는 성능비가 없습니다.</p>
        )}

        {costs.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => setPicked(new Set(costs.map(c => c.id)))}
                className="rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-500 hover:bg-slate-50"
              >
                전부 고르기
              </button>
              <button
                onClick={() => setPicked(new Set())}
                className="rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-500 hover:bg-slate-50"
              >
                전부 풀기
              </button>
              <span className="ml-auto text-slate-500">
                고른 것 <b className="text-slate-800">{picked.size}</b>건 · 늘어나는 금액{' '}
                <b className="text-indigo-700">{withCommas(String(gain))}</b>원
              </span>
            </div>

            <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-400">
                  <tr>
                    <th className="w-8 px-2 py-1.5" />
                    <th className="px-2.5 py-1.5 font-medium">정산일</th>
                    <th className="px-2.5 py-1.5 font-medium">차량</th>
                    <th className="px-2.5 py-1.5 font-medium">업체 · 메모</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">지금</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">×1.1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {costs.map(c => {
                    const on = picked.has(c.id);
                    // 이미 반영한 건은 메모에 남아 있다 — 두 번 올리지 않게 눈에 띄게 둔다
                    const already = c.memo.includes('부가세');
                    return (
                      <tr
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={`cursor-pointer ${on ? 'bg-indigo-50/60' : already ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={on} readOnly className="size-3.5 accent-indigo-600" />
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1 text-slate-500">
                          {dayjs(c.date).format('M/D')}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1">
                          <span className="font-mono text-slate-700">{c.vehicleNumber}</span>
                          <span className="ml-1 text-slate-500">{c.vehicleName}</span>
                        </td>
                        <td className="px-2.5 py-1 text-slate-500">
                          {c.vendor}
                          {c.memo && <span className="ml-1 text-slate-400">{c.memo}</span>}
                          {already && <span className="ml-1 font-bold text-amber-700">← 이미 반영됨</span>}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1 text-right text-slate-600">
                          {withCommas(String(c.amount))}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1 text-right font-semibold text-indigo-700">
                          {withCommas(String(c.withVat))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
          <button
            onClick={() => void apply()}
            disabled={busy || picked.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? '올리는 중…' : `${picked.size}건 올리기`}
          </button>
        </div>
      </div>
    </div>
  );
}
