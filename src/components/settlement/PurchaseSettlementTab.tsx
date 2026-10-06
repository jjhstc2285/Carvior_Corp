import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Check, Download, FileSpreadsheet, Lock, Pencil, Percent, Plus, ReceiptText, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '../../store';
import EmployeeAvatar from '../EmployeeAvatar';
import PanelInvoiceModal from './PanelInvoiceModal';
import PerformanceVatModal from './PerformanceVatModal';
import { canEditPanelInvoice } from '../../lib/panelInvoice';
import { ColumnResetButton, useColumnOrder, type Column } from '../table/useColumnOrder';
import { percentLabel } from '../../lib/money';
import { canSeeAllSettlements } from '../../lib/permissions';
import {
  EMPTY_PREP_BREAKDOWN,
  EMPTY_VEHICLE_COST,
  PREP_COST_KINDS,
  PREP_COST_LABEL,
  prepBreakdown,
  saleProfit,
  SALE_TAX_RATE,
  SETTLEMENT_STAGE_CLASS,
  SETTLEMENT_STAGE_LABEL,
  purchaseGrandTotal,
  purchasePrepTotal,
  SETTLEMENT_STATUS_LABEL,
  type PrepCostKind,
  type PurchaseSettlement,
  type SettlementStatus,
} from '../../types';
import PurchaseSettlementForm from './PurchaseSettlementForm';
import PendingPurchaseDrafts from './PendingPurchaseDrafts';
import { ContractPhotoThumb } from './ContractPhotos';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { api, ApiError } from '../../lib/api';
import SettlementCalendar, { SettlementViewToggle, type SettlementView } from './SettlementCalendar';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

const NUM = (n: number) => n.toLocaleString();
/**
 * 금액은 원으로 저장하고 원으로 보여준다.
 *
 * 예전에는 만원으로 접어서 보여줬는데 2,761.22만원 같은 소수가 나와 읽기 어려웠다.
 * 27,612,200원이 자릿수는 길어도 눈으로 바로 읽힌다.
 */
const MAN = (n: number) => n.toLocaleString();

/**
 * 표의 칸들.
 *
 * 제목과 그리는 방법을 한 벌로 묶는다 — 차례를 바꿀 수 있으려면 둘이 따로 놀면 안 된다.
 * 상품화 여섯 가지는 목록에서 펴서 만든다(광택·세차 … 진단비).
 */
const COLUMNS: Column[] = [
  // 판 날이다. 안 판 차는 매입일에 머문다 — 정산은 판 다음에 하는 일이다
  { key: 'date', label: '정산일자' },
  { key: 'vehicleName', label: '차량명' },
  { key: 'vehicleNumber', label: '차량번호' },
  {
    key: 'transferFee',
    label: '이전비+추가',
    align: 'text-right',
    title: '상사 이전비(매입가의 1%) + 추가이전비(취득세의 15%) — 매입가로 자동 계산됩니다',
  },
  { key: 'purchasePrice', label: '매입가', align: 'text-right' },
  ...PREP_COST_KINDS.map(k => ({ key: `prep:${k}`, label: PREP_COST_LABEL[k], align: 'text-right' })),
  { key: 'prepTotal', label: '상품화총비용', align: 'text-right' },
  { key: 'brokerFee', label: '구전', align: 'text-right' },
  { key: 'grandTotal', label: '총비용', align: 'text-right' },
  { key: 'settlementAmount', label: '정산금액', align: 'text-right' },
  { key: 'vehicleCost', label: '차량비용(원)', align: 'text-right', headClass: 'text-sky-600' },
  { key: 'totalWon', label: '총합계(원)', align: 'text-right', headClass: 'text-sky-600' },
  { key: 'salePrice', label: '차량판매가', align: 'text-right', headClass: 'text-emerald-600' },
  {
    key: 'profit',
    label: '판매수익',
    align: 'text-right',
    headClass: 'text-emerald-600',
    title: `차량판매가 − 총합계 − 세금 ${percentLabel(SALE_TAX_RATE)}%`,
  },
  { key: 'owner', label: '담당자' },
  { key: 'contract', label: '계약서', align: 'text-center' },
  { key: 'stage', label: '결재' },
  { key: 'status', label: '상태' },
  { key: 'actions', label: '관리', align: 'text-right' },
];

