import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { CalendarRange, Download, List, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { CAPITAL_LIMIT_COLUMNS, type PurchaseListItem, type Role } from '../../types';
import PurchaseListForm from './PurchaseListForm';
import { usePurchaseList } from './usePurchaseList';

interface Props {
  role: Role;
}

const NUM = (n: number) => (n ? n.toLocaleString() : '');

/** 두 번째 시트지처럼 "09월 04일"로 보여준다. */
function monthDay(date: string | null): string {
  return date ? dayjs(date).format('MM월 DD일') : '';
}

export default function PurchaseListModule({ role }: Props) {
  const { state } = useStore();
  const [view, setView] = useState<'all' | 'month'>('all');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseListItem | null>(null);

  // 월별 화면일 때만 월을 넘긴다 — 안 넘기면 서버가 전체를 준다.
  const api = usePurchaseList(view === 'month' ? month : '', query);
  const isAdmin = role === 'ADMIN';

  const managerNames = useMemo(
    () => state.employees.filter(e => e.active).map(e => e.name),
    [state.employees],
  );

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: PurchaseListItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  const handleDelete = async (item: PurchaseListItem) => {
    if (!confirm(`${item.vehicleNumber} ${item.vehicleName} 항목을 지울까요?`)) return;
    const failed = await api.remove(item.id);
    if (failed) alert(failed);
  };

  const handleExport = () => {
    const rows = api.items.map(r => ({
      순번: r.seq,
      날짜: r.date ?? '',
      차량번호: r.vehicleNumber,
      차량명: r.vehicleName,
      담당자: r.managerName,
      제시가: r.askingPrice,
      년식: r.modelYear,
      주행거리: r.mileage,
      '재고 캐피탈': r.stockCapital ?? '',
      '재고 금액': r.stockAmount,
      ...Object.fromEntries(CAPITAL_LIMIT_COLUMNS.map(c => [`${c.label}(${c.quota})`, r[c.key]])),
      특이사항: r.note,
      대출일자: r.loanDate ?? '',
      '이율(%)': r.interestRate ?? '',
      상환일자: r.repayDate ?? '',
      대출상황: r.loanStatus,
      상환날짜: r.repaidDate ?? '',
      상환금액: r.repaymentAmount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const sheetName = view === 'month' ? `${month} 재고차량` : '매입리스트';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `매입리스트_${view === 'month' ? month : dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매입리스트</h1>
          <p className="mt-1 text-sm text-slate-500">
            매입한 차를 어느 캐피탈에서 얼마에 재고로 잡았고 언제 갚는지 관리합니다. 금액 단위는 <b>원</b>입니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> 엑셀
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 등록
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView('all')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <List size={14} /> 전체
          </button>
          <button
            onClick={() => setView('month')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <CalendarRange size={14} /> 월별 현황
          </button>
        </div>

        {view === 'month' && (
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        )}

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차량명·담당자 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />

        <span className="ml-auto text-xs text-slate-400">
          {api.loading ? '불러오는 중…' : `총 ${api.items.length}대`}
        </span>
      </div>

      {api.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{api.error}</p>}

      {view === 'month' && api.summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium text-slate-400">{dayjs(month).format('M월')} 재고 대수</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {api.summary.count}
              <span className="ml-1 text-sm font-medium text-slate-400">대</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium text-slate-400">{dayjs(month).format('M월')} 재고 상환금액</p>
            <p className="mt-1 text-2xl font-bold text-sky-600">
              {NUM(api.summary.repaymentTotal) || 0}
              <span className="ml-1 text-sm font-medium text-slate-400">원</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-xs font-medium text-slate-400">재고금액 합계</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {NUM(api.summary.stockTotal) || 0}
              <span className="ml-1 text-sm font-medium text-slate-400">원</span>
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          {view === 'all' ? (
            <table className="w-full whitespace-nowrap text-xs">
              <thead>
                {/* 시트지처럼 2단 헤더 — 재고와 재고가능금액이 각각 하위 칸을 갖는다 */}
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-medium" rowSpan={2}>순번</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>날짜</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>차량번호</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>차량명</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>담당자</th>
                  <th className="px-3 py-2 text-right font-medium" rowSpan={2}>제시가</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>년식</th>
                  <th className="px-3 py-2 text-right font-medium" rowSpan={2}>주행거리</th>
                  <th className="border-x border-slate-200 px-3 py-1.5 text-center font-semibold text-slate-600" colSpan={2}>재 고</th>
                  <th className="border-r border-slate-200 px-3 py-1.5 text-center font-semibold text-slate-600" colSpan={CAPITAL_LIMIT_COLUMNS.length}>재고가능금액</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>특이사항</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>대출일자</th>
                  <th className="px-3 py-2 text-right font-medium" rowSpan={2}>이율(%)</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>상환일자</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>대출상황</th>
                  <th className="bg-blue-100 px-3 py-2 font-semibold text-slate-700" rowSpan={2}>상환날짜</th>
                  <th className="px-3 py-2 text-right font-medium" rowSpan={2}>상환금액</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2} />
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
                  <th className="border-x border-slate-200 bg-yellow-50 px-3 py-1.5 font-medium">캐피탈</th>
                  <th className="border-r border-slate-200 bg-yellow-50 px-3 py-1.5 font-medium">금액</th>
                  {CAPITAL_LIMIT_COLUMNS.map(c => (
                    <th key={c.key} className={`border-r border-slate-200 px-2 py-1.5 text-center font-bold text-slate-700 ${c.head}`}>
                      {c.label}
                      <span className="ml-1 font-normal text-slate-500">{c.quota}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {api.items.length === 0 && (
                  <tr>
                    <td colSpan={20} className="px-5 py-10 text-center text-sm text-slate-400">
                      {api.loading ? '불러오는 중…' : '등록된 매입 건이 없습니다.'}
                    </td>
                  </tr>
                )}
                {api.items.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-500">{r.seq}</td>
                    <td className="px-3 py-2 text-slate-500">{r.date ?? ''}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{r.vehicleNumber}</td>
                    <td className="px-3 py-2 text-slate-700">{r.vehicleName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.managerName}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{NUM(r.askingPrice)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.modelYear}</td>
                    <td className="px-3 py-2 text-right italic text-slate-500">{NUM(r.mileage)}</td>
                    <td className="border-x border-slate-100 bg-yellow-50/60 px-3 py-2 text-center text-slate-700">{r.stockCapital ?? ''}</td>
                    <td className="border-r border-slate-100 bg-yellow-50/60 px-3 py-2 text-right font-semibold text-slate-800">{NUM(r.stockAmount)}</td>
                    {CAPITAL_LIMIT_COLUMNS.map(c => (
                      <td key={c.key} className="border-r border-slate-100 px-2 py-2 text-right text-slate-600">
                        {NUM(r[c.key])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-slate-500">{r.note}</td>
                    <td className="px-3 py-2 text-slate-600">{monthDay(r.loanDate)}</td>
                    <td className="bg-yellow-50/60 px-3 py-2 text-right text-slate-700">{r.interestRate ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{monthDay(r.repayDate)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.loanStatus}</td>
                    <td className="bg-blue-50 px-3 py-2 text-slate-600">{monthDay(r.repaidDate)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-sky-700">{NUM(r.repaymentAmount)}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100">
                          수정
                        </button>
                        {isAdmin && (
                          <button onClick={() => void handleDelete(r)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* 월별 현황 — 두 번째 시트지 컬럼만 추려서 본다 */
            <table className="w-full whitespace-nowrap text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">순번</th>
                  <th className="px-3 py-2 font-medium">담당자</th>
                  <th className="px-3 py-2 font-medium">차량번호</th>
                  <th className="px-3 py-2 font-medium">차량명</th>
                  <th className="px-3 py-2 font-medium">년식</th>
                  <th className="px-3 py-2 font-medium">대출일자</th>
                  <th className="px-3 py-2 text-right font-medium">제시가</th>
                  <th className="px-3 py-2 text-right font-medium">상환금액</th>
                  <th className="px-3 py-2 font-medium">상환일자</th>
                  <th className="px-3 py-2 font-medium">캐피탈</th>
                  <th className="px-3 py-2 font-medium">대출상황</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {api.items.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-5 py-10 text-center text-sm text-slate-400">
                      {api.loading ? '불러오는 중…' : `${dayjs(month).format('M월')}에 상환할 차량이 없습니다.`}
                    </td>
                  </tr>
                )}
                {api.items.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-400">{r.seq}</td>
                    <td className="px-3 py-2 text-slate-600">{r.managerName}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{r.vehicleNumber}</td>
                    <td className="px-3 py-2 text-slate-700">{r.vehicleName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.modelYear}</td>
                    <td className="px-3 py-2 text-slate-500">{r.loanDate ?? ''}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{NUM(r.askingPrice)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{NUM(r.repaymentAmount)}</td>
                    <td className="px-3 py-2 text-slate-600">{monthDay(r.repayDate)}</td>
                    <td className="bg-emerald-50/60 px-3 py-2 text-slate-700">{r.stockCapital ?? ''}</td>
                    <td className="px-3 py-2 text-slate-500">{r.loanStatus}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100">
                          수정
                        </button>
                        {isAdmin && (
                          <button onClick={() => void handleDelete(r)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {api.items.length > 0 && api.summary && (
                  <tr className="bg-sky-100 font-bold text-slate-800">
                    <td className="px-3 py-2.5" colSpan={7}>
                      {dayjs(month).format('M월')}재고 상환금액
                    </td>
                    <td className="px-3 py-2.5 text-right">{NUM(api.summary.repaymentTotal) || 0}</td>
                    <td className="px-3 py-2.5" colSpan={4} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {formOpen && (
        <PurchaseListForm
          editing={editing}
          managerNames={managerNames}
          onSave={input => (editing ? api.edit(editing.id, input) : api.add(input))}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
