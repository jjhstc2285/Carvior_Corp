import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import {
  CAPITAL_COMPANIES,
  MAX_AGE_YEARS,
  MAX_MILEAGE_KM,
  offerEligibility,
  stockDeadline,
} from '../../lib/stockFinance';
import { digitsOnly, withCommas } from '../../lib/money';
import type { ManagedVehicle } from '../../types';
import type { VehiclesApi } from './useVehicles';

type View = 'candidate' | 'offered' | 'stocked' | 'repay' | 'cash';

/** 상환 예정만 전 직원이 본다 — 그 달에 갚을 차를 직원들이 확인한다. */
const VIEWS: { key: View; label: string; desc: string; officeOnly: boolean }[] = [
  {
    key: 'candidate',
    label: '제시 대상',
    desc: `${MAX_AGE_YEARS}년 이내 · ${(MAX_MILEAGE_KM / 10000).toLocaleString()}만km 미만인데 아직 제시일자를 안 적은 차입니다.`,
    officeOnly: true,
  },
  { key: 'offered', label: '제시함', desc: '제시일자를 적은 차입니다. 이전일자와 재고 내용을 마저 채웁니다.', officeOnly: true },
  { key: 'stocked', label: '재고 잡힘', desc: '할부사와 재고금액이 들어간 차입니다.', officeOnly: true },
  { key: 'repay', label: '상환 예정', desc: '상환일자를 월별로 모아 봅니다. 그 달에 갚아야 하는 차량입니다.', officeOnly: false },
  { key: 'cash', label: '현금차량', desc: '재고금융을 안 쓰는 차입니다. 제시 대상에서 빠집니다.', officeOnly: true },
];

/** 날짜 칸을 기간으로 거른다. 어느 날짜를 볼지는 보기마다 다르다. */
type DateField = 'offerDate' | 'transferDate' | 'repayDate';

/**
 * 재고금융(제시) 관리.
 *
 * 흐름이 이렇다 — 차가 들어오면 제시할 수 있는 차인지 보고(10년 이내·20만km 미만),
 * 제시했으면 제시일자·이전일자를 적고, 재고가 잡히면 할부사·재고금액·상환일자를 적는다.
 * 재고가 안 되는 차는 현금차량으로 빼두면 제시 대상에 계속 남지 않는다.
 *
 * 제시 가능 여부는 저장하지 않고 연식·주행거리로 그때그때 가린다. 기준이 바뀌어도
 * 지난 기록이 옛 기준으로 굳지 않는다.
 */
