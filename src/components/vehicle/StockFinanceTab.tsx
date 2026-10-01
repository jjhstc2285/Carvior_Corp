import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Search, Upload } from 'lucide-react';
import {
  CAPITAL_COMPANIES,
  MAX_AGE_YEARS,
  MAX_MILEAGE_KM,
  offerEligibility,
  suggestRepayDate,
  SALE_STAGE_CLASS,
  SALE_STAGE_LABEL,
  saleStage,
} from '../../lib/stockFinance';
import { digitsOnly, withCommas } from '../../lib/money';
import { useStore } from '../../store';
import type { ManagedVehicle, PurchaseIntake } from '../../types';
import { api as callApi, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import PurchaseIntakeForm from '../purchaseIntake/PurchaseIntakeForm';
import type { VehiclesApi } from './useVehicles';
import UnregisteredSoldPanel from './UnregisteredSoldPanel';
import UnregisteredIntakePanel from './UnregisteredIntakePanel';
import StockSheetImportModal from './StockSheetImportModal';

type View = 'candidate' | 'offered' | 'stocked' | 'repay' | 'cash' | 'release' | 'sold';

/**
 * 제시·재고 쪽만 사무장이 챙긴다. 나머지(상환 예정·출고 예정·매도 차량·현금차량)는
 * 파는 사람들이 봐야 하는 것이라 전 직원에게 열어둔다.
 */
const VIEWS: { key: View; label: string; desc: string; officeOnly: boolean }[] = [
  {
    key: 'candidate',
    label: '제시 대상',
    desc: `제시일자·이전일자를 아직 다 못 적은 차입니다. 제시는 넣어봐야 아는 것이라 다 보여줍니다 — 제시할 수 있는 차인지는 '제시 가능' 칸을 봅니다(${MAX_AGE_YEARS}년 이내 · ${(MAX_MILEAGE_KM / 10000).toLocaleString()}만km 미만).`,
    officeOnly: true,
  },
  {
    key: 'offered',
    label: '제시함',
    desc: '제시일자와 이전일자를 다 적은 차입니다. 할부사 · 재고금액 · 상환일자를 다 넣으면 재고차량으로 넘어갑니다.',
    officeOnly: true,
  },
  { key: 'stocked', label: '재고차량', desc: '할부사 · 재고금액 · 상환일자를 다 적은 차입니다.', officeOnly: true },
  { key: 'cash', label: '현금차량', desc: '재고금융을 안 쓰는 차입니다. 제시 대상에서 빠집니다.', officeOnly: false },
  { key: 'repay', label: '상환 예정', desc: '상환일자를 월별로 모아 봅니다. 그 달에 갚아야 하는 차량입니다.', officeOnly: false },
  {
    key: 'release',
    label: '출고 예정',
    desc: '상담에서 판매완료로 찍힌 차입니다. 넘기고 나서 매도일자를 적으면 매도 차량으로 넘어갑니다.',
    officeOnly: false,
  },
  { key: 'sold', label: '매도 차량', desc: '매도일자를 적은 차입니다. 끝난 차입니다.', officeOnly: false },
];

/**
 * 그 차가 이 보기에 뜨는가.
 *
 * 필터 안에 두면 "이 차가 지금 어느 보기에 있나"를 물어볼 수가 없다. 밖으로 빼서
 * 목록을 거를 때도, 검색한 차를 찾아줄 때도 같은 규칙을 쓴다 —
 * 두 벌로 두면 반드시 어긋난다.
 */
function inView(view: View, v: ManagedVehicle, opts: { month: string }): boolean {
  // 매도·출고 예정은 재고금융과 상관없이 가른다 — 현금차량도 팔린다.
  if (view === 'sold') return Boolean(v.soldDate);

  // 넘긴 차는 매도 차량에만 남는다. 제시 대상·제시함·재고차량·현금차량은
  // 앞으로 할 일을 모아 놓은 곳이라 이미 끝난 차가 섞이면 안 된다.
  //
  // 상환 예정만 예외다 — 팔았다고 재고금융이 저절로 갚아지는 게 아니라
  // 갚는 날까지 챙겨야 한다.
  if (v.soldDate && view !== 'repay') return false;

  if (view === 'release') return saleStage(v) === 'RELEASE_PENDING';
  if (view === 'cash') return v.cashVehicle;

  /*
   * 제시 대상에서는 아무것도 빼지 않는다.
   *
   * 10년을 넘겼든 주행거리가 많든 현금차량으로 찍혀 있든, 제시는 넣어봐야 아는 것이다.
   * 미리 걸러 두면 넣어볼 차가 목록에서 사라져 어디로 갔는지 알 수가 없다.
   * 제시할 수 있는 차인지는 '제시 가능' 칸에 이유까지 적어 두었으니 보고 판단한다.
   *
   * 빠지는 건 이미 진행된 차뿐이다 — 제시일자·이전일자를 다 적었으면 제시함으로 갔다.
   */
  if (view === 'candidate') return !(v.offerDate && v.transferDate);

  if (v.cashVehicle) return false;

  // 재고를 잡으면 제시함에서 빠지고 재고차량으로 넘어간다 — 그래야 제시함에
  // 아직 챙길 차만 남는다. 현금차량으로 빼는 것과 같은 방식이다.
  if (view === 'offered') return Boolean(v.offerDate && v.transferDate) && !isStocked(v);
  if (view === 'stocked') return isStocked(v);
  return v.repayDate?.startsWith(opts.month) ?? false;
}

/**
 * 재고가 잡혔는가.
 *
 * 할부사·재고금액·상환일자를 다 적어야 잡힌 것으로 본다. 하나라도 들어가면 넘기던 때가
 * 있었는데, 할부사를 치자마자 제시함에서 사라져 나머지를 적을 자리가 없어졌다.
 * 제시일자·이전일자를 다 적어야 제시함으로 넘기는 것과 같은 규칙이다.
 */
function isStocked(v: ManagedVehicle): boolean {
  return Boolean(v.stockCapital) && v.stockAmount > 0 && Boolean(v.repayDate);
}

/** 날짜 칸을 기간으로 거른다. 어느 날짜를 볼지는 보기마다 다르다. */
type DateField = 'offerDate' | 'transferDate' | 'repayDate' | 'soldDate' | 'intakeDate';

/** 보기마다 챙기는 날짜가 다르다. 제시 대상은 아직 제시를 안 한 차라 매입일로 본다. */
const DATE_FIELD: Partial<Record<View, { field: DateField; label: string }>> = {
  candidate: { field: 'intakeDate', label: '매입일자' },
  offered: { field: 'offerDate', label: '제시일자' },
  stocked: { field: 'transferDate', label: '이전일자' },
  release: { field: 'intakeDate', label: '매입일자' },
  sold: { field: 'soldDate', label: '매도일자' },
  cash: { field: 'intakeDate', label: '매입일자' },
};

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
  const { vehicles, toggleFlag, reload } = api;

  /*
    매입 정보를 여기서 바로 고친다.

    연식·주행거리가 비어 제시 가능 여부를 못 가리는 차가 있는데, 그 값은 매입 관리에
    이미 적혀 있거나 거기서 채워야 하는 값이다. 고치러 화면을 옮기면 돌아올 때 어느 차를
    보고 있었는지 잊는다 — 같은 자리에서 매입 창을 열어 고치고 바로 돌아온다.
  */
  const [intake, setIntake] = useState<PurchaseIntake | null>(null);
  const [intakeBusy, setIntakeBusy] = useState<string | null>(null);

  const openIntake = async (v: ManagedVehicle) => {
    const plate = v.vehicleNumber;
    setIntakeBusy(plate);
    try {
      const rows = await callApi<PurchaseIntake[]>(`/purchase-intake?q=${encodeURIComponent(plate)}`);
      // 같은 차를 되사온 건이 있을 수 있다 — 최근 것이 지금 들고 있는 차다
      const hit = rows.find(r => r.vehicleNumber.replace(/\s/g, '') === plate.replace(/\s/g, '')) ?? rows[0];

      /*
        매입 건이 없으면 새로 적는다.

        예전에 엑셀로 올라왔거나 매입을 거치지 않고 들어온 차가 있다. "없습니다" 하고
        돌려보내면 매입 관리로 옮겨 가 번호부터 다시 쳐야 한다 — 차는 눈앞에 있는데
        적을 자리만 없는 꼴이다. 아는 값은 채워서 띄운다.
      */
      setIntake(
        hit ?? ({
          id: '',
          date: dayjs().format('YYYY-MM-DD'),
          vehicleNumber: plate,
          vehicleName: v.vehicleModel,
          modelYear: v.modelYear,
          mileage: v.mileage,
          fuel: v.fuel,
          firstRegisteredOn: v.firstRegisteredOn,
          // 차에 적힌 값은 만원이고 매입 관리는 원이다
          purchaseAmount: (v.priceManwon ?? 0) * 10_000,
        } as PurchaseIntake),
      );
    } catch (e) {
      void alertError('매입 내역을 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setIntakeBusy(null);
    }
  };

  const { state } = useStore();

  /**
   * 매입가(만원).
   *
   * 매입 관리에 적은 금액이 원본이다 — 서버가 차량번호로 맞춰 붙여 내려준다.
   * 그게 없으면 매입 정산, 그것도 없으면 매입할 때 차에 복사해둔 값을 쓴다.
   */
  const purchasePriceOf = useMemo(() => {
    const settled = new Map<string, number>();
    for (const s of state.purchaseSettlements) {
      if (s.purchasePrice > 0) settled.set(s.vehicleNumber.replace(/\s+/g, ''), s.purchasePrice);
    }
    return (v: ManagedVehicle) => {
      const won = v.intakeAmount || settled.get(v.vehicleNumber.replace(/\s+/g, ''));
      if (won) return Math.round(won / 10000);
      return v.priceManwon || null;
    };
  }, [state.purchaseSettlements]);
  const views = useMemo(() => VIEWS.filter(v => isOfficeManager || !v.officeOnly), [isOfficeManager]);

  const [view, setView] = useState<View>(() => (isOfficeManager ? 'candidate' : 'repay'));
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const dateFilter = DATE_FIELD[view] ?? null;
  const dateField: DateField | null = dateFilter?.field ?? null;

  const rows = useMemo(() => {
    const q = query.trim();
    return vehicles
      .map(v => ({ vehicle: v, eligibility: offerEligibility(v) }))
      .filter(({ vehicle: v }) => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q))
      .filter(({ vehicle: v }) => inView(view, v, { month }))
      .filter(({ vehicle: v }) => {
        if (!dateField) return true;
        const value = v[dateField];
        if (from && (!value || value < from)) return false;
        if (to && (!value || value > to)) return false;
        return true;
      })
      .sort((a, b) => {
        if (view === 'sold') return (b.vehicle.soldDate ?? '').localeCompare(a.vehicle.soldDate ?? '');
        if (view === 'repay') return (a.vehicle.repayDate ?? '').localeCompare(b.vehicle.repayDate ?? '');
        // 바로 제시할 수 있는 차부터 올린다 — 그게 지금 할 일이다.
        // 다음이 등록증만 보면 갈리는 차, 맨 아래가 연식·주행거리를 아직 모르는 차다.
        if (view === 'candidate') {
          const rank = (ok: unknown) => (ok === true ? 0 : ok === 'check' ? 1 : 2);
          const gap = rank(a.eligibility.ok) - rank(b.eligibility.ok);
          if (gap !== 0) return gap;
        }
        return (b.vehicle.offerDate ?? '').localeCompare(a.vehicle.offerDate ?? '');
      });
  }, [vehicles, query, view, month, dateField, from, to]);

  /**
   * 검색한 차가 어느 보기에 있는지.
   *
   * 보기마다 목록이 갈려 있어서, 찾는 차가 지금 보고 있는 보기에 없으면 그냥 안 나온다.
   * 그 차가 어디로 갔는지 알려면 일곱 개를 하나씩 눌러봐야 했다.
   */
  const foundElsewhere = useMemo(() => {
    const q = query.trim();
    if (!q) return [];

    const hits = vehicles.filter(v => v.vehicleNumber.includes(q) || v.vehicleModel.includes(q));
    if (hits.length === 0) return [];

    return views
      .filter(other => other.key !== view)
      .map(other => ({
        view: other,
        cars: hits.filter(v => inView(other.key, v, { month })),
      }))
      .filter(r => r.cars.length > 0);
  }, [query, vehicles, views, view, month]);

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

  /**
   * 재고금액을 적으면 상환일자까지 채워 재고차량으로 넘긴다.
   *
   * 갚는 날은 할부사가 정해 놓은 규칙이라 사람이 셀 일이 아니다 — 우리금융이면
   * 다섯 달 뒤 8일 하는 식이다. 한 칸 적을 때마다 달력을 뒤지게 두지 않는다.
   *
   * 이미 적어둔 상환일자는 안 건드린다. 규칙과 다르게 잡은 건이 있을 수 있고,
   * 그건 사람이 알고 적은 값이다.
   * 모르는 할부사면 그냥 둔다 — 넘겨짚어 적어두면 그게 맞는 줄 알고 넘어간다.
   */
  const saveStockAmount = (v: ManagedVehicle, stockAmount: number) => {
    if (stockAmount === v.stockAmount) return;
    // 이전일자가 있으면 그날부터 센다. 없으면 오늘 잡은 것으로 본다.
    const repayDate =
      v.repayDate || !v.stockCapital || stockAmount <= 0
        ? null
        : suggestRepayDate(v.stockCapital, v.transferDate || dayjs());

    patch(v, { stockAmount, ...(repayDate ? { repayDate } : {}) });
  };

  const handleExport = () => {
    const data = rows.map(({ vehicle: v, eligibility }) => ({
      차량번호: v.vehicleNumber,
      차량명: v.vehicleModel,
      '매입가(만원)': purchasePriceOf(v) ?? '',
      '제시 가능':
        eligibility.ok === true
          ? '가능'
          : eligibility.ok === false
            ? `불가 (${eligibility.reason})`
            : eligibility.reason,
      제시일자: v.offerDate ?? '',
      이전일자: v.transferDate ?? '',
      매도일자: v.soldDate ?? '',
      판매상태: saleStage(v) ? SALE_STAGE_LABEL[saleStage(v)!] : '',
      할부사: v.stockCapital,
      '재고금액(원)': v.stockAmount || '',
      상환일자: v.repayDate ?? '',
      현금차량: v.cashVehicle ? 'O' : '',
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
            {dateFilter?.label}
            {/* 달로 보는 일이 제일 잦다 — 고르면 그 달 1일~말일로 채운다 */}
            <input
              type="month"
              value={from && to && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : ''}
              onChange={e => {
                const m = e.target.value;
                if (!m) {
                  setFrom('');
                  setTo('');
                  return;
                }
                setFrom(dayjs(m).startOf('month').format('YYYY-MM-DD'));
                setTo(dayjs(m).endOf('month').format('YYYY-MM-DD'));
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
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
                전체 기간
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

        {/* 달마다 쌓아온 장부를 손으로 백 대씩 옮겨 적게 두지 않는다 — 사무장만 부른다 */}
        {isOfficeManager && (
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Upload size={14} /> 장부 가져오기
          </button>
        )}
      </div>

      {/* 매입했는데 차량 관리에 안 올라간 차 — 그래서 제시 대상에 안 뜬다 */}
      {view === 'candidate' && <UnregisteredIntakePanel onRegistered={() => void reload()} />}

      {/* 알선처럼 우리가 안 사온 차는 차량 관리에 없다. 그래도 판 건 남아야 한다. */}
      {(view === 'release' || view === 'sold') && <UnregisteredSoldPanel onRegistered={() => void reload()} />}

      {/* 찾는 차가 다른 보기에 있으면 어디 있는지 알려주고 바로 넘어가게 한다 */}
      {foundElsewhere.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3.5 py-2.5">
          <Search size={14} className="text-indigo-700" />
          <span className="text-xs font-bold text-indigo-900">
            “{query.trim()}” 은(는) 다른 보기에 있습니다
          </span>
          {foundElsewhere.map(({ view: other, cars }) => (
            <button
              key={other.key}
              onClick={() => setView(other.key)}
              className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              title={cars.map(c => `${c.vehicleNumber} ${c.vehicleModel}`).join(', ')}
            >
              {other.label} {cars.length}대
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-3 font-medium">차량번호</th>
                <th className="px-3 py-3 font-medium">차량명</th>
                <th className="px-3 py-3 text-right font-medium">매입가</th>
                <th className="px-3 py-3 font-medium">제시일자</th>
                <th className="px-3 py-3 font-medium">이전일자</th>
                <th className="px-3 py-3 font-medium">매도일자</th>
                <th className="px-3 py-3 font-medium">할부사</th>
                <th className="px-3 py-3 text-right font-medium">재고금액</th>
                <th className="px-3 py-3 font-medium">상환일자</th>
                <th className="px-3 py-3 text-center font-medium">현금</th>
                <th className="px-3 py-3 font-medium">연식</th>
                <th className="px-3 py-3 text-right font-medium">주행거리</th>
                <th className="px-3 py-3 font-medium">제시 가능</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-5 py-10 text-center text-sm text-slate-400">
                    해당하는 차량이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map(({ vehicle: v, eligibility }) => {
                const stage = saleStage(v);
                return (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {/* 번호를 누르면 그 차 매입 창이 열린다 — 연식·주행거리를 거기서 채운다 */}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => void openIntake(v)}
                      disabled={intakeBusy === v.vehicleNumber}
                      title="눌러서 매입 정보를 고칩니다"
                      className="font-mono font-semibold text-slate-800 hover:text-indigo-600 disabled:opacity-50"
                    >
                      {v.vehicleNumber}
                    </button>
                  </td>
                  {/* 차명은 길어도 한 줄만 쓴다 — 넘치면 잘라내고 손대면 전체가 뜬다 */}
                  <td className="max-w-40 truncate px-3 py-2.5 text-slate-600" title={v.vehicleModel}>
                    {v.vehicleModel}
                    {/* 상환 예정·현금차량 목록에서도 팔린 차인지 바로 보이게 붙인다 */}
                    {stage && (
                      <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${SALE_STAGE_CLASS[stage]}`}>
                        {SALE_STAGE_LABEL[stage]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                    {purchasePriceOf(v) != null ? (
                      <>
                        {withCommas(String(purchasePriceOf(v)))}
                        <span className="ml-0.5 text-[11px] text-slate-400">만</span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">{dateInput(v.offerDate, next => patch(v, { offerDate: next }))}</td>
                  <td className="px-3 py-2.5">{dateInput(v.transferDate, next => patch(v, { transferDate: next }))}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {/* 매도일자를 적으면 매도 차량으로 넘어간다. 오늘 넘긴 차는 버튼 한 번으로 끝낸다. */}
                    {v.soldDate ? (
                      dateInput(v.soldDate, next => patch(v, { soldDate: next }))
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {dateInput(null, next => patch(v, { soldDate: next }))}
                        <button
                          onClick={() => patch(v, { soldDate: dayjs().format('YYYY-MM-DD') })}
                          className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-100"
                          title="오늘 날짜로 매도 처리합니다"
                        >
                          매도
                        </button>
                      </div>
                    )}
                  </td>

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
                      onBlur={e => saveStockAmount(v, Number(digitsOnly(e.target.value)) || 0)}
                      inputMode="numeric"
                      placeholder="원"
                      className="w-28 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-[13px] outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2.5">{dateInput(v.repayDate, next => patch(v, { repayDate: next }))}</td>

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

                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="capital-companies">
        {CAPITAL_COMPANIES.map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {importOpen && (
        <StockSheetImportModal onClose={() => setImportOpen(false)} onImported={() => void reload()} />
      )}

      {/*
        매입 창을 그대로 띄운다.

        같은 값을 적는 자리를 두 벌 만들면 한쪽만 고쳐진다 — 매입 관리가 쓰는 창을 그대로
        쓴다. 저장하면 차량 관리도 따라가므로 제시 가능 여부가 바로 다시 가려진다.
      */}
      {intake && (
        <PurchaseIntakeForm
          editing={intake}
          onSave={async input => {
            try {
              // id 가 없으면 매입 관리에 없던 차다 — 새로 등록한다
              if (intake.id) {
                await callApi(`/purchase-intake/${intake.id}`, { method: 'PATCH', body: input });
              } else {
                await callApi('/purchase-intake', { method: 'POST', body: input });
              }
              await reload();
              return null;
            } catch (e) {
              return e instanceof ApiError ? e.message : '저장하지 못했습니다.';
            }
          }}
          onClose={() => setIntake(null)}
        />
      )}
    </>
  );
}
