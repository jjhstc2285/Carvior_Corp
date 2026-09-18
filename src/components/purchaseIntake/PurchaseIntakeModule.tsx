import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Car, CloudDownload, Download, Plus, Trash2 } from 'lucide-react';
import { BROKER_FEE_TYPE_LABEL, type PurchaseIntake } from '../../types';
import PurchaseIntakeForm from './PurchaseIntakeForm';
import CarviorImportModal from './CarviorImportModal';
import { usePurchaseIntake } from './usePurchaseIntake';
import { alertError, confirmDanger } from '../../lib/alert';
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

  const half = useMemo(() => halfYearRange(month), [month]);
  const api = usePurchaseIntake(period === 'month' ? month : '', query, period === 'half' ? half : null);
  const periodLabel = period === 'month' ? dayjs(month).format('M월') : period === 'half' ? half.label : '전체';

  const total = api.items.reduce((sum, r) => sum + r.totalAmount, 0);
  // 매입만 봐서는 부가세가 안 나온다 — 그 차들이 얼마에 팔렸는지까지 맞춰봐야 한다.
  const saleTotal = api.items.reduce((sum, r) => sum + (r.salePrice ?? 0), 0);
  const vat = vatBalance(total, saleTotal);
  const soldCount = api.items.filter(r => (r.salePrice ?? 0) > 0).length;

  const handleDelete = async (item: PurchaseIntake) => {
    if (!(await confirmDanger(`${item.vehicleNumber} ${item.customerName} 매입 내역을 지울까요?`, '차량 관리에 올라간 차는 그대로 남습니다.'))) return;
    const failed = await api.remove(item.id);
    if (failed) void alertError('삭제하지 못했습니다', failed);
  };

  const handleExport = () => {
    const rows = api.items.map(r => ({
      날짜: r.date,
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
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매입 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            차를 사올 때 확인한 내용을 등록합니다. 받은 양식을 그대로 붙여넣으면 칸이 채워지고,
            등록하면 <b>차량 관리</b>에 그 차가 올라갑니다.
            <br />
            카비어에서 성사된 계약은 <b>10분마다 자동으로 들어옵니다</b> — 지금 바로 받으려면 오른쪽 버튼을 누르세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setCarviorOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="자동으로도 들어오지만, 지금 바로 받고 싶을 때 누릅니다"
          >
            <CloudDownload size={15} /> 카비어 지금 가져오기
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> 엑셀
          </button>
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 매입 등록
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{periodLabel} 매입 대수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {api.items.length}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 매입금액 (실매입 + 구전)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {NUM(total) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 매도금액</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {NUM(saleTotal) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">{api.items.length}대 중 {soldCount}대 판매</p>
        </div>

        {/*
          매입만큼 매출이 잡혀야 의제매입세액 공제가 자리를 잡는다.
          못 판 만큼은 부가세로 남는다 — 값 안에 들어 있는 세금이라 10%가 아니라 10/110이다.
        */}
        <div
          className={`rounded-2xl border px-4 py-3.5 ${
            vat.gap > 0 ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/40'
          }`}
        >
          <p className={`text-xs font-medium ${vat.gap > 0 ? 'text-red-700/80' : 'text-emerald-700/80'}`}>
            {vat.gap > 0 ? '못 판 만큼 걸린 부가세' : '매입만큼 팔았습니다'}
          </p>
          <p className={`mt-1 text-2xl font-bold ${vat.gap > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {NUM(vat.vat) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {vat.gap > 0
              ? `매입 − 매도 = ${NUM(vat.gap)}원 · 이만큼 더 팔아야 합니다`
              : `매도가 매입보다 ${NUM(-vat.gap) || 0}원 많습니다`}
          </p>
        </div>
      </div>

      <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
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
          title="반기로 볼 때는 이 달이 속한 반기를 봅니다"
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
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="고객이름·차량번호·차명·세부모델·매입처 검색"
          className="w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <span className="ml-auto text-xs text-slate-400">{api.loading ? '불러오는 중…' : `총 ${api.items.length}건`}</span>
      </div>

      {api.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{api.error}</p>}

      <div className="space-y-3">
        {api.items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400">
            {api.loading ? '불러오는 중…' : '등록된 매입 내역이 없습니다.'}
          </div>
        )}

        {api.items.map(r => (
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
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {r.date} · 등록자 {r.employee?.name ?? '-'}
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
