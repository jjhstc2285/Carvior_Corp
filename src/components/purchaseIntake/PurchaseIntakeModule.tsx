import { useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Car, CloudDownload, Download, Plus, Trash2 } from 'lucide-react';
import type { PurchaseIntake, Role } from '../../types';
import PurchaseIntakeForm from './PurchaseIntakeForm';
import CarviorImportModal from './CarviorImportModal';
import { usePurchaseIntake } from './usePurchaseIntake';
import { alertError, confirmDanger } from '../../lib/alert';

interface Props {
  role: Role;
}

const NUM = (n: number) => (n ? n.toLocaleString() : '');

export default function PurchaseIntakeModule({ role }: Props) {
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [allMonths, setAllMonths] = useState(false);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseIntake | null>(null);
  const [carviorOpen, setCarviorOpen] = useState(false);

  const api = usePurchaseIntake(allMonths ? '' : month, query);
  const isAdmin = role === 'ADMIN';

  const total = api.items.reduce((sum, r) => sum + r.totalAmount, 0);

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
      차량번호: r.vehicleNumber,
      연식: r.modelYear,
      연료: r.fuel,
      차키갯수: r.keyCount,
      주행거리: r.mileage,
      특이사항: r.note,
      '실매입금액(원)': r.purchaseAmount,
      '구전(원)': r.brokerFee,
      '총 매입금액(원)': r.totalAmount,
      등록자: r.employee?.name ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매입관리');
    XLSX.writeFile(wb, `매입관리_${allMonths ? dayjs().format('YYYYMMDD') : month}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매입 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            차를 사올 때 확인한 내용을 등록합니다. 받은 양식을 그대로 붙여넣으면 칸이 채워지고,
            등록하면 <b>차량 관리</b>에 그 차가 올라갑니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setCarviorOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="카비오에서 성사된 계약을 매입 내역으로 한 번에 가져옵니다"
          >
            <CloudDownload size={15} /> 카비오 일괄 등록
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{allMonths ? '전체' : dayjs(month).format('M월')} 매입 대수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {api.items.length}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:col-span-2">
          <p className="text-xs font-medium text-slate-400">총 매입금액 (실매입 + 구전)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {NUM(total) || 0}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={month}
          disabled={allMonths}
          onChange={e => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <input type="checkbox" checked={allMonths} onChange={e => setAllMonths(e.target.checked)} className="rounded" />
          전체 기간
        </label>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="고객이름·차량번호·차명·매입처 검색"
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <Car size={11} /> 차량관리 등록
                  </span>
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
                {isAdmin && (
                  <button onClick={() => void handleDelete(r)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
              <div><dt className="text-slate-400">고객</dt><dd className="text-slate-700">{r.customerName} · {r.customerPhone}</dd></div>
              <div><dt className="text-slate-400">실차 확인자</dt><dd className="text-slate-700">{r.inspector || '-'}</dd></div>
              <div><dt className="text-slate-400">연식 · 연료</dt><dd className="text-slate-700">{[r.modelYear && `${r.modelYear}년식`, r.fuel].filter(Boolean).join(' · ') || '-'}</dd></div>
              <div><dt className="text-slate-400">주행거리</dt><dd className="text-slate-700">{NUM(r.mileage) ? `${NUM(r.mileage)}km` : '-'}</dd></div>
              <div><dt className="text-slate-400">차키갯수</dt><dd className="text-slate-700">{r.keyCount ? `${r.keyCount}개` : '-'}</dd></div>
              <div><dt className="text-slate-400">실매입금액</dt><dd className="text-slate-700">{NUM(r.purchaseAmount) || 0}원</dd></div>
              <div><dt className="text-slate-400">구전</dt><dd className="text-slate-700">{NUM(r.brokerFee) || 0}원</dd></div>
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
