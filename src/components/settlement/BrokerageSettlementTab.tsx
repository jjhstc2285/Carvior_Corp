import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Check, Download, Lock, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '../../store';
import { useDragScroll } from '../../lib/useDragScroll';
import { ColumnResetButton, useColumnOrder, type Column } from '../table/useColumnOrder';
import {
  brokerageProfit,
  SETTLEMENT_STAGE_CLASS,
  SETTLEMENT_STAGE_LABEL,
  SETTLEMENT_STATUS_LABEL,
  CONSULTATION_KIND_LABEL,
  type BrokerageSettlement,
  type ConsultationKind,
  type SettlementStatus,
} from '../../types';
import { ContractPhotoThumb } from './ContractPhotos';
import BrokerageSettlementForm from './BrokerageSettlementForm';
import PendingSettlementVehicles from './PendingSettlementVehicles';
import VisitReviewSection from '../consultation/VisitReviewSection';
import CapitalQuotaPanel from '../consultation/CapitalQuotaPanel';
import { alertError, confirmDanger } from '../../lib/alert';
import { api, ApiError } from '../../lib/api';
import SettlementCalendar, { SettlementViewToggle, type SettlementView } from './SettlementCalendar';
import EmployeeAvatar from '../EmployeeAvatar';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
  /** 알선 / 수출 — 표를 나눠 본다. 적는 칸과 계산은 같다 */
  kind: ConsultationKind;
}

/** 알선·수출을 맡는 팀 — 담당자 칩에 이 팀을 먼저 띄운다 */
const BROKERAGE_TEAM = '알선팀';

// 시트지 컬럼 순서 그대로 — 표/엑셀 양쪽에서 같은 순서를 쓴다
const NUM = (n: number) => n.toLocaleString();

/** 표의 칸들 — 제목과 그리는 방법을 한 벌로 묶어야 차례를 바꿔도 값이 안 엉킨다 */
const COLUMNS: Column[] = [
  { key: 'date', label: '일자' },
  { key: 'vehicleNumber', label: '차량번호' },
  { key: 'vehicleName', label: '차량명' },
  { key: 'totalSaleAmount', label: '총 진행 판매금액', align: 'text-right' },
  { key: 'ownerDeposit', label: '실차주입금', align: 'text-right' },
  { key: 'profit', label: '수익금', align: 'text-right' },
  { key: 'transferFee', label: '이전비', align: 'text-right' },
  { key: 'transferFeeBalance', label: '이전비 잔액', align: 'text-right' },
  { key: 'cashCommission', label: '현금 수수료', align: 'text-right' },
  { key: 'cashConfirm', label: '현금 확인', align: 'text-center' },
  { key: 'installmentFee', label: '할부 피', align: 'text-right' },
  { key: 'installmentCapital', label: '할부사' },
  { key: 'installmentAmount', label: '할부 실행액', align: 'text-right' },
  { key: 'insuranceFee', label: '보험 피', align: 'text-right' },
  { key: 'etcCost', label: '차대금업', align: 'text-right' },
  { key: 'settlementAmount', label: '정산받을금액', align: 'text-right' },
  { key: 'owner', label: '담당자' },
  { key: 'contract', label: '계약서', align: 'text-center' },
  { key: 'stage', label: '결재' },
  { key: 'status', label: '상태' },
  { key: 'actions', label: '관리', align: 'text-right' },
];

