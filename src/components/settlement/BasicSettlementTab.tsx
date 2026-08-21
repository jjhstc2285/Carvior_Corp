import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { netProfit, SETTLEMENT_STATUS_LABEL, type SettlementRecord, type SettlementStatus } from '../../types';
import SettlementForm from './SettlementForm';

interface Props {
  role: 'employee' | 'admin';
}

export default function BasicSettlementTab({ role }: Props) {
  const { state, deleteSettlement } = useStore();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SettlementRecord | null>(null);

  const scoped = role === 'employee'
    ? state.settlements.filter(s => s.employeeId === state.currentEmployeeId)
    : state.settlements;

  const filtered = scoped
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => role !== 'admin' || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const totals = useMemo(() => {
    const totalProfit = filtered.reduce((sum, s) => sum + netProfit(s), 0);
    const completed = filtered.filter(s => s.status === 'completed').length;
    const inProgress = filtered.filter(s => s.status === 'inProgress').length;
    return { totalProfit, completed, inProgress, count: filtered.length };
  }, [filtered]);

  const handleExport = () => {
    const rows = filtered.map(s => ({
      정산기준일: s.date,
      담당자: employeeOf(s.employeeId)?.name ?? '',
      차량정보: s.vehicleInfo,
      매입가: s.purchaseCost,
      상품화비용: s.prepCost,
      판매금액: s.saleAmount,
      수수료: s.feeAmount,
      순이익: netProfit(s),
      상태: SETTLEMENT_STATUS_LABEL[s.status],
      메모: s.memo,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '정산내역');
    XLSX.writeFile(wb, `정산내역_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 건수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.count}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 순이익</p>
          <p className={`mt-1 text-2xl font-bold ${totals.totalProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{totals.totalProfit.toLocaleString()}<span className="ml-1 text-sm font-medium text-slate-400">만원</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">정산완료</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{totals.completed}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">진행중</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{totals.inProgress}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          {role === 'admin' && (
            <button onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus size={14} /> 정산 추가
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">기준일</th>
                <th className="px-5 py-2.5 font-medium">담당자</th>
                <th className="px-5 py-2.5 font-medium">차량정보</th>
                <th className="px-5 py-2.5 font-medium text-right">매입가</th>
                <th className="px-5 py-2.5 font-medium text-right">판매금액</th>
                <th className="px-5 py-2.5 font-medium text-right">순이익</th>
                <th className="px-5 py-2.5 font-medium">상태</th>
                {role === 'admin' && <th className="px-5 py-2.5 font-medium text-right">관리</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={role === 'admin' ? 8 : 7} className="px-5 py-10 text-center text-sm text-slate-400">정산 내역이 없습니다.</td></tr>
              )}
              {filtered.map(s => {
                const profit = netProfit(s);
                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-2.5 text-slate-600">{dayjs(s.date).format('M/D')}</td>
                    <td className="px-5 py-2.5 text-slate-600">{employeeOf(s.employeeId)?.name}</td>
                    <td className="px-5 py-2.5 text-slate-700">{s.vehicleInfo}</td>
                    <td className="px-5 py-2.5 text-right text-slate-500">{s.purchaseCost.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-slate-500">{s.saleAmount.toLocaleString()}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${profit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{profit.toLocaleString()}</td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    {role === 'admin' && (
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => { setEditing(s); setFormOpen(true); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => { if (confirm('삭제할까요?')) deleteSettlement(s.id); }} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <SettlementForm editing={editing} defaultEmployeeId={state.currentEmployeeId} onClose={() => setFormOpen(false)} />
      )}
    </>
  );
}
