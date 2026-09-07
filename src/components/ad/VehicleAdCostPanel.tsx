import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlarmClock, Search } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { REPAY_BADGE_CLASS, repayLabel, repayUrgency } from '../../lib/stockFinance';
import type { ManagedVehicle } from '../../types';

/**
 * 차 한 대씩 광고금액 적기.
 *
 * 계약 단위(월 30대에 22만원)로는 "이 차에 얼마 썼나"가 안 나온다. 나중에 그 차를 팔고
 * 남는 걸 볼 때 필요한 건 대당 금액이라 여기서 따로 적는다.
 *
 * 목록은 제시함·재고 잡힌 차만 올린다 — 재고로 잡아 우리가 들고 있는 차라야 광고를
 * 붙인다. 아직 제시도 안 한 차가 섞이면 목록만 길어진다.
 */

/** 적어 넣는 즉시 저장하지 않는다 — 칸을 벗어날 때 한 번만 보낸다. */
export default function VehicleAdCostPanel() {
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  /** 입력 중인 값. 저장 전까지는 화면 값이 먼저다. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVehicles(await api<ManagedVehicle[]>('/vehicles'));
    } catch (e) {
      void alertError('차량을 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim();
    return vehicles
      .filter(v => v.offerDate || v.stockAmount > 0)
      .filter(v => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q))
      .sort((a, b) => {
        // 상환이 급한 차부터 올린다 — 상환일까지 못 팔면 그 돈을 그냥 갚아야 한다.
        const rank = (v: ManagedVehicle) => {
          const u = repayUrgency(v.repayDate);
          return u ? { passed: 0, urgent: 1, soon: 2 }[u.level] : 3;
        };
        const gap = rank(a) - rank(b);
        if (gap !== 0) return gap;
        return (b.offerDate ?? '').localeCompare(a.offerDate ?? '');
      });
  }, [vehicles, query]);

  const total = rows.reduce((sum, v) => sum + v.adCost, 0);
  const entered = rows.filter(v => v.adCost > 0).length;
  // 지났거나 일주일 안쪽인 차. 한 달 안쪽(soon)은 급한 축에 안 넣는다.
  const urgent = rows.filter(v => {
    const u = repayUrgency(v.repayDate);
    return u != null && u.level !== 'soon';
  });

  const save = async (v: ManagedVehicle) => {
    const text = draft[v.id];
    if (text === undefined) return;
    const adCost = Number(digitsOnly(text) || 0);
    setDraft(d => {
      const next = { ...d };
      delete next[v.id];
      return next;
    });
    if (adCost === v.adCost) return;

    setSaving(v.id);
    try {
      await api(`/vehicles/${v.id}`, { method: 'PATCH', body: { adCost } });
      setVehicles(list => list.map(x => (x.id === v.id ? { ...x, adCost } : x)));
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">차량별 광고금액</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            제시함 · 재고 잡힌 차 {rows.length}대 — 이 차에 광고비를 얼마 썼는지 적습니다.
          </p>
          {urgent.length > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
              <AlarmClock size={11} /> 상환 임박 {urgent.length}대 — 먼저 팔아야 합니다
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            적은 차 <b className="text-slate-700">{entered}</b>대 · 합계{' '}
            <b className="text-slate-900">{total.toLocaleString()}원</b>
          </span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="차량번호 · 차량명"
              className="w-40 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          {query ? '찾는 차가 없습니다.' : '제시하거나 재고가 잡힌 차가 아직 없습니다.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">차량번호</th>
                <th className="px-4 py-2 font-medium">차량명</th>
                <th className="px-4 py-2 font-medium">제시일자</th>
                <th className="px-4 py-2 font-medium">상환일자</th>
                <th className="px-4 py-2 text-right font-medium">광고금액(원)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(v => {
                const text = draft[v.id] ?? (v.adCost > 0 ? withCommas(String(v.adCost)) : '');
                const urgency = repayUrgency(v.repayDate);
                return (
                  <tr
                    key={v.id}
                    className={`border-b border-slate-50 last:border-0 ${
                      urgency && urgency.level !== 'soon' ? 'bg-red-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-slate-800">{v.vehicleNumber}</td>
                    <td className="px-4 py-2 text-slate-600">{v.vehicleModel}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {v.offerDate ? dayjs(v.offerDate).format('M월 D일') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {v.repayDate ? (
                        <>
                          {dayjs(v.repayDate).format('M월 D일')}
                          {urgency && (
                            <span
                              className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${REPAY_BADGE_CLASS[urgency.level]}`}
                            >
                              {repayLabel(urgency)}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        value={text}
                        inputMode="numeric"
                        disabled={saving === v.id}
                        onChange={e => setDraft(d => ({ ...d, [v.id]: withCommas(digitsOnly(e.target.value)) }))}
                        onBlur={() => void save(v)}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="0"
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
