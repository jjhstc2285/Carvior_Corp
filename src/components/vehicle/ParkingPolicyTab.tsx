import { useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import {
  VEHICLE_BODY_TYPE_LABEL,
  VEHICLE_SALE_TYPE_LABEL,
  type VehicleBodyType,
  type VehicleSaleType,
} from '../../types';
import { suggestLot } from '../../lib/parkingPolicy';
import { digitsOnly, withCommas } from '../../lib/money';
import type { VehiclesApi } from './useVehicles';

const FUELS = ['가솔린', '디젤', 'LPG', '하이브리드', '전기', '가솔린+LPG'];

/**
 * 주차 배치 기준 — 차 하나하나가 어느 주차장으로 갈지 여기서 정해진다.
 *
 * 값은 매입 관리에서 들어올 때 대부분 채워지고(가격·연료), 차종은 차명으로 짐작해 넣는다.
 * 짐작이 틀리거나 카비어처럼 연료가 안 오는 경우가 있어 여기서 고칠 수 있게 뒀다.
 * 고치는 즉시 오른쪽 추천 주차장이 바뀐다 — 무엇을 바꾸면 어디로 가는지 보이게.
 */
export default function ParkingPolicyTab({ api }: { api: VehiclesApi }) {
  const { vehicles, toggleFlag } = api;
  const [query, setQuery] = useState('');
  const [unsetOnly, setUnsetOnly] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim();
    return vehicles
      .filter(v => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q))
      // 차종이나 값을 아직 못 채운 차부터 손보는 일이 많다.
      .filter(v => !unsetOnly || v.bodyType === 'OTHER' || v.priceManwon === 0)
      .map(v => ({ vehicle: v, suggestion: suggestLot(v) }));
  }, [vehicles, query, unsetOnly]);

  const unset = vehicles.filter(v => v.bodyType === 'OTHER' || v.priceManwon === 0).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차량명 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => setUnsetOnly(v => !v)}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
            unsetOnly ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          덜 채운 차만 {unset}대
        </button>
        <span className="ml-auto text-xs text-slate-400">{rows.length}대</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">차량번호</th>
                <th className="px-4 py-2.5 font-medium">차량명</th>
                <th className="px-3 py-2.5 font-medium">차종</th>
                <th className="px-3 py-2.5 font-medium">연료</th>
                <th className="px-3 py-2.5 text-right font-medium">가격(만원)</th>
                <th className="px-3 py-2.5 font-medium">판매유형</th>
                <th className="px-3 py-2.5 text-center font-medium">택시</th>
                <th className="px-4 py-2.5 font-medium">추천 주차장</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
                    해당하는 차량이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map(({ vehicle: v, suggestion }) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-800">{v.vehicleNumber}</td>
                  <td className="max-w-48 truncate px-4 py-2 text-slate-600" title={v.vehicleModel}>
                    {v.vehicleModel}
                  </td>

                  <td className="px-3 py-2">
                    <select
                      value={v.bodyType}
                      onChange={e => void toggleFlag(v, { bodyType: e.target.value as VehicleBodyType })}
                      className={`rounded-lg border px-1.5 py-1 text-xs outline-none focus:border-indigo-400 ${
                        v.bodyType === 'OTHER' ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'
                      }`}
                    >
                      {(Object.entries(VEHICLE_BODY_TYPE_LABEL) as [VehicleBodyType, string][]).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    {/* 값이 바뀔 때마다 저장하면 한 글자마다 요청이 나간다 — 칸을 벗어날 때 한 번만 보낸다 */}
                    <input
                      defaultValue={v.fuel}
                      onBlur={e => {
                        const next = e.target.value.trim();
                        if (next !== v.fuel) void toggleFlag(v, { fuel: next });
                      }}
                      list="vehicle-policy-fuels"
                      placeholder="가솔린"
                      className="w-20 rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <input
                      defaultValue={v.priceManwon ? withCommas(v.priceManwon) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== v.priceManwon) void toggleFlag(v, { priceManwon: next });
                      }}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-20 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <select
                      value={v.saleType}
                      onChange={e => void toggleFlag(v, { saleType: e.target.value as VehicleSaleType })}
                      className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    >
                      {(Object.entries(VEHICLE_SALE_TYPE_LABEL) as [VehicleSaleType, string][]).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={v.isTaxi}
                      onChange={e => void toggleFlag(v, { isTaxi: e.target.checked })}
                      className="size-4 accent-indigo-600"
                      aria-label="택시"
                    />
                  </td>

                  <td className="px-4 py-2">
                    {suggestion.lots.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        <MapPinned size={11} /> {suggestion.lots.join(' 또는 ')}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">{suggestion.reason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="vehicle-policy-fuels">
        {FUELS.map(f => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  );
}
