import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { brokerageProfit, SETTLEMENT_STATUS_LABEL, type BrokerageSettlement, type SettlementStatus } from '../../types';
import BrokerageSettlementForm from './BrokerageSettlementForm';
import PendingSettlementVehicles from './PendingSettlementVehicles';
import { alertError, confirmDanger } from '../../lib/alert';
import { api, ApiError } from '../../lib/api';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

// 시트지 컬럼 순서 그대로 — 표/엑셀 양쪽에서 같은 순서를 쓴다
const NUM = (n: number) => n.toLocaleString();

export default function BrokerageSettlementTab({ role }: Props) {
  const { state, deleteBrokerageSettlement, refresh } = useStore();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrokerageSettlement | null>(null);
  const [preset, setPreset] = useState<{ vehicleNumber: string; vehicleName: string; totalSaleAmount: number; employeeId: string } | undefined>();

  /**
   * 알선 정산은 본인 것만 본다 — 계약팀도 마찬가지다.
   *
   * 알선은 받아온 사람이 곧 정산받을 사람이라 남의 몫이 보일 이유가 없다.
   * 매입 정산과 달리 남이 채워줄 빈칸도 없다.
   */
  const seesAll = role !== 'EMPLOYEE';

  /**
   * 현금 수수료를 받았는지는 대표만 찍는다.
   *
   * 받은 사람이 스스로 '받았다'고 찍으면 확인하는 뜻이 없다.
   * 이름으로 가린다 — 서버(settlements/approvers.ts)와 같은 기준이고, 서버가 다시 본다.
   */
  const me = state.employees.find(e => e.id === state.currentEmployeeId) ?? null;
  // 대표가 자리를 비웠을 때 흐름이 멈추면 안 돼서 테스트 계정도 찍을 수 있다.
  const isCeo = me?.name === '유진욱' || (me?.position ?? '').includes('테스트');
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleCash = async (s: BrokerageSettlement) => {
    setBusyId(s.id);
    try {
      await api(`/settlements/brokerage/${s.id}/cash-confirm`, {
        method: 'POST',
        body: { confirmed: !s.cashConfirmedAt },
      });
      await refresh();
    } catch (e) {
      void alertError('바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };
  const scoped = seesAll
    ? state.brokerageSettlements
    : state.brokerageSettlements.filter(s => s.employeeId === state.currentEmployeeId);

  const filtered = scoped
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => !seesAll || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .filter(s => !query.trim() || s.vehicleNumber.includes(query.trim()) || s.vehicleName.includes(query.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const totals = useMemo(() => ({
    count: filtered.length,

    profit: filtered.reduce((sum, s) => sum + brokerageProfit(s), 0),
    settlement: filtered.reduce((sum, s) => sum + s.settlementAmount, 0),
    inProgress: filtered.filter(s => s.status === 'IN_PROGRESS').length,
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
      '현금 확인': s.cashConfirmedAt ? '확인' : '미확인',
      '확인 시점': s.cashConfirmedAt ? dayjs(s.cashConfirmedAt).format('YYYY-MM-DD HH:mm') : '',
      '할부 피': s.installmentFee,
      '보험 피': s.insuranceFee,
      차대금업: s.etcCost,

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
      <PendingSettlementVehicles
        onStart={c => {
          setEditing(null);
          setPreset({
            vehicleNumber: c.vehicleNumber,
            vehicleName: c.vehicleName,
            // 출고 때 적어둔 입금액을 판매금액으로 먼저 채운다 — 다르면 폼에서 고친다.
            totalSaleAmount: c.depositAmount,
            employeeId: c.employeeId,
          });
          setFormOpen(true);
        }}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">총 건수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.count}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">수익금 합계</p>
          <p className={`mt-1 text-2xl font-bold ${totals.profit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{NUM(totals.profit)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">정산받을금액 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{NUM(totals.settlement)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
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
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">정산완료</option>
        </select>
        {/* 남의 것까지 보는 사람에게만 쓸모가 있다 — 자기 것만 보이면 고를 게 없다 */}
        {seesAll && (
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
          <button onClick={() => { setEditing(null); setPreset(undefined); setFormOpen(true); }}
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
                <th
                  className="whitespace-nowrap px-3 py-2.5 text-center font-medium"
                  title="대표가 현금 수수료를 실제로 받았는지 — 눌러서 바꿉니다"
                >
                  현금 확인
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">할부 피</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">보험 피</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">차대금업</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">정산받을금액</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">담당자</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">상태</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={18} className="px-5 py-10 text-center text-sm text-slate-400">알선 정산 내역이 없습니다.</td></tr>
              )}
              {filtered.map(s => {
                const profit = brokerageProfit(s);

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
                    {/*
                      적어둔 금액과 손에 들어온 돈이 다를 수 있어 대표가 한 건씩 찍는다.
                      찍은 때를 같이 보여준다 — 확인 여부만 남기면 언제 받은 건지 알 수가 없다.
                      대표가 아니면 눌리지 않는다. 받은 사람이 스스로 찍으면 확인하는 뜻이 없다.
                    */}
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <button
                        disabled={!isCeo || busyId === s.id}
                        onClick={() => void toggleCash(s)}
                        title={
                          s.cashConfirmedAt
                            ? `${dayjs(s.cashConfirmedAt).format('M월 D일 HH:mm')} 확인`
                            : isCeo
                              ? '누르면 확인으로 바꿉니다'
                              : '대표만 확인할 수 있습니다'
                        }
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold disabled:cursor-default ${
                          s.cashConfirmedAt
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-red-300 bg-red-50 text-red-600'
                        } ${isCeo ? 'hover:brightness-95' : ''}`}
                      >
                        {s.cashConfirmedAt ? '확인' : '미확인'}
                      </button>
                      {s.cashConfirmedAt && (
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {dayjs(s.cashConfirmedAt).format('M/D HH:mm')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.installmentFee)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.insuranceFee)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(s.etcCost)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{NUM(s.settlementAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{employeeOf(s.employeeId)?.name}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex whitespace-nowrap items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(s); setPreset(undefined); setFormOpen(true); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => void confirmDanger('알선 정산 내역을 삭제할까요?').then(ok => { if (ok) void deleteBrokerageSettlement(s.id); })} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
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
        <BrokerageSettlementForm editing={editing} defaultEmployeeId={state.currentEmployeeId} preset={preset} onClose={() => setFormOpen(false)} />
      )}
    </>
  );
}