export default function BrokerageSettlementTab({ role, kind }: Props) {
  const kindLabel = CONSULTATION_KIND_LABEL[kind];
  const { state, deleteBrokerageSettlement, refresh } = useStore();
  /** 표를 잡고 끌어서 옆으로 넘긴다 — 칸이 스무 개가 넘어 화면 밖으로 나간다 */
  const dragRef = useDragScroll<HTMLDivElement>();
  /*
    정산은 달로 끊는다.

    달마다 닫고 넘어가는 일인데 전부 한 판에 쌓여 있었다 — 쌓일수록 지난달 것이 섞여
    이번 달 합계를 믿을 수 없고, 다음 달이 되면 지난달을 다시 찾아볼 방법도 없었다.
    매입 정산과 같은 방식으로 맞춘다.
  */
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [allMonths, setAllMonths] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  /** 기본은 표다 — 매일 쓰는 건 표고, 달력은 가끔 펼쳐 본다 */
  const [view, setView] = useState<SettlementView>('list');
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
  /**
   * 결재할 수 있는 사람인지.
   *
   * 이름 두 개로 못 박혀 있다(서버 settlements/approvers.ts). 직책으로 가리면
   * 나중에 본부장이 한 명 더 생겼을 때 그 사람도 돈을 승인하게 된다.
   */
  const approverRole: 'CHIEF' | 'CEO' | null =
    me?.name === '안원용' ? 'CHIEF' : me?.name === '유진욱' ? 'CEO' : null;
  const [busyId, setBusyId] = useState<string | null>(null);

  /** 결재 한 걸음. 서버가 순서와 자격을 다시 본다 — 여기서는 버튼만 가린다. */
  const step = async (s: BrokerageSettlement, action: 'submit' | 'approve' | 'revoke') => {
    setBusyId(s.id);
    try {
      await api(`/settlements/brokerage/${s.id}/${action}`, { method: 'POST' });
      await refresh();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

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
  /*
    이 표에 놓을 것만 고른다.

    kind 가 없던 시절에 적은 건이 있어서, 안 적힌 건은 알선으로 본다 — 그때는 알선뿐이었다.
  */
  /* 제목줄을 끌어 열 순서를 바꾼다 — 알선과 수출이 차례를 따로 기억한다 */
  const cols = useColumnOrder(`settlementColOrder-${kind}`, COLUMNS, { dense: true });

  // 그 달에 한정한다 — 칩에 적힌 건수가 목록과 다르면 어느 쪽이 맞는지 알 수 없다
  const ofKind = state.brokerageSettlements
    .filter(s => (s.kind ?? 'BROKERAGE') === kind)
    .filter(s => allMonths || s.date.startsWith(month));
  const scoped = seesAll ? ofKind : ofKind.filter(s => s.employeeId === state.currentEmployeeId);

  const filtered = scoped
    .filter(s => allMonths || s.date.startsWith(month))
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => !seesAll || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .filter(s => !query.trim() || s.vehicleNumber.includes(query.trim()) || s.vehicleName.includes(query.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  /**
   * 담당자 칩.
   *
   * 알선·수출은 알선팀이 맡는다. 이름을 목록에서 골라 고르게 하면 누가 있는지 펼쳐 봐야
   * 알고, 각자 몇 건인지는 아예 안 보인다. 오늘 근무 현황처럼 얼굴을 늘어놓고 눌러서 고른다.
   *
   * 알선팀에 더해, 이 표에 정산이 들어 있는 사람은 팀이 달라도 같이 띄운다 —
   * 팀을 옮겼거나 팀이 안 적힌 사람의 정산이 조용히 안 보이면 안 된다.
   */
  const owners = useMemo(() => {
    const counted = new Map<string, { count: number; amount: number }>();
    for (const s of ofKind) {
      const prev = counted.get(s.employeeId) ?? { count: 0, amount: 0 };
      counted.set(s.employeeId, {
        count: prev.count + 1,
        amount: prev.amount + s.settlementAmount,
      });
    }
    return state.employees
      .filter(e => e.active !== false && (e.department === BROKERAGE_TEAM || counted.has(e.id)))
      .map(e => ({ employee: e, ...(counted.get(e.id) ?? { count: 0, amount: 0 }) }))
      // 많이 한 사람부터. 한 건도 없는 사람은 뒤로 — 고를 일이 드물다
      .sort((a, b) => b.count - a.count || a.employee.name.localeCompare(b.employee.name));
  }, [ofKind, state.employees]);

  const totals = useMemo(() => ({
    count: filtered.length,

    profit: filtered.reduce((sum, s) => sum + brokerageProfit(s), 0),
    settlement: filtered.reduce((sum, s) => sum + s.settlementAmount, 0),
    inProgress: filtered.filter(s => s.status === 'IN_PROGRESS').length,
  }), [filtered]);

  /*
    캐피탈별로 얼마를 깔았는가.

    재고금융을 쓴 캐피탈에는 그 회사 할부를 얼마 이상 깔아 줘야 하는 약정이 있다. 어느
    캐피탈로 얼마를 실행했는지는 상담에 이미 적는다 — 그걸 모아 보여줄 데가 없었을 뿐이다.

    정산이 아니라 상담에서 센다. 할부를 깐 건 차를 판 자리이고, 정산에 올라오기 전에도
    이미 실행된 돈이다 — 정산을 기다렸다 세면 약정 마감을 넘긴 뒤에 알게 된다.

    보고 있는 달과 종류(알선/수출)를 그대로 따른다.
  */
  const byCapital = useMemo(() => {
    const counted = new Map<string, { amount: number; count: number }>();

    /*
      정산에 적힌 값으로 센다.

      상담에도 같은 칸이 있지만 거기는 상담받을 때 적는 값이라 비어 있는 건이 많다 —
      정산은 돈이 오간 뒤에 적는 자리라 여기 적힌 값이 실제와 맞다.

      정산에 안 적혔으면 같은 차의 상담에서 끌어온다. 적어둔 데가 어디든 한 번은 세어야
      한다 — 다만 한 차를 두 번 세지 않게 정산이 있으면 그쪽만 본다.
    */
    for (const r of filtered) {
      const capital = (r.installmentCapital ?? '').trim();
      const amount = r.installmentAmount ?? 0;

      let name = capital;
      let value = amount;
      if (!capital && amount === 0) {
        const c = state.consultations.find(
          x => x.vehicleNumber === r.vehicleNumber && x.payMethod === 'INSTALLMENT',
        );
        if (!c) continue;
        name = (c.installmentCapital ?? '').trim();
        value = c.installmentAmount ?? 0;
      }

      // 캐피탈을 안 적은 건도 센다 — 빠뜨린 게 있다는 걸 알아야 채운다
      const key = name || '(할부사 안 적음)';
      const prev = counted.get(key) ?? { amount: 0, count: 0 };
      counted.set(key, { amount: prev.amount + value, count: prev.count + 1 });
    }

    return [...counted]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  }, [filtered, state.consultations]);

  const capitalTotal = byCapital.reduce((sum, c) => sum + c.amount, 0);
  const capitalCount = byCapital.reduce((sum, c) => sum + c.count, 0);

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
      결재: SETTLEMENT_STAGE_LABEL[s.stage ?? 'DRAFT'],
      상태: SETTLEMENT_STATUS_LABEL[s.status],
      메모: s.memo,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${kindLabel}정산`);
    XLSX.writeFile(wb, `${kindLabel}정산_${allMonths ? dayjs().format('YYYYMMDD') : month}.xlsx`);
  };

  return (
    <>
      <PendingSettlementVehicles
        kind={kind}
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

      {/*
        전환율과 그 숫자 뒤의 손님들 — 알선에서만 띄운다(수출은 손님이 오지 않는다).

        누르면 그 상담이 바로 열리고, 왜 안 됐는지는 그 자리에서 적는다.
        대표만 전원을 보고 나머지는 자기 것만 본다.
      */}
      {kind === 'BROKERAGE' && <VisitReviewSection role={role} month={month} allMonths={allMonths} />}

      {/*
        재고금융 할부 의무 — 어느 캐피탈에 얼마를 더 깔아야 하는가.
        정산에서 보고 싶다고 해서 상담 화면에서 이리로 옮겼다.
      */}
      {kind === 'BROKERAGE' && <CapitalQuotaPanel />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">
            {allMonths ? '전체' : dayjs(month).format('M월')} 건수
          </p>
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
        {/* 재고금융 약정을 채웠는지 세는 값 — 속은 아래 '캐피탈별 할부'에서 본다 */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-teal-700/80">할부 실행액</p>
          <p className="mt-1 text-2xl font-bold text-teal-800">
            {NUM(capitalTotal)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {capitalCount}건 · 캐피탈 {byCapital.length}곳
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">진행중</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{totals.inProgress}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>

      </div>

      {/*
        캐피탈별 할부 — 약정을 채웠는지 세는 자리다.

        위 카드가 합계고 여기가 그 속이다. 매입 정산의 상품화총비용 항목별과 같은 모양으로
        둔다 — 같은 뜻의 칸은 같은 자리에 같은 꼴로 있어야 눈이 덜 든다.
      */}
      {byCapital.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40">
          <div className="flex items-baseline justify-between border-b border-teal-200/70 px-3 py-1.5">
            <span className="text-xs font-bold text-teal-900">캐피탈별 할부</span>
            <span className="text-[11px] text-teal-800/80">
              합계 {NUM(capitalTotal)}원 · {capitalCount}건 기준
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-teal-200/60 sm:grid-cols-4 sm:divide-y-0">
            {byCapital.map(c => (
              <div key={c.name} className="px-2 py-1.5 text-center">
                <p
                  className={`truncate text-[11px] font-medium ${
                    c.name.startsWith('(') ? 'text-amber-700' : 'text-teal-900/80'
                  }`}
                  title={c.name}
                >
                  {c.name}
                </p>
                <p className="mt-0.5 text-base font-bold text-teal-800">{NUM(c.amount)}</p>
                <p className="text-[10px] text-teal-700/60">{c.count}건</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 남의 것까지 보는 사람에게만 쓸모가 있다 — 자기 것만 보이면 고를 게 없다 */}
      {seesAll && owners.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setEmployeeFilter('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              employeeFilter === 'all'
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            전체 <span className="ml-0.5 font-bold">{ofKind.length}</span>
          </button>
          {owners.map(({ employee, count, amount }) => (
            <button
              key={employee.id}
              onClick={() => setEmployeeFilter(v => (v === employee.id ? 'all' : employee.id))}
              title={`${employee.name} ${employee.position} · ${count}건 · 정산 ${NUM(amount)}원`}
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
                employeeFilter === employee.id
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              } ${count === 0 ? 'opacity-50' : ''}`}
            >
              <EmployeeAvatar name={employee.name} size={22} />
              <span className="font-semibold text-slate-800">{employee.name}</span>
              <span className="text-slate-400">{employee.position}</span>
              <span className="font-bold text-indigo-600">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 달마다 닫고 넘어가는 일이다 — 지난달을 다시 볼 수 있어야 한다 */}
        <input
          type="month"
          value={month}
          onChange={e => {
            setMonth(e.target.value);
            setAllMonths(false);
          }}
          disabled={allMonths}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
        />
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <input type="checkbox" checked={allMonths} onChange={e => setAllMonths(e.target.checked)} />
          전체 기간
        </label>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="차량번호·차량명 검색"
          className="w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SettlementStatus | 'all')}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">전체 상태</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">정산완료</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* 제목줄을 끌어 옮긴 차례를 되돌린다 — 리스트에서만 뜻이 있다 */}
          {view === 'list' && <ColumnResetButton onReset={cols.reset} />}
          <SettlementViewToggle view={view} onChange={setView} />
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button onClick={() => { setEditing(null); setPreset(undefined); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={14} /> {kindLabel} 정산 추가
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <SettlementCalendar
          items={filtered.map(s => ({
            id: s.id,
            date: s.date,
            label: s.vehicleName || s.vehicleNumber,
            sublabel: `${SETTLEMENT_STATUS_LABEL[s.status]} · 정산 ${NUM(s.settlementAmount)}원`,
            tone: s.locked ? 'locked' : s.status === 'COMPLETED' ? 'done' : 'progress',
            onSelect: s.locked ? undefined : () => { setEditing(s); setPreset(undefined); setFormOpen(true); },
          }))}
        />
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        {/* 제목줄을 붙여 둔다 — 줄이 길어지면 무슨 칸을 보는지 세어 가며 읽게 된다 */}
        {/* 표가 화면 밖으로 한참 나간다 — 아무 데나 잡고 끌어서 옆으로 넘긴다 */}
        <div ref={dragRef} className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
              <tr className="text-left text-xs text-slate-400">
                {cols.headers()}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={cols.count} className="px-5 py-10 text-center text-sm text-slate-400">
                    {kindLabel} 정산 내역이 없습니다.
                  </td>
                </tr>
              )}
              {filtered.map(s => {
                const profit = brokerageProfit(s);

                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    {cols.cells({
                      date: <span className="text-slate-600">{dayjs(s.date).format('M/D')}</span>,
                      vehicleNumber: <span className="font-mono text-slate-600">{s.vehicleNumber}</span>,
                      vehicleName: <span className="text-slate-700">{s.vehicleName}</span>,
                      totalSaleAmount: <span className="text-slate-600">{NUM(s.totalSaleAmount)}</span>,
                      ownerDeposit: <span className="text-slate-500">{NUM(s.ownerDeposit)}</span>,
                      profit: (
                        <span className={`font-medium ${profit >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                          {NUM(profit)}
                        </span>
                      ),
                      transferFee: <span className="text-slate-500">{NUM(s.transferFee)}</span>,
                      transferFeeBalance: <span className="text-slate-500">{NUM(s.transferFeeBalance)}</span>,
                      cashCommission: <span className="text-slate-500">{NUM(s.cashCommission)}</span>,
                      /*
                        적어둔 금액과 손에 들어온 돈이 다를 수 있어 대표가 한 건씩 찍는다.
                        찍은 때를 같이 보여준다 — 확인 여부만 남기면 언제 받은 건지 알 수가 없다.
                        대표가 아니면 눌리지 않는다. 받은 사람이 스스로 찍으면 확인하는 뜻이 없다.
                      */
                      cashConfirm: (
                        <>
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
                        </>
                      ),
                      installmentFee: <span className="text-slate-500">{NUM(s.installmentFee)}</span>,
                      // 약정을 세는 값이라 적힌 줄이 눈에 걸려야 한다
                      installmentCapital: s.installmentCapital ? (
                        <span className="text-slate-600">{s.installmentCapital}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      ),
                      installmentAmount: (
                        <span className={s.installmentAmount > 0 ? 'font-semibold text-teal-700' : 'text-slate-300'}>
                          {s.installmentAmount > 0 ? NUM(s.installmentAmount) : '—'}
                        </span>
                      ),
                      insuranceFee: <span className="text-slate-500">{NUM(s.insuranceFee)}</span>,
                      etcCost: <span className="text-slate-500">{NUM(s.etcCost)}</span>,
                      settlementAmount: (
                        <span className="font-semibold text-slate-800">{NUM(s.settlementAmount)}</span>
                      ),
                      owner: <span className="text-slate-500">{employeeOf(s.employeeId)?.name}</span>,
                      // 눌러서 크게 본다 — 결재하는 쪽이 표에서 바로 확인한다
                      contract: s.contractPhotos ? (
                        <ContractPhotoThumb value={s.contractPhotos} size={32} />
                      ) : (
                        <span className="text-slate-300">—</span>
                      ),
                      stage: (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${SETTLEMENT_STAGE_CLASS[s.stage ?? 'DRAFT']}`}
                          title={
                            [s.chiefApprover && `본부장 ${s.chiefApprover}`, s.ceoApprover && `대표 ${s.ceoApprover}`]
                              .filter(Boolean)
                              .join(' · ') || undefined
                          }
                        >
                          {s.locked && <Lock size={10} />}
                          {/* 본부장을 안 거치는 건은 올라온 순간이 곧 대표 차례다 */}
                          {s.stage === 'SUBMITTED' && s.chiefRequired === false
                            ? '대표 승인 대기'
                            : SETTLEMENT_STAGE_LABEL[s.stage ?? 'DRAFT']}
                        </span>
                      ),
                      status: (
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            s.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          }`}
                        >
                          {SETTLEMENT_STATUS_LABEL[s.status]}
                        </span>
                      ),
                      actions: (
                        <div className="flex justify-end gap-1">
                          {/* 다 채웠으면 올린다. 올려야 결재하는 쪽이 볼 차례가 된다 */}
                          {(s.stage ?? 'DRAFT') === 'DRAFT' && (
                            <button
                              disabled={busyId === s.id}
                              onClick={() => void step(s, 'submit')}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                              title="결재를 올립니다"
                            >
                              <Send size={12} /> 올리기
                            </button>
                          )}
                          {/* 내 차례일 때만 승인 버튼이 보인다 */}
                          {((approverRole === 'CHIEF' && s.stage === 'SUBMITTED' && s.chiefRequired !== false) ||
                            (approverRole === 'CEO' &&
                              (s.stage === 'CHIEF' || (s.stage === 'SUBMITTED' && s.chiefRequired === false)))) && (
                            <button
                              disabled={busyId === s.id}
                              onClick={() => void step(s, 'approve')}
                              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check size={12} /> 승인
                            </button>
                          )}
                          {/* 내가 찍은 것만 되돌린다 */}
                          {((approverRole === 'CHIEF' && s.stage === 'CHIEF') ||
                            (approverRole === 'CEO' && s.stage === 'DONE')) && (
                            <button
                              disabled={busyId === s.id}
                              onClick={() => void step(s, 'revoke')}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                              title="승인을 취소하면 다시 고칠 수 있습니다"
                            >
                              <Undo2 size={12} /> 승인 취소
                            </button>
                          )}
                          <button
                            disabled={s.locked}
                            onClick={() => {
                              setEditing(s);
                              setPreset(undefined);
                              setFormOpen(true);
                            }}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                            title={s.locked ? '승인된 정산은 고칠 수 없습니다' : '수정'}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            disabled={s.locked}
                            onClick={() =>
                              void confirmDanger(`${kindLabel} 정산 내역을 삭제할까요?`).then(ok => {
                                if (ok) void deleteBrokerageSettlement(s.id);
                              })
                            }
                            className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                            title={s.locked ? '승인된 정산은 지울 수 없습니다' : '삭제'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ),
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {formOpen && (
        <BrokerageSettlementForm kind={kind} editing={editing} defaultEmployeeId={state.currentEmployeeId} preset={preset} onClose={() => setFormOpen(false)} />
      )}
    </>
  );
}
