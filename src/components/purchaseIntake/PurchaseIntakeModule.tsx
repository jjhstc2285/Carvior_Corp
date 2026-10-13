import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Car, CloudDownload, Download, FileSearch, Plus, Trash2 } from 'lucide-react';
import { BROKER_FEE_TYPE_LABEL, type PurchaseIntake } from '../../types';
import { CHECK_ITEMS, DAESAN_BULK_GOAL } from '../../lib/inspectionCheck';
import IntakeCheckBar from './IntakeCheckBar';
import PurchaseIntakeForm from './PurchaseIntakeForm';
import CarviorImportModal from './CarviorImportModal';
import StockAgePanel from './StockAgePanel';
import PrepSchedulePanel from './PrepSchedulePanel';
import { usePurchaseIntake } from './usePurchaseIntake';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { api as callApi, ApiError } from '../../lib/api';
import { halfYearRange, vatBalance, VAT_PERIOD_MONTHS } from '../../lib/vat';

const NUM = (n: number) => (n ? n.toLocaleString() : '');

export default function PurchaseIntakeModule() {
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  /** 달로 볼지, 반기로 볼지, 전부 볼지. 부가세는 반기로 맞춰봐서 그 칸을 따로 뒀다. */
  const [period, setPeriod] = useState<'month' | 'half' | 'all'>('month');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseIntake | null>(null);
  const [carviorOpen, setCarviorOpen] = useState(false);

  /*
    들고 있는 차만 볼지, 나간 차까지 볼지.

    매입 목록은 사 온 차가 그대로 쌓인다. 팔려 나간 차도 같은 줄에 남아 있어서, 몇 대를
    들고 있는지 세려면 눈으로 걸러야 했다 — 이백 대가 넘으면 그게 안 된다.
    들고 있는 차를 먼저 본다. 나간 차는 눌러서 본다.
  */
  const [stock, setStock] = useState<'stock' | 'sold' | 'all'>('stock');

  const half = useMemo(() => halfYearRange(month), [month]);
  const api = usePurchaseIntake(period === 'month' ? month : '', query, period === 'half' ? half : null);
  const periodLabel = period === 'month' ? dayjs(month).format('M월') : period === 'half' ? half.label : '전체';

  /**
   * 나간 차인가 — 판매가가 적혔으면 나간 것이다.
   *
   * 매입 정산에 차량판매가를 적으면 여기 따라 붙는다. 아직 안 적힌 차는 '들고 있는 차'로
   * 남는다 — 실제로는 팔렸는데 안 적힌 건이 섞일 수 있고, 그건 정산에서 채울 일이다.
   */
  const isSold = (r: PurchaseIntake) => (r.salePrice ?? 0) > 0;

  const soldAll = api.items.filter(isSold).length;
  const stockAll = api.items.length - soldAll;

  /** 아래 숫자와 목록은 모두 고른 쪽만 센다 — 카드와 목록이 다른 걸 세면 안 된다 */
  const items = useMemo(
    () => (stock === 'all' ? api.items : api.items.filter(r => (stock === 'sold' ? isSold(r) : !isSold(r)))),
    [api.items, stock],
  );

  const total = items.reduce((sum, r) => sum + r.totalAmount, 0);
  /*
    매입가와 구전을 갈라 본다.

    총 매입금액 하나만 띄우면 그 안에 구전이 얼마인지 알 수 없다. 구전은 차값이 아니라
    사람에게 주는 돈이고, 지급방식에 따라 원천징수까지 따라붙는다 — 한 덩어리로 묶어
    두면 얼마를 누구에게 줬는지 세어볼 자리가 없다.
  */
  const purchaseTotal = items.reduce((sum, r) => sum + r.purchaseAmount, 0);
  const brokerTotal = items.reduce((sum, r) => sum + r.brokerFee, 0);
  /** 구전을 준 건이 몇 대인가 — 안 준 건이 섞여 있어 대수로는 못 나눈다 */
  const brokerCount = items.filter(r => r.brokerFee > 0).length;
  // 매입만 봐서는 부가세가 안 나온다 — 그 차들이 얼마에 팔렸는지까지 맞춰봐야 한다.
  const saleTotal = items.reduce((sum, r) => sum + (r.salePrice ?? 0), 0);
  /*
    부가세는 차값만 놓고 맞춰본다.

    구전은 전 딜러에게 주는 수수료라 차를 사온 값이 아니다. 그걸 매입에 얹어 두면 실제보다
    더 못 판 것처럼 잡히고, 남은 기간에 더 팔아야 할 금액도 부풀어 보인다.
  */
  const vat = vatBalance(purchaseTotal, saleTotal);
  const soldCount = items.filter(r => (r.salePrice ?? 0) > 0).length;

  /*
    대산에 이번 달 몇 대를 맡겼는가.

    백 대를 채워야 제휴 단가를 받는다. 한 대에 판을 두 곳 했어도 그건 한 대다 —
    곳수로 세면 실제보다 빨리 채운 것처럼 보이고, 그 숫자를 믿고 있다가 못 받는다.
  */
  const daesanCars = items.filter(r => (r.prepVendor ?? '') === '대산' && (r.panelCount ?? 0) > 0).length;

  /*
    검차 리포트 주소를 카비어에서 받아 붙인다.

    리포트는 계약이 들어온 뒤에 붙기도 해서, 매입이 들어올 때는 비어 있는 건이 있다.
    눌러서 다시 맞춘다 — 차량번호로 짝지으므로 언제 들어온 건이든 채워진다.
  */
  const [reportBusy, setReportBusy] = useState(false);
  const syncReports = async () => {
    setReportBusy(true);
    try {
      const res = await callApi<{ updated: number; withReport: number }>('/purchase-intake/carvior/reports', {
        method: 'POST',
      });
      await alertSuccess(
        res.updated > 0 ? `${res.updated}건에 리포트를 붙였습니다` : '새로 붙일 리포트가 없습니다',
        `카비어에 리포트가 달린 계약은 ${res.withReport}건입니다.`,
      );
      await api.reload();
    } catch (e) {
      void alertError('리포트를 가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setReportBusy(false);
    }
  };

  const handleDelete = async (item: PurchaseIntake) => {
    if (!(await confirmDanger(`${item.vehicleNumber} ${item.customerName} 매입 내역을 지울까요?`, '차량 관리에 올라간 차는 그대로 남습니다.'))) return;
    const failed = await api.remove(item.id);
    if (failed) void alertError('삭제하지 못했습니다', failed);
  };

  const handleExport = () => {
    const rows = items.map(r => ({
      입고일: r.intakeOn ?? r.date,
      '매입일(검차)': r.date,
      고객이름: r.customerName,
      고객번호: r.customerPhone,
      매입처: r.source,
      '실차 확인자': r.inspector,
      차명: r.vehicleName,
      세부모델: r.detailModel,
      차량번호: r.vehicleNumber,
      연식: r.modelYear,
      최초등록일: r.firstRegisteredOn ?? '',
      연료: r.fuel,
      차키갯수: r.keyCount,
      주행거리: r.mileage,
      '실차 확인 주행거리': r.checkedMileage || '',
      '주행거리 차이': r.checkedMileage ? Math.abs(r.checkedMileage - r.mileage) : '',
      특이사항: r.note,
      '실매입금액(원)': r.purchaseAmount,
      '구전(원)': r.brokerFee,
      '구전 지급방식': BROKER_FEE_TYPE_LABEL[r.brokerFeeType],
      '총 매입금액(원)': r.totalAmount,
      '차량판매가(원)': r.salePrice || '',
      등록자: r.employee?.name ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매입관리');
    XLSX.writeFile(wb, `매입관리_${period === 'month' ? month : period === 'half' ? half.label : dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매입 관리</h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">
            차를 사올 때 확인한 내용을 등록합니다. 받은 양식을 그대로 붙여넣으면 칸이 채워지고,
            등록하면 <b>차량 관리</b>에 그 차가 올라갑니다.
            <br />
            카비어에서 성사된 계약은 <b>10분마다 자동으로 들어옵니다</b> — 지금 바로 받으려면 오른쪽 버튼을 누르세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => void syncReports()}
            disabled={reportBusy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="카비어에 올라온 성능점검 리포트 주소를 차량번호로 맞춰 붙입니다"
          >
            <FileSearch size={15} />
            <span className="hidden sm:inline">{reportBusy ? '가져오는 중…' : '검차 리포트 가져오기'}</span>
            <span className="sm:hidden">{reportBusy ? '…' : '리포트'}</span>
          </button>
          <button
            onClick={() => setCarviorOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="자동으로도 들어오지만, 지금 바로 받고 싶을 때 누릅니다"
          >
            <CloudDownload size={15} />
            <span className="hidden sm:inline">카비어 지금 가져오기</span>
            <span className="sm:hidden">카비어</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} />
            <span className="hidden sm:inline">엑셀</span>
          </button>
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 등록
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{periodLabel} 매입 대수</p>
          <p className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">
            {items.length}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 매입금액 (실매입 + 구전)</p>
          <p className="mt-1 text-xl font-bold text-indigo-600 sm:text-2xl">
            {NUM(total) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {/* 한 덩어리로 두면 그 안에 구전이 얼마인지 알 수 없다 */}
          <p className="text-[11px] text-slate-400">
            매입가 {NUM(purchaseTotal) || 0} · 구전 {NUM(brokerTotal) || 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">실매입금액 (차값)</p>
          <p className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">
            {NUM(purchaseTotal) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">구전 합계</p>
          <p className="mt-1 text-xl font-bold text-amber-600 sm:text-2xl">
            {NUM(brokerTotal) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {items.length}대 중 {brokerCount}대 지급
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 매도금액</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 sm:text-2xl">
            {NUM(saleTotal) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">{items.length}대 중 {soldCount}대 판매</p>
        </div>

        {/*
          차값만큼 매출이 잡혀야 의제매입세액 공제가 자리를 잡는다.
          못 판 만큼은 부가세로 남는다 — 값 안에 들어 있는 세금이라 10%가 아니라 10/110이다.

          구전은 빼고 본다. 전 딜러에게 주는 수수료라 차를 사온 값이 아니다 — 매입에 얹어
          두면 실제보다 더 못 판 것처럼 잡힌다.
        */}
        <div
          className={`rounded-2xl border px-4 py-3.5 ${
            vat.gap > 0 ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/40'
          }`}
        >
          <p className={`text-xs font-medium ${vat.gap > 0 ? 'text-red-700/80' : 'text-emerald-700/80'}`}>
            {vat.gap > 0 ? '못 판 만큼 걸린 부가세' : '차값만큼 팔았습니다'}
          </p>
          <p className={`mt-1 text-xl font-bold sm:text-2xl ${vat.gap > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {NUM(vat.vat) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {vat.gap > 0
              ? `차값 − 매도 = ${NUM(vat.gap)}원 · 이만큼 더 팔아야 합니다 (구전 제외)`
              : `매도가 차값보다 ${NUM(-vat.gap) || 0}원 많습니다 (구전 제외)`}
          </p>
        </div>
      </div>

      {/* 대산 제휴 단가는 달마다 새로 센다 — 달이 바뀌면 처음부터다 */}
      {period === 'month' && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 ${
            daesanCars >= DAESAN_BULK_GOAL ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/40'
          }`}
        >
          <span className="text-xs font-bold text-slate-600">대산 판금 {dayjs(month).format('M월')}</span>
          <span className="text-lg font-bold text-slate-800">
            {daesanCars}
            <span className="ml-0.5 text-xs font-medium text-slate-400">/ {DAESAN_BULK_GOAL}대</span>
          </span>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-white">
            <div
              className={`h-full rounded-full ${daesanCars >= DAESAN_BULK_GOAL ? 'bg-emerald-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, (daesanCars / DAESAN_BULK_GOAL) * 100)}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${daesanCars >= DAESAN_BULK_GOAL ? 'text-emerald-700' : 'text-amber-700'}`}>
            {daesanCars >= DAESAN_BULK_GOAL
              ? '채웠습니다 — 제휴 단가가 걸립니다'
              : `${DAESAN_BULK_GOAL - daesanCars}대 남았습니다`}
          </span>
          <span className="ml-auto text-[11px] text-slate-400">
            채우면 국산 7만 · 수입 12만 — 한 대에 판을 몇 곳 했든 <b>한 대</b>로 셉니다
          </span>
        </div>
      )}

      <p className="mb-4 hidden text-[11px] leading-relaxed text-slate-400 sm:block">
        중고차는 매입할 때 낸 세금을 의제매입세액으로 공제받는데, 그 차를 팔아 매출이 잡혀야
        자리를 잡습니다. {VAT_PERIOD_MONTHS}개월(반기) 동안 매입만큼 매출이 안 나오면 그 차이만큼
        부가세가 남습니다. 값 안에 세금이 들어 있어 <b>10/110</b>으로 뽑습니다 — 1억이면 909만원입니다.
        신고서가 아니라 얼마나 벌어져 있는지 보는 눈대중입니다.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={month}
          disabled={period === 'all'}
          title="조합 전산에 제시를 잡은 날(입고일)로 셉니다 · 반기로 볼 때는 이 달이 속한 반기를 봅니다"
          onChange={e => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
        />
        {/* 부가세는 반기로 맞춰본다 — 달 하나만 봐서는 벌어진 정도를 알 수 없다 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {([
            ['month', '월'],
            ['half', '반기'],
            ['all', '전체'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                period === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {period === 'half' && <span className="text-xs font-medium text-slate-500">{half.label}</span>}

        {/* 들고 있는 차가 먼저다 — 나간 차는 눌러서 본다 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {([
            ['stock', '재고', stockAll],
            ['sold', '출고', soldAll],
            ['all', '전체', api.items.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setStock(key)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                stock === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label} <span className="font-bold">{count}</span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="고객이름·차량번호·차명·세부모델·매입처 검색"
          className="w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <span className="ml-auto text-xs text-slate-400">{api.loading ? '불러오는 중…' : `총 ${items.length}건`}</span>
      </div>

      {api.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{api.error}</p>}

      {/*
        장기 재고 — 들어온 지 오래된 차. 목록 바로 위에 둔다.
        오래된 차가 새 차 사이에 섞여 있으면 눈에 안 띈다.
      */}
      {/*
        상품화 진행 — 들어온 차를 나흘 안에 광고까지 올린다.
        장기 재고보다 먼저 둔다. 오래 묵은 차를 줄이는 길이 결국 빨리 올리는 것이다.
      */}
      <PrepSchedulePanel />

      <StockAgePanel />

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400">
            {api.loading ? '불러오는 중…' : '등록된 매입 내역이 없습니다.'}
          </div>
        )}

        {items.map(r => (
          <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-white">
                    {r.vehicleNumber}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{r.vehicleName}</span>
                  {r.detailModel && <span className="text-xs text-slate-500">{r.detailModel}</span>}
                  {/* 차량 관리에 안 올라가면 재고금융 제시 대상에 안 뜬다 — 여기서 바로 보이게 한다 */}
                  {r.registered === false ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
                      title="재고금융 제시 대상에 안 뜹니다. 제시 대상 화면 위쪽에서 올릴 수 있습니다"
                    >
                      <Car size={11} /> 차량관리 미등록
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <Car size={11} /> 차량관리 등록
                    </span>
                  )}
                  {/* 실차를 보고 손봤는가 — 상품화된 차라야 상담을 걸 수 있다 */}
                  {r.prepared && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      상품화
                    </span>
                  )}
                  {/*
                    연식·주행거리가 비면 제시 가능 여부를 못 가린다.

                    카비어에서 들어온 건은 이 둘이 비어 있는 채로 온다 — 제시 관리에서
                    "주행거리를 모릅니다"로 뜨는 차가 그것이다. 여기서 먼저 보이게 해서
                    매입 줄을 열어 바로 채우게 한다.
                  */}
                  {(!r.modelYear || !r.mileage) && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
                      title="제시 가능 여부(10년 이내·20만km 미만)를 가릴 수 없습니다. 줄을 열어 채워 주세요"
                    >
                      {!r.modelYear && !r.mileage ? '연식·주행거리 없음' : !r.modelYear ? '연식 없음' : '주행거리 없음'}
                    </span>
                  )}
                  {/* 카비어가 달아 준 성능점검 결과 — 여기서 바로 연다 */}
                  {r.reportUrl && (
                    <a
                      href={r.reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      <FileSearch size={11} /> 검차 리포트
                    </a>
                  )}
                  {/* 검차를 어디까지 했는지 — 판·덴트는 그대로 돈이라 같이 띄운다 */}
                  {(() => {
                    const done = (r.checkedItems ?? '').split(',').filter(Boolean).length;
                    const parts = [
                      done > 0 ? `검차 ${done}/${CHECK_ITEMS.length}` : '',
                      (r.panelCount ?? 0) > 0 ? `판 ${r.panelCount}` : '',
                      (r.dentCount ?? 0) > 0 ? `덴트 ${r.dentCount}` : '',
                    ].filter(Boolean);
                    return parts.length > 0 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {parts.join(' · ')}
                      </span>
                    ) : null;
                  })()}
                </div>
                {/*
                  입고일은 조합 전산에 제시를 잡은 날이다 — 달을 세는 기준이 그것이다.
                  검차한 날과 다르면 둘 다 보여준다. 어느 쪽으로 세는지 모르면 숫자를 못 믿는다.
                */}
                <p className="mt-1 text-xs text-slate-400">
                  입고 {r.intakeOn ?? r.date}
                  {r.intakeOn && r.intakeOn !== r.date && (
                    <span className="ml-1 text-slate-300">(검차 {r.date})</span>
                  )}
                  {' · 등록자 '}
                  {r.employee?.name ?? '-'}
                  {r.source && ` · ${r.source}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <p className="text-[11px] text-slate-400">총 매입금액</p>
                  <p className="text-base font-bold text-indigo-600">{NUM(r.totalAmount) || 0}<span className="ml-0.5 text-xs font-medium text-slate-400">원</span></p>
                </div>
                <button
                  onClick={() => { setEditing(r); setFormOpen(true); }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  수정
                </button>
                {/* 잘못 적은 건은 적은 사람이 바로 지운다. 지우기 전에 한 번 묻는다. */}
                <button onClick={() => void handleDelete(r)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* 차 앞에 서서 누르는 자리 — 창을 열고 들어가게 두면 현장에서 안 쓴다 */}
            <IntakeCheckBar item={r} onPatch={patch => api.edit(r.id, patch)} />

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
              <div><dt className="text-slate-400">고객</dt><dd className="text-slate-700">{[r.customerName, r.customerPhone].filter(Boolean).join(' · ')}</dd></div>
              <div><dt className="text-slate-400">실차 확인자</dt><dd className="text-slate-700">{r.inspector || '-'}</dd></div>
              <div><dt className="text-slate-400">연식 · 연료</dt><dd className="text-slate-700">{[r.modelYear && `${r.modelYear}년식`, r.fuel].filter(Boolean).join(' · ') || '-'}</dd></div>
              <div><dt className="text-slate-400">최초등록일</dt><dd className="text-slate-700">{r.firstRegisteredOn ?? '-'}</dd></div>
              <div>
                <dt className="text-slate-400">주행거리</dt>
                <dd className="text-slate-700">
                  {NUM(r.mileage) ? `${NUM(r.mileage)}km` : '-'}
                  {/* 실차 확인 값이 크게 벌어졌으면 목록에서도 바로 보여야 한다 */}
                  {r.checkedMileage > 0 && (
                    <span className={Math.abs(r.checkedMileage - r.mileage) >= 1000 ? 'ml-1 font-bold text-amber-700' : 'ml-1 text-slate-400'}>
                      (확인 {NUM(r.checkedMileage)}km)
                    </span>
                  )}
                </dd>
              </div>
              <div><dt className="text-slate-400">차키갯수</dt><dd className="text-slate-700">{r.keyCount ? `${r.keyCount}개` : '-'}</dd></div>
              <div><dt className="text-slate-400">실매입금액</dt><dd className="text-slate-700">{NUM(r.purchaseAmount) || 0}원</dd></div>
              <div>
                <dt className="text-slate-400">구전</dt>
                <dd className="text-slate-700">
                  {NUM(r.brokerFee) || 0}원
                  <span className="ml-1 text-slate-400">{BROKER_FEE_TYPE_LABEL[r.brokerFeeType]}</span>
                </dd>
              </div>
              <div className="col-span-2 sm:col-span-4"><dt className="text-slate-400">특이사항</dt><dd className="text-slate-700">{r.note || '-'}</dd></div>
            </dl>
          </div>
        ))}
      </div>

      {formOpen && (
        <PurchaseIntakeForm
          editing={editing}
          onSave={input => (editing ? api.edit(editing.id, input) : api.add(input))}
          onClose={() => setFormOpen(false)}
        />
      )}

      {carviorOpen && (
        <CarviorImportModal onClose={() => setCarviorOpen(false)} onImported={() => void api.reload()} />
      )}
    </div>
  );
}