/**
 * 매입 정산 인센티브.
 *
 * 그 달에 결재까지 끝난 건이 스무 건을 넘으면 건당 2만 원이 붙는다. 올려만 두고 승인이
 * 안 난 건은 안 센다 — 끝까지 간 것만 일한 것으로 본다.
 */
const PURCHASE_BONUS_MIN = 20;
const PURCHASE_BONUS_PER_CASE = 20_000;

export default function PurchaseSettlementTab({ role }: Props) {
  const { state, deletePurchaseSettlement, refresh } = useStore();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  /** 이번 달부터 본다. 지난 달 것까지 한 화면에 쌓이면 지금 처리할 게 안 보인다. */
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [allMonths, setAllMonths] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  /** 기본은 표다 — 매일 쓰는 건 표고, 달력은 가끔 펼쳐 본다 */
  const [view, setView] = useState<SettlementView>('list');
  const [editing, setEditing] = useState<PurchaseSettlement | null>(null);

  /**
   * 계약팀은 남의 건도 본다.
   *
   * 매입은 매입팀이 해오고 빈칸은 계약팀이 채운다. 자기 담당 건만 보이면
   * 정작 채워야 할 사람이 아무것도 못 본다.
   */
  const me = state.employees.find(e => e.id === state.currentEmployeeId) ?? null;
  const myDepartment = me?.department ?? null;
  /**
   * 결재할 수 있는 사람인지.
   *
   * 이름 두 개로 못 박혀 있다(서버 settlements/approvers.ts). 직책으로 가리면
   * 나중에 본부장이 한 명 더 생겼을 때 그 사람도 돈을 승인하게 된다.
   */
  /** 한 달치를 지우는 건 무거운 일이라 사무장·대표만. 서버도 같은 기준으로 다시 본다. */
  const canClear = role === 'ADMIN' || ['대표', '사무장'].some(k => (me?.position ?? '').includes(k));
  /* 판금집 청구서 넣는 창 */
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [vatOpen, setVatOpen] = useState(false);
  const approverRole: 'CHIEF' | 'CEO' | null =
    me?.name === '안원용' ? 'CHIEF' : me?.name === '유진욱' ? 'CEO' : null;
  const seesAll = canSeeAllSettlements({ role }, myDepartment, me?.name);
  const scoped = seesAll
    ? state.purchaseSettlements
    : state.purchaseSettlements.filter(s => s.employeeId === state.currentEmployeeId);

  /**
   * 그 달 정산을 한 번에 지운다.
   *
   * 이 화면이 생기기 전에 따로 정산을 끝낸 달이 있다. 수십 건을 손으로 지우게 두지 않는다.
   * 승인이 찍힌 건은 서버가 남긴다 — 그건 누가 무엇을 보고 결재했는지가 남아야 하는 기록이다.
   */
  const clearMonth = async () => {
    const count = filtered.length;
    const label = dayjs(month).format('YYYY년 M월');
    const ok = await confirmDanger(
      `${label} 매입 정산 ${count}건을 지울까요?`,
      '되돌릴 수 없습니다. 승인이 찍힌 건은 남습니다 — 그건 승인을 먼저 취소해야 지워집니다.',
    );
    if (!ok) return;
    try {
      const res = await api<{ deleted: number; kept: number }>(`/settlements/purchase/month/${month}`, {
        method: 'DELETE',
      });
      await refresh();
      void alertSuccess(
        `${res.deleted}건을 지웠습니다`,
        res.kept > 0 ? `승인이 찍힌 ${res.kept}건은 남겼습니다.` : undefined,
      );
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 이미 적어둔 알선 정산을 한 번에 끌어온다.
   *
   * 옮기는 건 알선 정산을 저장할 때 일어난다. 그 전에 적어둔 건은 아무 일도 안 일어나서
   * "한 대도 안 넘어왔다"가 된다.
   */
  const pullFromBrokerage = async () => {
    try {
      const res = await api<{
        updated: number;
        already: number;
        noMatch: number;
        missingPlates: string[];
        brokerageCount: number;
        brokerageWithAmount: number;
        purchaseCount: number;
        brokeragePlates: string[];
        purchasePlates: string[];
      }>('/settlements/purchase/sync-from-brokerage', { method: 'POST' });
      await refresh();

      /*
       * 어디서 끊겼는지 그대로 보여준다.
       *
       * '0건 가져옴'만 띄우면 왜 안 됐는지 알 수가 없다. 알선 정산이 없는 건지,
       * 판매금액을 안 적은 건지, 차량번호가 안 겹치는 건지 — 고칠 방법이 다 다르다.
       */
      const lines = [
        `알선 정산 ${res.brokerageCount}건 (판매금액 적힌 것 ${res.brokerageWithAmount}건)`,
        `매입 정산 ${res.purchaseCount}대`,
        `가져옴 ${res.updated}건 · 이미 같음 ${res.already}건 · 짝 없음 ${res.noMatch}건`,
      ];
      if (res.noMatch > 0) lines.push(`짝 없는 알선 차량번호: ${res.missingPlates.join(', ')}`);
      if (res.updated === 0 && res.brokeragePlates.length > 0) {
        lines.push(`알선 쪽 차량번호 예: ${res.brokeragePlates.join(', ')}`);
        lines.push(`매입 정산 쪽 차량번호 예: ${res.purchasePlates.join(', ')}`);
      }

      void alertSuccess(
        res.updated > 0 ? `${res.updated}건을 가져왔습니다` : '가져온 게 없습니다',
        lines.join(' / '),
      );
    } catch (e) {
      void alertError('가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /** 결재 한 걸음. 서버가 순서와 자격을 다시 본다 — 여기서는 버튼만 가린다. */
  const step = async (s: PurchaseSettlement, action: 'submit' | 'approve' | 'revoke') => {
    try {
      await api(`/settlements/purchase/${s.id}/${action}`, { method: 'POST' });
      await refresh();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /* 제목줄을 끌어 열 순서를 바꾼다 — 화면마다 같은 방식이다 */
  const cols = useColumnOrder('purchaseSettlementColOrder', COLUMNS, { dense: true });

  const filtered = scoped
    .filter(s => allMonths || s.date.startsWith(month))
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => !seesAll || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .filter(s => !query.trim() || s.vehicleNumber.includes(query.trim()) || s.vehicleName.includes(query.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));

  /*
    담당자 칩.

    이름을 목록에서 골라 고르게 하면 누가 있는지 펼쳐 봐야 알고, 각자 몇 건인지는 아예
    안 보인다. 알선 정산처럼 얼굴을 늘어놓고 눌러서 고른다.

    승인까지 간 건수를 같이 센다. 그 달에 결재가 끝난 건이 스무 건을 넘으면 건당 2만 원이
    붙는다 — 적다 만 건이나 올려만 둔 건은 안 센다. 끝까지 간 것만 일한 것으로 본다.
  */
  const owners = useMemo(() => {
    const month = filtered;
    const counted = new Map<string, { count: number; done: number; profit: number; sold: number }>();
    for (const s of month) {
      const prev = counted.get(s.employeeId) ?? { count: 0, done: 0, profit: 0, sold: 0 };
      counted.set(s.employeeId, {
        count: prev.count + 1,
        done: prev.done + (s.stage === 'DONE' ? 1 : 0),
        // 아직 안 판 차는 빼고 센다 — 판매가가 0이면 총비용만큼 적자로 잡힌다
        profit: prev.profit + (s.salePrice > 0 ? profitOf(s) : 0),
        sold: prev.sold + (s.salePrice > 0 ? 1 : 0),
      });
    }
    return state.employees
      .filter(e => e.active !== false && (e.department === '계약팀' || counted.has(e.id)))
      .map(e => {
        const c = counted.get(e.id) ?? { count: 0, done: 0, profit: 0, sold: 0 };
        return {
          employee: e,
          ...c,
          /** 승인 스무 건을 넘기면 건당 2만 원 */
          bonus: c.done >= PURCHASE_BONUS_MIN ? c.done * PURCHASE_BONUS_PER_CASE : 0,
        };
      })
      .sort((a, b) => b.done - a.done || b.count - a.count || a.employee.name.localeCompare(b.employee.name));
  }, [filtered, state.employees]);

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  /**
   * 판매 입력 대기.
   *
   * 상담이 판매완료로 끝났는데 그 차의 매입 정산에 판매가가 아직 안 들어간 건들이다.
   * 차는 살 때 정산이 이미 만들어져 있으므로 새로 만들지 않고 그 줄을 열어 판매 쪽만 채운다.
   */
  const awaitingSale = useMemo(() => {
    const sold = new Set(state.consultations.filter(c => c.status === 'SOLD').map(c => c.vehicleNumber));
    return scoped.filter(s => s.salePrice === 0 && sold.has(s.vehicleNumber));
  }, [state.consultations, scoped]);

  // 차량관리에서 붙는 비용 — 차량번호가 차량관리에 없으면 서버가 아무것도 안 붙이므로 0으로 본다.
  const costOf = (s: PurchaseSettlement) => s.vehicleCost ?? EMPTY_VEHICLE_COST;
  /** 상품화총비용·항목별 합계는 서버가 명세를 더해서 내려준다. 없으면 화면에서 같은 식으로 낸다. */
  const prepTotalOf = (s: PurchaseSettlement) => s.prepTotal ?? purchasePrepTotal(s.prepCosts ?? []);
  const breakdownOf = (s: PurchaseSettlement) => s.prepBreakdown ?? prepBreakdown(s.prepCosts ?? []);
  const grandTotalOf = (s: PurchaseSettlement) =>
    s.grandTotal ?? purchaseGrandTotal(s.purchasePrice, prepTotalOf(s), s.transferFee, s.brokerFee);
  /** 최종 합계(원). 서버 값이 없으면 화면에서 같은 식으로 계산한다. */
  const totalWonOf = (s: PurchaseSettlement) => s.grandTotalWon ?? grandTotalOf(s) + costOf(s).total;
  // 서버가 계산해 주지만, 목록을 손에서 고치는 동안에는 없을 수 있어 같은 식으로 다시 낸다.
  const profitOf = (s: PurchaseSettlement) => s.saleProfit ?? saleProfit(s.salePrice, totalWonOf(s));

  /** 항목 칸에 마우스를 올리면 어느 업체에 얼마 썼는지 보인다. */
  const vendorsOf = (s: PurchaseSettlement, kind: PrepCostKind) => {
    const lines = (s.prepCosts ?? []).filter(c => c.kind === kind);
    if (!lines.length) return `${PREP_COST_LABEL[kind]} 내역 없음`;
    return lines.map(c => `${c.vendor || '미지정'} ${MAN(c.amount)}`).join(' / ');
  };

  /*
    그 달 청구서 총액.

    줄 합계와 청구서 총액이 안 맞는 달이 있는데, 맞추자고 차액을 남의 차에 얹으면 그 차
    원가와 순이익이 틀어진 채로 결재까지 간다. 그래서 차에는 나눠 붙이지 않고 받은 총액을
    적어 두고, 판금·덴트 합계만 이 값으로 덮어쓴다.

    달을 고른 때만 본다 — 전체 기간은 어느 달 총액인지 가릴 수 없다.
  */
  const [invoiceTotals, setInvoiceTotals] = useState<
    { vendor: string; kind: string; amount: number; count: number; writer: string }[]
  >([]);
  const loadInvoiceTotals = useCallback(async () => {
    if (allMonths) {
      setInvoiceTotals([]);
      return;
    }
    try {
      setInvoiceTotals(
        await api<{ vendor: string; kind: string; amount: number; count: number; writer: string }[]>(
          `/settlements/purchase/panel-invoice/totals?month=${month}`,
        ),
      );
    } catch {
      // 못 불러와도 목록은 그대로 보여준다 — 합계만 줄에서 더한 값으로 돌아간다
      setInvoiceTotals([]);
    }
  }, [allMonths, month]);

  useEffect(() => {
    void loadInvoiceTotals();
  }, [loadInvoiceTotals]);

  /**
   * 항목마다 적어 둔 청구서 총액.
   *
   * 판금만 청구서로 오는 게 아니다 — 광택은 사진으로 와서 총액만 적는다. 업체가 여럿이면
   * 더한다: 대산과 KS를 각각 적으면 둘을 더한 값이 판금·덴트 총액이다.
   */
  const statedByKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of invoiceTotals) m.set(t.kind, (m.get(t.kind) ?? 0) + t.amount);
    return m;
  }, [invoiceTotals]);

  const totals = useMemo(() => ({
    count: filtered.length,
    purchase: filtered.reduce((sum, s) => sum + s.purchasePrice, 0),
    prep: filtered.reduce((sum, s) => sum + prepTotalOf(s), 0),
    settlement: filtered.reduce((sum, s) => sum + s.settlementAmount, 0),
    vehicleCost: filtered.reduce((sum, s) => sum + (s.vehicleCost?.total ?? 0), 0),
    /*
      판매수익 — 판 차만 센다.

      아직 안 판 차는 판매가가 0이라 그대로 더하면 총비용만큼 적자로 잡힌다. 그러면 많이
      사올수록 수익이 깎여 보인다 — 판 차끼리 견주는 값이라야 뜻이 있다.
    */
    profit: filtered.filter(s => s.salePrice > 0).reduce((sum, s) => sum + profitOf(s), 0),
    sold: filtered.filter(s => s.salePrice > 0).length,
    // 상품화총비용을 항목 6개로 쪼갠 합계 — 어디에 돈이 몰렸는지 한눈에 보려고 둔다.
    prepByKind: filtered.reduce((acc, s) => {
      const b = breakdownOf(s);
      for (const k of PREP_COST_KINDS) acc[k] += b[k];
      return acc;
    }, { ...EMPTY_PREP_BREAKDOWN }),
  }), [filtered]);

  /**
   * 화면에 띄우는 상품화총비용.
   *
   * 판금·덴트를 청구서 총액으로 덮어썼으면 그만큼 총비용도 같이 움직여야 한다 — 항목
   * 여섯 칸을 더한 값이 위 카드와 달라지면 어느 쪽이 맞는지 아무도 모른다.
   */
  const prepShown = PREP_COST_KINDS.reduce(
    (sum, k) => sum + ((statedByKind.get(k) ?? 0) > 0 ? (statedByKind.get(k) ?? 0) : totals.prepByKind[k]),
    0,
  );

  const handleExport = () => {
    // 엑셀에서 더하고 곱할 수 있게 문자열이 아니라 숫자로 넣는다. 전부 원 단위다.
    const rows = filtered.map(s => ({
      일자: s.date,
      차량명: s.vehicleName,
      차량번호: s.vehicleNumber,
      '이전비+추가이전비(원)': s.transferFee,
      '매입가(원)': s.purchasePrice,
      // 항목별 합계 6칸 — 업체별 세부는 '상품화 명세' 열에 풀어 쓴다.
      ...Object.fromEntries(PREP_COST_KINDS.map(k => [`${PREP_COST_LABEL[k]}(원)`, breakdownOf(s)[k]])),
      '구전(원)': s.brokerFee,
      '상품화총비용(원)': prepTotalOf(s),
      '상품화 명세': (s.prepCosts ?? [])
        .map(c => `${PREP_COST_LABEL[c.kind]}·${c.vendor || '미지정'} ${c.amount.toLocaleString()}`)
        .join(' / '),
      '총비용(원)': grandTotalOf(s),
      '정산금액(원)': s.settlementAmount,
      '주유(원)': costOf(s).fuel,
      '배터리(원)': costOf(s).battery,
      '주차(원)': costOf(s).parking,
      '외부주차장 세차(원)': costOf(s).wash,
      '소모품 수리(원)': costOf(s).repair,
      '기타(원)': costOf(s).etc,
      '차량비용 합계(원)': costOf(s).total,
      '총합계(원)': totalWonOf(s),
      담당자: employeeOf(s.employeeId)?.name ?? '',
      결재: SETTLEMENT_STAGE_LABEL[s.stage ?? 'DRAFT'],
      '본부장 승인': s.chiefApprover || '',
      '대표 승인': s.ceoApprover || '',
      상태: SETTLEMENT_STATUS_LABEL[s.status],
      메모: s.memo,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매입정산');
    XLSX.writeFile(wb, `매입정산_${allMonths ? dayjs().format('YYYYMMDD') : month}.xlsx`);
  };

  return (
    <>
      {/* 매입은 있는데 정산 줄이 없는 차 — 계약팀이 채울 빈칸부터 만든다 */}
      {seesAll && <PendingPurchaseDrafts onCreated={() => void refresh()} />}

      {awaitingSale.length > 0 && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <ReceiptText size={14} className="text-emerald-700" />
            <p className="text-xs font-bold text-emerald-800">판매 입력 대기</p>
            <span className="text-[11px] text-emerald-700/70">
              판매완료 {awaitingSale.length}대 — 누르면 그 줄이 열립니다. 차량판매가와 수수료를 채우면 판매수익이 나옵니다
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {awaitingSale.map(s => (
              <button
                key={s.id}
                onClick={() => { setEditing(s); setFormOpen(true); }}
                className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span className="font-mono">{s.vehicleNumber}</span>
                <span className="ml-1.5 text-emerald-700/70">{s.vehicleName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">총 건수</p>
          <p className="text-xl font-bold text-slate-800">{totals.count}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">매입가 합계</p>
          <p className="text-xl font-bold text-slate-800">{MAN(totals.purchase)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">상품화총비용 합계</p>
          <p className="text-xl font-bold text-amber-600">{MAN(prepShown)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">정산금액 합계</p>
          <p className="text-xl font-bold text-indigo-600">{MAN(totals.settlement)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">차량비용 합계</p>
          <p className="text-xl font-bold text-sky-600">{NUM(totals.vehicleCost)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
          <p className="text-[10px] text-slate-400">주유·배터리·주차·세차·수리 자동 반영</p>
        </div>
        {/* 담당자 칩을 누르면 그 사람이 판 차만 더해진다 */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2">
          <p className="text-xs font-medium text-emerald-700/80">판매수익 합계</p>
          <p className={`text-xl font-bold ${totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {MAN(totals.profit)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[10px] text-slate-400">
            {totals.count}건 중 <b className="font-bold text-emerald-700">{totals.sold}대</b> 판매
            {totals.sold > 0 && ` · 대당 ${MAN(Math.round(totals.profit / totals.sold))}원`}
          </p>
        </div>
      </div>

      {/* 위 '상품화총비용 합계'를 항목 6개로 쪼갠 것 — 세로 합이 그 카드 숫자와 같다 */}
      <div className="mb-2.5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
        <div className="flex items-baseline justify-between border-b border-amber-200/70 px-3 py-1.5">
          <span className="text-xs font-bold text-amber-800">상품화총비용 항목별</span>
          <span className="text-[11px] text-amber-700/80">
            합계 {MAN(prepShown)}원 · {totals.count}건 기준
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-y divide-amber-200/60 sm:grid-cols-6 sm:divide-y-0">
          {PREP_COST_KINDS.map(k => {
            /*
              판금·덴트는 청구서 총액을 적어 뒀으면 그 값으로 덮어쓴다.

              줄 합계와 안 맞아도 차액을 차에 나눠 붙이지 않기로 했다 — 차마다의 원가는
              청구서에 적힌 그대로 두고, 합계만 받은 총액으로 본다. 어디서 온 숫자인지
              모르면 안 되니 적은 사람과 줄 합계를 같이 띄운다.
            */
            const stated = (statedByKind.get(k) ?? 0) > 0;
            const value = stated ? (statedByKind.get(k) ?? 0) : totals.prepByKind[k];
            return (
              <div key={k} className="px-2 py-1.5 text-center">
                <p className="text-[11px] font-medium text-amber-800/80">{PREP_COST_LABEL[k]}</p>
                <p className={`mt-0.5 text-base font-bold ${value ? 'text-amber-700' : 'text-amber-700/25'}`}>
                  {MAN(value)}
                </p>
                {stated && (
                  <p
                    className="text-[10px] font-medium text-amber-700/70"
                    title={`${invoiceTotals
                      .filter(t => t.kind === k)
                      .map(
                        t =>
                          `${t.vendor} ${t.amount.toLocaleString()}원${t.count ? ` · ${t.count}건` : ''}${
                            t.writer ? ` · ${t.writer}` : ''
                          }`,
                      )
                      .join(' / ')}
줄에서 더한 값은 ${totals.prepByKind[k].toLocaleString()}원입니다`}
                  >
                    청구서 총액
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/*
        담당자 칩 — 누가 몇 건을 끝냈는지 한 줄에서 본다.

        승인까지 간 건수가 스무 건을 넘으면 건당 2만 원이 붙는다. 금액이 붙은 사람은
        초록으로 띄운다 — 눈에 안 띄면 세어 볼 일이 없다.
      */}
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
            전체 <span className="ml-0.5 font-bold">{scoped.filter(s => allMonths || s.date.startsWith(month)).length}</span>
          </button>
          {owners.map(({ employee, count, done, bonus, profit, sold }) => (
            <button
              key={employee.id}
              onClick={() => setEmployeeFilter(v => (v === employee.id ? 'all' : employee.id))}
              title={`${employee.name} ${employee.position} · ${count}건 중 결재완료 ${done}건 · ${sold}대 판매, 판매수익 ${NUM(profit)}원${
                bonus > 0 ? ` · 인센티브 ${NUM(bonus)}원` : ` · 결재완료 ${PURCHASE_BONUS_MIN}건부터 건당 ${NUM(PURCHASE_BONUS_PER_CASE)}원`
              }`}
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
              {done > 0 && <span className="text-[11px] text-slate-400">완료 {done}</span>}
              {sold > 0 && (
                <span className={`text-[11px] font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  수익 {MAN(profit)}
                </span>
              )}
              {bonus > 0 && (
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  +{NUM(bonus)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="차량번호·차량명 검색"
          className="w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SettlementStatus | 'all')}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">전체 상태</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">정산완료</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* 알선 정산에 적어둔 판매금액·이전비를 지난 것까지 한 번에 끌어온다 */}
          {canClear && (
            <button
              onClick={() => void pullFromBrokerage()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              title="알선 정산의 실차주입금(없으면 총 진행 판매금액)을 매입 정산의 차량판매가로 가져옵니다"
            >
              <RefreshCw size={14} /> 판매가 가져오기
            </button>
          )}
          {/* 따로 정산을 끝낸 달을 정리할 때. 사무장·대표만 보인다 */}
          {canClear && !allMonths && filtered.length > 0 && (
            <button
              onClick={() => void clearMonth()}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              title="이 달 정산을 한 번에 지웁니다. 승인된 건은 남습니다"
            >
              {dayjs(month).format('M월')} 정산 비우기
            </button>
          )}
          {/* 제목줄을 끌어 옮긴 차례를 되돌린다 — 리스트에서만 뜻이 있다 */}
          {view === 'list' && <ColumnResetButton onReset={cols.reset} />}
          <SettlementViewToggle view={view} onChange={setView} />
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Download size={14} /> 엑셀 다운로드
          </button>
          {/*
            판금 청구서를 그대로 넣는다. 남의 정산 원가를 한 번에 고치고 총액이 안 맞으면
            금액을 손으로 맞추는 자리라, 이름으로 못 박은 두 사람만 연다 — 서버도 같은
            기준으로 다시 본다(화면만 가리면 요청을 직접 보낼 수 있다).
          */}
          {canEditPanelInvoice(me?.name) && (
            <button
              onClick={() => setInvoiceOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileSpreadsheet size={14} /> 청구서 기입하기
            </button>
          )}
          {/* 예전에 공급가만 적어둔 성능비를 한 번에 올린다 — 같은 두 사람만 */}
          {canEditPanelInvoice(me?.name) && (
            <button
              onClick={() => setVatOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Percent size={14} /> 성능비 부가세
            </button>
          )}
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={14} /> 매입 정산 추가
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <SettlementCalendar
          // 위에서 고른 달과 같이 움직인다 — 달력만 딴 달을 보고 있으면 숫자가 안 맞는다
          month={dayjs(`${month}-01`)}
          onMonthChange={d => { setAllMonths(false); setMonth(d.format('YYYY-MM')); }}
          items={filtered.map(s => ({
            id: s.id,
            date: s.date,
            label: s.vehicleName || s.vehicleNumber,
            sublabel: `${SETTLEMENT_STAGE_LABEL[s.stage ?? 'DRAFT']} · 합계 ${NUM(totalWonOf(s))}원`,
            tone: s.locked ? 'locked' : s.status === 'COMPLETED' ? 'done' : 'progress',
            onSelect: s.locked ? undefined : () => { setEditing(s); setFormOpen(true); },
          }))}
        />
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        {/*
          세로로도 옆으로도 이 안에서만 구른다.

          정산이 백 줄이 넘는 달이 있는데, 그때 제목줄이 화면 위로 올라가 버리면 지금
          보는 숫자가 매입가인지 정산금액인지 세어 가며 읽게 된다. 제목줄을 붙여 둔다.
        */}
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1520px] text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
              <tr className="text-left text-xs text-slate-400">
                {cols.headers()}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={cols.count} className="px-5 py-10 text-center text-sm text-slate-400">매입 정산 내역이 없습니다.</td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {cols.cells({
                    date: <span className="text-slate-600">{dayjs(s.date).format('M/D')}</span>,
                    vehicleName: <span className="text-slate-700">{s.vehicleName}</span>,
                    vehicleNumber: <span className="font-mono text-slate-600">{s.vehicleNumber}</span>,
                    transferFee: <span className="text-slate-500">{MAN(s.transferFee)}</span>,
                    purchasePrice: <span className="text-slate-600">{MAN(s.purchasePrice)}</span>,
                    ...Object.fromEntries(
                      PREP_COST_KINDS.map(k => [
                        `prep:${k}`,
                        <span key={k} className="text-slate-500" title={vendorsOf(s, k)}>
                          {MAN(breakdownOf(s)[k])}
                        </span>,
                      ]),
                    ),
                    prepTotal: <span className="font-medium text-amber-700">{MAN(prepTotalOf(s))}</span>,
                    brokerFee: <span className="text-slate-500">{MAN(s.brokerFee)}</span>,
                    grandTotal: <span className="font-semibold text-indigo-600">{MAN(grandTotalOf(s))}</span>,
                    settlementAmount: <span className="font-semibold text-slate-800">{MAN(s.settlementAmount)}</span>,
                    vehicleCost: (
                      <span
                        className="text-sky-700"
                        title={
                          costOf(s).count > 0
                            ? `주유 ${NUM(costOf(s).fuel)} / 배터리 ${NUM(costOf(s).battery)} / 주차 ${NUM(costOf(s).parking)} / 외부세차 ${NUM(costOf(s).wash)} / 소모품 수리 ${NUM(costOf(s).repair)} / 기타 ${NUM(costOf(s).etc)} (${costOf(s).count}건)`
                            : '차량관리에 등록된 이력이 없습니다.'
                        }
                      >
                        {costOf(s).count > 0 ? NUM(costOf(s).total) : <span className="text-slate-300">-</span>}
                      </span>
                    ),
                    totalWon: <span className="font-semibold text-sky-700">{NUM(totalWonOf(s))}</span>,
                    salePrice: <span className="text-slate-600">{s.salePrice > 0 ? MAN(s.salePrice) : '—'}</span>,
                    profit: <span className="font-semibold text-emerald-700">{MAN(profitOf(s))}</span>,
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
                        {/* 다 채웠으면 올린다. 올려야 본부장이 볼 차례가 된다 */}
                        {s.stage === 'DRAFT' && (
                          <button
                            onClick={() => void step(s, 'submit')}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                            title="본부장에게 올립니다"
                          >
                            <Send size={12} /> 올리기
                          </button>
                        )}
                        {/* 내 차례일 때만 승인 버튼이 보인다 */}
                        {((approverRole === 'CHIEF' && s.stage === 'SUBMITTED' && s.chiefRequired !== false) ||
                          (approverRole === 'CEO' &&
                            (s.stage === 'CHIEF' || (s.stage === 'SUBMITTED' && s.chiefRequired === false)))) && (
                          <button
                            onClick={() => void step(s, 'approve')}
                            className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <Check size={12} /> 승인
                          </button>
                        )}
                        {/* 내가 찍은 것만 되돌린다 */}
                        {((approverRole === 'CHIEF' && s.stage === 'CHIEF') ||
                          (approverRole === 'CEO' && s.stage === 'DONE')) && (
                          <button
                            onClick={() => void step(s, 'revoke')}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                            title="승인을 취소하면 다시 고칠 수 있습니다"
                          >
                            <Undo2 size={12} /> 승인 취소
                          </button>
                        )}
                        <button
                          disabled={s.locked}
                          onClick={() => {
                            setEditing(s);
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
                            void confirmDanger('매입 정산 내역을 삭제할까요?', '상품화 비용 명세도 함께 지워집니다.').then(
                              ok => {
                                if (ok) void deletePurchaseSettlement(s.id);
                              },
                            )
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {vatOpen && (
        <PerformanceVatModal
          onClose={() => setVatOpen(false)}
          onApplied={async () => {
            await refresh();
          }}
        />
      )}

      {invoiceOpen && (
        <PanelInvoiceModal
          /* 붙일 수 있는 차 — 청구서 줄이 어디에 꽂힐지를 넣기 전에 보여준다 */
          targets={scoped.map(s => ({
            vehicleNumber: s.vehicleNumber,
            vehicleName: s.vehicleName,
            dent: (s.prepCosts ?? []).filter(c => c.kind === 'DENT').reduce((sum, c) => sum + c.amount, 0),
          }))}
          myName={me?.name}
          month={month}
          savedTotals={invoiceTotals}
          onClose={() => setInvoiceOpen(false)}
          onApplied={async () => {
            await refresh();
            await loadInvoiceTotals();
          }}
        />
      )}

      {formOpen && (
        <PurchaseSettlementForm editing={editing} defaultEmployeeId={state.currentEmployeeId} onClose={() => setFormOpen(false)} />
      )}
    </>
  );
}