export default function StockFinanceTab({ api, isOfficeManager }: { api: VehiclesApi; isOfficeManager: boolean }) {
  const { vehicles, toggleFlag } = api;
  const views = useMemo(() => VIEWS.filter(v => isOfficeManager || !v.officeOnly), [isOfficeManager]);

  const [view, setView] = useState<View>(() => (isOfficeManager ? 'candidate' : 'repay'));
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // 제시함은 제시일자로, 재고 잡힘은 이전일자로 거른다 — 그 화면에서 챙기는 날짜다.
  const dateField: DateField | null = view === 'offered' ? 'offerDate' : view === 'stocked' ? 'transferDate' : null;

  const rows = useMemo(() => {
    const q = query.trim();
    return vehicles
      .map(v => ({ vehicle: v, eligibility: offerEligibility(v) }))
      .filter(({ vehicle: v }) => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q))
      .filter(({ vehicle: v, eligibility }) => {
        if (view === 'cash') return v.cashVehicle;
        if (v.cashVehicle) return false;
        if (view === 'candidate') return eligibility.ok !== false && !v.offerDate;
        if (view === 'offered') return Boolean(v.offerDate);
        if (view === 'stocked') return v.stockAmount > 0 || Boolean(v.stockCapital);
        return v.repayDate?.startsWith(month) ?? false;
      })
      .filter(({ vehicle: v }) => {
        if (!dateField) return true;
        const value = v[dateField];
        if (from && (!value || value < from)) return false;
        if (to && (!value || value > to)) return false;
        return true;
      })
      .sort((a, b) => {
        if (view === 'repay') return (a.vehicle.repayDate ?? '').localeCompare(b.vehicle.repayDate ?? '');
        // 등록증을 봐야 갈리는 차부터 올린다 — 그게 지금 할 일이다.
        if (view === 'candidate') {
          const rank = (ok: unknown) => (ok === 'check' ? 0 : ok === null ? 1 : 2);
          const gap = rank(a.eligibility.ok) - rank(b.eligibility.ok);
          if (gap !== 0) return gap;
        }
        return (b.vehicle.offerDate ?? '').localeCompare(a.vehicle.offerDate ?? '');
      });
  }, [vehicles, query, view, month, dateField, from, to]);

  const stockTotal = rows.reduce((sum, r) => sum + r.vehicle.stockAmount, 0);
  const current = views.find(v => v.key === view) ?? views[0];

  /*
   * 지금 쓰고 있는 재고금융 총액 — 보고 있는 목록이 아니라 재고가 잡힌 차 전부를 센다.
   * 목록을 걸러 보는 중에도 총액은 그대로여야 한다. 얼마나 당겨 썼는지가 알고 싶은 거지
   * 지금 화면에 몇 대가 보이는지가 아니다.
   */
  const inUse = useMemo(() => {
    const stocked = vehicles.filter(v => !v.cashVehicle && v.stockAmount > 0);
    return { count: stocked.length, total: stocked.reduce((sum, v) => sum + v.stockAmount, 0) };
  }, [vehicles]);

  /** 이번 달에 갚아야 하는 금액 — 상환일자가 그 달에 걸린 차들 */
  const dueThisMonth = useMemo(() => {
    const due = vehicles.filter(v => v.repayDate?.startsWith(month) && v.stockAmount > 0);
    return { count: due.length, total: due.reduce((sum, v) => sum + v.stockAmount, 0) };
  }, [vehicles, month]);

  const patch = (v: ManagedVehicle, body: Partial<ManagedVehicle>) => void toggleFlag(v, body);

  const handleExport = () => {
    const data = rows.map(({ vehicle: v, eligibility }) => ({
      차량번호: v.vehicleNumber,
      차량명: v.vehicleModel,
      '제시 가능':
        eligibility.ok === true
          ? '가능'
          : eligibility.ok === false
            ? `불가 (${eligibility.reason})`
            : eligibility.reason,
      제시일자: v.offerDate ?? '',
      이전일자: v.transferDate ?? '',
      상환일자: v.repayDate ?? '',
      할부사: v.stockCapital,
      '재고금액(원)': v.stockAmount || '',
      현금차량: v.cashVehicle ? 'O' : '',
      최초등록일: v.firstRegisteredOn ?? '',
      연식: v.modelYear,
      주행거리: v.mileage || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고금융');
    XLSX.writeFile(wb, `재고금융_${view === 'repay' ? month : dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const dateInput = (value: string | null, onSave: (next: string | null) => void, highlight = false) => (
    <input
      type="date"
      defaultValue={value ?? ''}
      onBlur={e => {
        if (e.target.value !== (value ?? '')) onSave(e.target.value || null);
      }}
      className={`rounded-lg border px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 ${
        highlight ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
      }`}
    />
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">재고금융 사용 총액</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {inUse.total.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">재고 잡힌 차 {inUse.count}대</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{dayjs(month).format('M월')} 상환 예정</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {dueThisMonth.total.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">{dueThisMonth.count}대</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{current.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {rows.length}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
          {stockTotal > 0 && (
            <p className="text-[11px] text-slate-400">재고금액 {stockTotal.toLocaleString()}원</p>
          )}
        </div>
      </div>

      <div className="mb-3 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {views.map(v => (
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

        {dateField && (
          <span className="flex items-center gap-1 text-sm text-slate-500">
            {view === 'offered' ? '제시일자' : '이전일자'}
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            ~
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            {(from || to) && (
              <button
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100"
              >
                해제
              </button>
            )}
          </span>
        )}

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">차량번호</th>
                <th className="px-4 py-3 font-medium">차량명</th>
                <th className="px-3 py-3 font-medium">제시 가능</th>
                <th className="px-3 py-3 font-medium">제시일자</th>
                <th className="px-3 py-3 font-medium">이전일자</th>
                <th className="px-3 py-3 font-medium">상환일자</th>
                <th className="px-3 py-3 font-medium">할부사</th>
                <th className="px-3 py-3 text-right font-medium">재고금액</th>
                <th className="px-3 py-3 text-center font-medium">현금</th>
                <th className="px-3 py-3 font-medium">최초등록일 · 기한</th>
                <th className="px-3 py-3 font-medium">연식</th>
                <th className="px-3 py-3 text-right font-medium">주행거리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-sm text-slate-400">
                    해당하는 차량이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map(({ vehicle: v, eligibility }) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{v.vehicleNumber}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-slate-600" title={v.vehicleModel}>
                    {v.vehicleModel}
                  </td>

                  <td className="px-3 py-2.5">
                    {eligibility.ok === true ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        가능 · {eligibility.age}년차
                      </span>
                    ) : eligibility.ok === false ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        불가 · {eligibility.reason}
                      </span>
                    ) : eligibility.ok === 'check' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        등록증 확인 · {eligibility.reason}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {eligibility.reason}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">{dateInput(v.offerDate, next => patch(v, { offerDate: next }))}</td>
                  <td className="px-3 py-2.5">{dateInput(v.transferDate, next => patch(v, { transferDate: next }))}</td>
                  <td className="px-3 py-2.5">{dateInput(v.repayDate, next => patch(v, { repayDate: next }))}</td>

                  <td className="px-3 py-2.5">
                    <input
                      defaultValue={v.stockCapital}
                      onBlur={e => {
                        const next = e.target.value.trim();
                        if (next !== v.stockCapital) patch(v, { stockCapital: next });
                      }}
                      list="capital-companies"
                      placeholder="할부사"
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      defaultValue={v.stockAmount ? withCommas(v.stockAmount) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== v.stockAmount) patch(v, { stockAmount: next });
                      }}
                      inputMode="numeric"
                      placeholder="원"
                      className="w-28 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-[13px] outline-none focus:border-indigo-400"
                    />
                  </td>

                  {/* 재고가 안 되는 차는 여기 체크해 두면 제시 대상에서 빠지고 현금차량으로 모인다 */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={v.cashVehicle}
                      onChange={e => patch(v, { cashVehicle: e.target.checked })}
                      className="size-4.5 accent-indigo-600"
                      aria-label="현금차량"
                    />
                  </td>

                  {/*
                    최초등록일은 등록증이 손에 있는 매입 때 적는다 — 여기서는 보기만 한다.
                    딱 10년차인데 비어 있으면 노랗게 칠해 매입 관리에서 채우라고 알린다.
                  */}
                  <td className="px-3 py-2.5">
                    {v.firstRegisteredOn ? (
                      <span className="text-[13px] text-slate-600">
                        {v.firstRegisteredOn}
                        {/* 언제까지 되는지가 날짜보다 중요하다 */}
                        {(() => {
                          const d = stockDeadline(v.firstRegisteredOn);
                          if (!d) return null;
                          return (
                            <span className={`ml-1 text-[11px] font-semibold ${d.passed ? 'text-red-600' : 'text-emerald-700'}`}>
                              {d.passed ? `${d.date} 만료` : `${d.date}까지`}
                            </span>
                          );
                        })()}
                      </span>
                    ) : eligibility.ok === 'check' ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                        매입 관리에서 입력
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    <input
                      defaultValue={v.modelYear}
                      onBlur={e => {
                        const next = e.target.value.trim();
                        if (next !== v.modelYear) patch(v, { modelYear: next });
                      }}
                      placeholder="2016"
                      className={`w-20 rounded-lg border px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 ${
                        v.modelYear ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      defaultValue={v.mileage ? withCommas(v.mileage) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== v.mileage) patch(v, { mileage: next });
                      }}
                      inputMode="numeric"
                      placeholder="km"
                      className={`w-24 rounded-lg border px-1.5 py-1 text-right text-[13px] outline-none focus:border-indigo-400 ${
                        v.mileage ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                      }`}
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
