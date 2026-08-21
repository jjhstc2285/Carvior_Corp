import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { brokerageProfit, brokerageSaleProfit, SETTLEMENT_STATUS_LABEL, type BrokerageSettlement, type SettlementStatus } from '../../types';
import BrokerageSettlementForm from './BrokerageSettlementForm';

interface Props {
  role: 'employee' | 'admin';
}

// 시트지 컬럼 순서 그대로 — 표/엑셀 양쪽에서 같은 순서를 쓴다
const NUM = (n: number) => n.toLocaleString();

export default function BrokerageSettlementTab({ role }: Props) {
  const { state, deleteBrokerageSettlement } = useStore();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrokerageSettlement | null>(null);

  const scoped = role === 'employee'
    ? state.brokerageSettlements.filter(s => s.employeeId === state.currentEmployeeId)
    : state.brokerageSettlements;

  const filtered = scoped
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => role !== 'admin' || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .filter(s => !query.trim() || s.vehicleNumber.includes(query.trim()) || s.vehicleName.includes(query.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const totals = useMemo(() => ({
    count: filtered.length,
    saleProfit: filtered.reduce((sum, s) => sum + brokerageSaleProfit(s), 0),
    settlement: filtered.reduce((sum, s) => sum + s.settlementAmount, 0),
    inProgress: filtered.filter(s => s.status === 'inProgress').length,
  }), [filtered]);

  const handleExport = () => {
    const rows = filtered.map(s => ({
      일자: s.date,
      차량번호: s.vehicleNumber,
      차량명: s.vehicleName,
      '총 진행 판매금액': s.totalSaleAmount,
      실차주입금: s.ownerDeposit,
      수익금: brokerageProfit(s),
      이전비: s.transferFee,
      '이전비 잔액': s.transferFeeBalance,
      '현금 수수료': s.cashCommission,
      '할부 피': s.installmentFee,
      '보험 피': s.insuranceFee,
      기타비용: s.etcCost,
      '판매 수익': brokerageSaleProfit(s),
      정산받을금액: s.settlementAmount,
      담당자: employeeOf(s.employeeId)?.name ?? '',
      상태: SETTLEMENT_STATUS_LABEL[s.status],
      메모: s.memo,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '알선정산');
    XLSX.writeFile(wb, `알선정산_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 건수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.count}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">판매 수익 합계</p>
          <p className={`mt-1 text-2xl font-bold ${totals.saleProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{NUM(totals.saleProfit)}<span className="ml-1 text-sm font-medium text-slate-400">만원</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">정산받을금액 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{NUM(totals.settlement)}<span className="ml-1 text-sm font-medium text-slate-400">만원</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">진행중</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{totals.inProgress}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="차량번호·차량명 검색"
          className="w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SettlementStatus | 'all')}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">전체 상태</option>
          <option value="inProgress">진행중</option>
          <option value="completed">정산완료</option>
        </select>
        {role === 'admin' && (
          <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
            <option value="all">전체 담당자</option>
            {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={14} /> 알선 정산 추가
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">일자</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">차량번호</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">차량명</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">총 진행 판매금액</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">실차주입금</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">수익금</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">이전비</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">이전비 잔액</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">현금 수수료</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">할부 피</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">보험 피</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">기타비용</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">판매 수익</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">정산받을금액</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">담당자</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">상태</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={17} className="px-5 py-10 text-center text-sm text-slate-400">알선 정산 내역이 없습니다.</td></tr>
              )}
              {filtered.map(s => {
                const profit = brokerageProfit(s);
                const saleProfit = brokerageSaleProfit(s);
                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dayjs(s.date).format('M/D')}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-600">{s.vehicleNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{s.vehicleName}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{NUM(s.totalSaleAmount)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.ownerDeposit)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${profit >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{NUM(profit)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.transferFee)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.transferFeeBalance)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.cashCommission)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.installmentFee)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.insuranceFee)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.etcCost)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${saleProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{NUM(saleProfit)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{NUM(s.settlementAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{employeeOf(s.employeeId)?.name}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex whitespace-nowrap items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(s); setFormOpen(true); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => { if (confirm('삭제할까요?')) deleteBrokerageSettlement(s.id); }} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <BrokerageSettlementForm editing={editing} defaultEmployeeId={state.currentEmployeeId} onClose={() => setFormOpen(false)} />
      )}
    </>
  );
}
