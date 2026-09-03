import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { CAPITAL_COMPANIES, MAX_AGE_YEARS, MAX_MILEAGE_KM, offerEligibility } from '../../lib/stockFinance';
import { digitsOnly, withCommas } from '../../lib/money';
import type { ManagedVehicle } from '../../types';
import type { VehiclesApi } from './useVehicles';

type View = 'candidate' | 'offered' | 'stocked' | 'repay';

const VIEWS: { key: View; label: string; desc: string }[] = [
  { key: 'candidate', label: '제시 대상', desc: `${MAX_AGE_YEARS}년 이내 · ${(MAX_MILEAGE_KM / 10000).toLocaleString()}만km 미만인데 아직 제시일자를 안 적은 차입니다.` },
  { key: 'offered', label: '제시함', desc: '제시일자를 적은 차입니다. 이전일자와 재고 내용을 마저 채웁니다.' },
  { key: 'stocked', label: '재고 잡힘', desc: '할부사와 재고금액이 들어간 차입니다.' },
  { key: 'repay', label: '상환 예정', desc: '상환일자를 월별로 모아 봅니다. 그 달에 갚아야 하는 차량입니다.' },
];

/**
 * 재고금융(제시) 관리.
 *
 * 흐름이 이렇다 — 차가 들어오면 제시할 수 있는 차인지 보고(10년 이내·20만km 미만),
 * 제시했으면 제시일자·이전일자를 적고, 재고가 잡히면 할부사·재고금액·상환일자를 적는다.
 * 그 뒤로는 상환일자를 월별로 모아 그 달에 갚을 차를 본다.
 *
 * 제시 가능 여부는 저장하지 않는다. 연식·주행거리로 그때그때 가리므로 기준이 바뀌어도
 * 지난 기록이 옛 기준으로 굳지 않는다.
 */
export default function StockFinanceTab({ api }: { api: VehiclesApi }) {
  const { vehicles, toggleFlag } = api;
  const [view, setView] = useState<View>('candidate');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));

  const rows = useMemo(() => {
    const q = query.trim();
    return vehicles
      .map(v => ({ vehicle: v, eligibility: offerEligibility(v) }))
      .filter(({ vehicle: v }) => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q))
      .filter(({ vehicle: v, eligibility }) => {
        if (view === 'candidate') return eligibility.ok !== false && !v.offerDate;
        if (view === 'offered') return Boolean(v.offerDate);
        if (view === 'stocked') return v.stockAmount > 0 || Boolean(v.stockCapital);
        return v.repayDate?.startsWith(month) ?? false;
      })
      .sort((a, b) => {
        if (view === 'repay') return (a.vehicle.repayDate ?? '').localeCompare(b.vehicle.repayDate ?? '');
        return (b.vehicle.offerDate ?? '').localeCompare(a.vehicle.offerDate ?? '');
      });
  }, [vehicles, query, view, month]);

  const stockTotal = rows.reduce((sum, r) => sum + r.vehicle.stockAmount, 0);
  const current = VIEWS.find(v => v.key === view)!;

  const patch = (v: ManagedVehicle, body: Partial<ManagedVehicle>) => void toggleFlag(v, body);

  const handleExport = () => {
    const data = rows.map(({ vehicle: v, eligibility }) => ({
      차량번호: v.vehicleNumber,
      차량명: v.vehicleModel,
      연식: v.modelYear,
      주행거리: v.mileage || '',
      '제시 가능': eligibility.ok === true ? '가능' : eligibility.ok === false ? `불가 (${eligibility.reason})` : eligibility.reason,
      제시일자: v.offerDate ?? '',
      이전일자: v.transferDate ?? '',
      할부사: v.stockCapital,
      '재고금액(원)': v.stockAmount || '',
      상환일자: v.repayDate ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고금융');
    XLSX.writeFile(wb, `재고금융_${view === 'repay' ? month : dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <>
      <div className="mb-3 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              view === v.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-slate-500">{current.desc}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차량명 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        {view === 'repay' && (
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        )}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Download size={14} /> 엑셀
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {rows.length}대{stockTotal > 0 && ` · 재고금액 ${stockTotal.toLocaleString()}원`}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">차량번호</th>
                <th className="px-4 py-2.5 font-medium">차량명</th>
                <th className="px-3 py-2.5 font-medium">연식</th>
                <th className="px-3 py-2.5 text-right font-medium">주행거리</th>
                <th className="px-3 py-2.5 font-medium">제시 가능</th>
                <th className="px-3 py-2.5 font-medium">제시일자</th>
                <th className="px-3 py-2.5 font-medium">이전일자</th>
                <th className="px-3 py-2.5 font-medium">할부사</th>
                <th className="px-3 py-2.5 text-right font-medium">재고금액</th>
                <th className="px-3 py-2.5 font-medium">상환일자</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">
                    해당하는 차량이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map(({ vehicle: v, eligibility }) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-800">{v.vehicleNumber}</td>
                  <td className="max-w-44 truncate px-4 py-2 text-slate-600" title={v.vehicleModel}>
                    {v.vehicleModel}
                  </td>

                  {/* 연식·주행거리는 매입 관리에서 들어오지만 비어 오는 경우가 있어 여기서도 채운다 */}
                  <td className="px-3 py-2">
                    <input
                      defaultValue={v.modelYear}
                      onBlur={e => {
                        const next = e.target.value.trim();
                        if (next !== v.modelYear) patch(v, { modelYear: next });
                      }}
                      placeholder="2016"
                      className={`w-16 rounded-lg border px-1.5 py-1 text-xs outline-none focus:border-indigo-400 ${
                        v.modelYear ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      defaultValue={v.mileage ? withCommas(v.mileage) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== v.mileage) patch(v, { mileage: next });
                      }}
                      inputMode="numeric"
                      placeholder="km"
                      className={`w-24 rounded-lg border px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400 ${
                        v.mileage ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                      }`}
                    />
                  </td>

                  <td className="px-3 py-2">
                    {eligibility.ok === true ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        가능 · {eligibility.age}년차
                      </span>
                    ) : eligibility.ok === false ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        불가 · {eligibility.reason}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {eligibility.reason}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={v.offerDate ?? ''}
                      onBlur={e => {
                        if (e.target.value !== (v.offerDate ?? '')) patch(v, { offerDate: e.target.value || null });
                      }}
                      className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={v.transferDate ?? ''}
                      onBlur={e => {
                        if (e.target.value !== (v.transferDate ?? '')) patch(v, { transferDate: e.target.value || null });
                      }}
                      className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      defaultValue={v.stockCapital}
                      onBlur={e => {
                        const next = e.target.value.trim();
                        if (next !== v.stockCapital) patch(v, { stockCapital: next });
                      }}
                      list="capital-companies"
                      placeholder="할부사"
                      className="w-20 rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      defaultValue={v.stockAmount ? withCommas(v.stockAmount) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== v.stockAmount) patch(v, { stockAmount: next });
                      }}
                      inputMode="numeric"
                      placeholder="원"
                      className="w-28 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={v.repayDate ?? ''}
                      onBlur={e => {
                        if (e.target.value !== (v.repayDate ?? '')) patch(v, { repayDate: e.target.value || null });
                      }}
                      className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="capital-companies">
        {CAPITAL_COMPANIES.map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
