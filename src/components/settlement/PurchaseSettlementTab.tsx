import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Check, Download, FileSpreadsheet, Lock, Pencil, Percent, Plus, ReceiptText, Send, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '../../store';
import type { Focus } from '../../lib/goto';
import { useDragScroll } from '../../lib/useDragScroll';
import EmployeeAvatar from '../EmployeeAvatar';
import PanelInvoiceModal from './PanelInvoiceModal';
import PerformanceVatModal from './PerformanceVatModal';
import { canEditPanelInvoice } from '../../lib/panelInvoice';
import { ColumnResetButton, useColumnOrder, type Column } from '../table/useColumnOrder';
import { moneyToNumber, toMoneyValue } from '../../lib/money';
import { canSeeAllSettlements, SETTLEMENT_VIEWERS } from '../../lib/permissions';
import {
  EMPTY_PREP_BREAKDOWN,
  EMPTY_VEHICLE_COST,
  PREP_COST_KINDS,
  PREP_COST_LABEL,
  prepBreakdown,
  PROFIT_SHARES,
  saleProfit,
  SETTLEMENT_STAGE_CLASS,
  SETTLEMENT_STAGE_LABEL,
  purchaseGrandTotal,
  carviorFeeOf,
  CARVIOR_FEE,
  purchasePrepTotal,
  SETTLEMENT_STATUS_LABEL,
  type PrepCostKind,
  type PurchaseSettlement,
  type SettlementStatus,
} from '../../types';
import PurchaseSettlementForm from './PurchaseSettlementForm';
import PendingPurchaseDrafts from './PendingPurchaseDrafts';
import MissingInputPanel from './MissingInputPanel';
import { ContractPhotoThumb } from './ContractPhotos';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { api, ApiError } from '../../lib/api';
import { PLATE_SEARCH_CLASS } from '../../lib/searchBox';
import { SOLD_CHANNEL_HINT, SOLD_CHANNEL_LABEL, SOLD_CHANNEL_TONE } from '../../lib/soldChannel';
import { useSoldChannels } from '../../lib/useSoldChannels';
import SettlementCalendar, { SettlementViewToggle, type SettlementView } from './SettlementCalendar';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
  /** 다른 화면에서 들고 온 차 — 그 차들만 걸러 본다 */
  focus?: Focus | null;
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
  /*
    차가 들어온 날과 나간 날.

    '정산일자'라고 적어 뒀는데 실은 차가 나간 날이고, '제시일자'는 차가 들어온 날이다.
    적힌 이름이 하는 일과 다르면 보는 사람이 매번 다시 묻는다 — 입고·출고로 적는다.
    (담긴 칸 이름은 그대로다. 화면 글자만 바꾼다)
  */
  {
    key: 'intakeDate',
    label: '입고일자',
    title:
      '차가 들어온 날 — 매입 관리의 매입일입니다(매입 기록이 없으면 재고 금융의 제시일자). 옆의 작은 숫자는 그날부터 센 재고일수입니다',
  },
  { key: 'date', label: '출고일자', title: '차가 나간 날 — 정산을 적는 날입니다. 아직 안 판 차는 매입일에 머물러 있습니다' },
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
  { key: 'platformFee', label: '플랫폼 수수료', align: 'text-right' },
  // 검차 리포트 한 건당 무는 값 — 리포트가 붙은 차는 저절로 켜지고, 손으로 끌 수 있다
  { key: 'carvior', label: '카비어 수수료', align: 'text-center' },
  { key: 'grandTotal', label: '총비용', align: 'text-right' },
  { key: 'vehicleCost', label: '차량비용(원)', align: 'text-right', headClass: 'text-sky-600' },
  { key: 'totalWon', label: '총합계(원)', align: 'text-right', headClass: 'text-sky-600' },
  { key: 'salePrice', label: '차량판매가', align: 'text-right', headClass: 'text-emerald-600' },
  /*
    어떻게 팔렸나 — 수출·알선·타 딜러·우리 딜러.

    얼마에 샀고 얼마에 팔았는지만 있고 어느 길로 나갔는지는 없었다. 그런데 그게 돈이
    어디로 갔는지를 가른다 — 남의 딜러가 팔아 준 차는 우리 딜러가 정산을 안 받는다.

    따로 적는 칸은 안 만든다. 정산 종류와 상담 종류로 이미 알 수 있다.
  */
  { key: 'soldChannel', label: '판매 경로', align: 'text-center', title: '정산·상담에 적힌 것으로 가려냅니다 — 따로 적지 않습니다' },
  // 상사 정산서 맨 아래 숫자 — 적힌 건은 판매수익을 이걸로 낸다
  {
    key: 'payoutAmount',
    label: '실제지급액',
    align: 'text-right',
    headClass: 'text-emerald-600',
    title: '상사 정산서 맨 아래 금액. 적으면 판매수익을 이 금액으로 냅니다 — 매입가·재고 금융·세금은 상사가 이미 뺀 뒤입니다',
  },
  // 매도정산 — 차장·본부장만 보인다. 그 밖의 사람에게는 열 자체를 안 그린다
  { key: 'share', label: '매도정산', align: 'text-right' },
  {
    key: 'profit',
    label: '판매수익',
    align: 'text-right',
    headClass: 'text-emerald-600',
    title: '차량판매가 − 총합계 (세금은 상사 정산에서 이미 떼고 들어옵니다)',
  },
  /*
    정산금액은 판매수익 바로 오른쪽이다.

    예전에는 총비용 옆에 있었다. 그런데 이 둘은 나란히 놓고 견주는 값이다 — 그 차에서
    남은 돈과, 실제로 정산해 받을 돈. 떨어져 있으면 가로로 스무 칸을 건너가며 본다.
  */
  { key: 'settlementAmount', label: '정산금액', align: 'text-right' },
  { key: 'owner', label: '담당자' },
  { key: 'contract', label: '계약서', align: 'text-center' },
  { key: 'stage', label: '결재' },
  { key: 'status', label: '상태' },
  { key: 'actions', label: '관리', align: 'text-right' },
];

/**
 * 계약팀 인센티브.
 *
 * 그 달에 결재까지 끝난 건이 스무 건을 넘으면, 그 **넘는 만큼**만 건당 1만 원이 붙는다.
 * 스무 건까지는 0원이다 — 서른일곱 건이면 열일곱 건치, 17만 원이다.
 *
 * 전체 건수에 곱하지 않는다. 스무 건을 채우는 순간 앞의 스무 건까지 같이 값이 붙어서,
 * 열아홉 건과 스무 건 사이에서 돈이 스무 배로 뛴다.
 *
 * 올려만 두고 승인이 안 난 건은 안 센다 — 끝까지 간 것만 일한 것으로 본다.
 */
/**
 * 본부장 월급 — 정산받을 금액에 같이 붙는다.
 *
 * 한 사람 한 금액이라 적어 둘 칸을 만들지 않았다. 바뀌면 이 줄만 고친다.
 * 이름으로 못 박는다 — 직급으로 가리면 본부장이 하나 더 생겼을 때 같이 붙는다.
 */
const CHIEF_SALARY = { name: '안원용', amount: 2_000_000 };

/** 건당정산을 받는 자리 — 이 팀만 줄마다 적은 '정산금액'이 받을 돈이 된다 */
const CONTRACT_TEAM = '계약팀';

const PURCHASE_BONUS_MIN = 20;
const PURCHASE_BONUS_PER_CASE = 10_000;

/** 그 달 한 사람 식대 — 서버가 달·사람으로 한 줄씩 들고 있다 */
interface MealRow {
  month: string;
  employeeId: string;
  amount: number;
  writer: string;
}

export default function PurchaseSettlementTab({ role, focus }: Props) {
  const { state, deletePurchaseSettlement, refresh } = useStore();
  /** 표를 잡고 끌어서 옆으로 넘긴다 — 칸이 스무 개가 넘어 화면 밖으로 나간다 */
  const dragRef = useDragScroll<HTMLDivElement>();
  /* 차량번호 → 어떻게 팔렸나. 제시 금융과 같은 자를 쓴다(lib/useSoldChannels) */
  const soldChannelOf = useSoldChannels();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | 'all'>('all');
  /** 이번 달부터 본다. 지난 달 것까지 한 화면에 쌓이면 지금 처리할 게 안 보인다. */
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [allMonths, setAllMonths] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [query, setQuery] = useState('');
  /*
    다른 화면에서 들고 온 차만 본다.

    매입 관리에서 "판매가 열아홉 대 안 적음"을 누르면 그 열아홉 대를 들고 온다. 번호만
    적어 주고 끝내면 받는 사람이 백 줄짜리 표에서 하나씩 찾아야 한다 — 찾는 동안 무엇을
    찾고 있었는지를 잊는다.

    해제할 수 있게 둔다. 걸러 둔 줄만 보이면 옆 차와 견줘 볼 수가 없다.
  */
  const [onlyFocused, setOnlyFocused] = useState(!!focus?.plates?.length);
  const focusSet = useMemo(
    () => new Set((focus?.plates ?? []).map(p => p.replace(/\s+/g, ''))),
    [focus],
  );
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

  /*
    승인이 찍혀 잠긴 줄도 고칠 수 있는 자리.

    모르고 찍어 버린 건이 생기는데, 되돌릴 사람이 아무도 없으면 그 줄은 영영 틀린 채로
    남는다. 테스트 계정 하나만 연다 — 서버도 같은 기준으로 다시 본다(approvers.ts).
  */
  const canBreakLock = me?.name === '테스트관리자' || (me?.position ?? '').includes('테스트');
  const lockedFor = (s: PurchaseSettlement) => !!s.locked && !canBreakLock;
  /* 판금집 청구서 넣는 창 */
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [vatOpen, setVatOpen] = useState(false);
  const approverRole: 'CHIEF' | 'CEO' | null =
    me?.name === '안원용' ? 'CHIEF' : me?.name === '유진욱' ? 'CEO' : null;
  const seesAll = canSeeAllSettlements({ role }, myDepartment, me?.name, me?.position);
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

  /*
    되돌리기 — 누가 어느 자리에서 누를 수 있는가.

    본부장은 자기 차례(올라옴)와 자기가 찍은 뒤, 대표는 자기 차례와 찍은 뒤다.
    서버가 같은 규칙을 다시 본다(settlements.service.ts revokeStep) — 여기서는 버튼만 가린다.
  */
  const myTurn = (stage?: string, chiefRequired?: boolean) =>
    approverRole === 'CHIEF'
      ? stage === 'SUBMITTED' && chiefRequired !== false
      : stage === 'CHIEF' || (stage === 'SUBMITTED' && chiefRequired === false);

  const stamped = (stage?: string) =>
    approverRole === 'CHIEF' ? stage === 'CHIEF' : stage === 'DONE';

  const canUndo = (s: { stage?: string; chiefRequired?: boolean }) =>
    !!approverRole && (myTurn(s.stage, s.chiefRequired) || stamped(s.stage));

  /** 이미 찍은 걸 되돌리는 것과 안 찍고 돌려보내는 것 — 말만 다르고 가는 곳은 같다 */
  const undoLabel = (s: { stage?: string }) => (stamped(s.stage) ? '승인 취소' : '반려');

  const undoHint = (s: { chiefRequired?: boolean }) =>
    approverRole === 'CEO' && s.chiefRequired !== false
      ? '본부장에게 돌려보냅니다 — 본부장 승인도 같이 풀립니다'
      : '담당자에게 돌려보냅니다 — 고쳐서 다시 올려야 합니다';

  /** 결재 한 걸음. 서버가 순서와 자격을 다시 본다 — 여기서는 버튼만 가린다. */
  const step = async (s: PurchaseSettlement, action: 'submit' | 'approve' | 'revoke') => {
    try {
      await api(`/settlements/purchase/${s.id}/${action}`, { method: 'POST' });
      await refresh();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /*
    보는 사람에 따라 열이 조금 다르다.

    차장·본부장은 이 표에서 매도정산을 한다 — 계약서 칸이 그들에게는 매도정산 자리고,
    배분(신차 30% / 개인 50%) 칸이 하나 더 붙는다. 계약팀에게는 예전 그대로 계약서다.

    매입팀 김진후 팀장도 그 칸을 본다. 사 온 차가 신차로 갔는지 개인으로 갔는지를
    봐야 하는데, 그 칸이 이 표에만 있어서 확인할 데가 없었다 — 이름을 lib/permissions
    한 곳에 모아 둔다(서버도 같은 목록을 다시 본다).
  */
  const seesShare = SETTLEMENT_VIEWERS.includes((me?.name ?? '').trim());

  /*
    판매수익은 아무나 보는 값이 아니다.

    그 차에서 회사에 얼마가 남았는지다 — 경영 숫자지 계약팀이 일하는 데 필요한 값이
    아니다. 계약팀은 비용과 정산금액을 적는 자리고, 남는 돈은 적는 일과 상관이 없다.

    그런데 담당자 칩에까지 '수익 126만' 이 붙어서, 계약팀 사람에게 남의 차 순익이
    줄줄이 보였다. 더구나 그 수익은 그 사람이 번 돈도 아니다 — 정산을 적어 올린
    사람일 뿐이다. 보이면 자기 실적으로 읽힌다.

    대표와, 매도정산을 하는 두 사람만 본다.
  */
  const seesProfit = role === 'ADMIN' || seesShare;

  const columns = useMemo(
    () =>
      COLUMNS.filter(c => (c.key !== 'share' || seesShare) && (c.key !== 'profit' || seesProfit)).map(c =>
        c.key === 'contract' && seesShare ? { ...c, label: '매도정산' } : c,
      ),
    [seesShare, seesProfit],
  );

  /* 제목줄을 끌어 열 순서를 바꾼다 — 화면마다 같은 방식이다 */
  const cols = useColumnOrder('purchaseSettlementColOrder', columns, { dense: true });

  const filtered = scoped
    .filter(s => allMonths || s.date.startsWith(month))
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => !seesAll || employeeFilter === 'all' || s.employeeId === employeeFilter)
    .filter(s => !onlyFocused || focusSet.size === 0 || focusSet.has(s.vehicleNumber.replace(/\s+/g, '')))
    .filter(s => !query.trim() || s.vehicleNumber.includes(query.trim()) || s.vehicleName.includes(query.trim()))
    .sort((a, b) => b.date.localeCompare(a.date));


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
    s.grandTotal ??
    // 실제지급액을 적었으면 이전비는 안 더한다 — 상사가 먼저 뗀 돈이다
    purchaseGrandTotal(
      s.purchasePrice,
      prepTotalOf(s),
      s.transferFee,
      s.brokerFee,
      s.platformFee ?? 0,
      s.payoutAmount ?? 0,
      carviorFeeOf(s.carvior, s.hasReport ?? false),
    );
  /** 최종 합계(원). 서버 값이 없으면 화면에서 같은 식으로 계산한다. */
  const totalWonOf = (s: PurchaseSettlement) => s.grandTotalWon ?? grandTotalOf(s) + costOf(s).total;
  // 서버가 계산해 주지만, 목록을 손에서 고치는 동안에는 없을 수 있어 같은 식으로 다시 낸다.
  const profitOf = (s: PurchaseSettlement) =>
    s.saleProfit ?? saleProfit(s.salePrice, totalWonOf(s), s.payoutAmount ?? 0, s.purchasePrice);

  /*
    담당자 칩.

    이름을 목록에서 골라 고르게 하면 누가 있는지 펼쳐 봐야 알고, 각자 몇 건인지는 아예
    안 보인다. 알선 정산처럼 얼굴을 늘어놓고 눌러서 고른다.

    승인까지 간 건수를 같이 센다. 그 달에 결재가 끝난 건이 스무 건을 넘으면 건당 2만 원이
    붙는다 — 적다 만 건이나 올려만 둔 건은 안 센다. 끝까지 간 것만 일한 것으로 본다.
  */
  const owners = useMemo(() => {
    const month = filtered;
    const counted = new Map<string, { count: number; done: number; profit: number; sold: number; fee: number }>();
    for (const s of month) {
      const prev = counted.get(s.employeeId) ?? { count: 0, done: 0, profit: 0, sold: 0, fee: 0 };
      counted.set(s.employeeId, {
        count: prev.count + 1,
        done: prev.done + (s.stage === 'DONE' ? 1 : 0),
        // 아직 안 판 차는 빼고 센다 — 판매가가 0이면 총비용만큼 적자로 잡힌다
        profit: prev.profit + (s.salePrice > 0 ? profitOf(s) : 0),
        sold: prev.sold + (s.salePrice > 0 ? 1 : 0),
        fee: prev.fee + (s.settlementAmount ?? 0),
      });
    }
    return state.employees
      .filter(e => e.active !== false && (e.department === CONTRACT_TEAM || counted.has(e.id)))
      .map(e => {
        const c = counted.get(e.id) ?? { count: 0, done: 0, profit: 0, sold: 0, fee: 0 };
        return {
          employee: e,
          ...c,
          /** 승인 스무 건을 넘기면 건당 2만 원 */
          /** 스무 건을 넘는 만큼만 센다 */
          bonus: Math.max(0, c.done - PURCHASE_BONUS_MIN) * PURCHASE_BONUS_PER_CASE,
          /*
            계약팀 건당정산.

            계약팀은 차 한 대를 맡을 때마다 정해진 돈을 받는다 — 줄마다 '정산금액' 칸에
            그 돈을 적어 둔다(박예나 15,000 · 이금미 10,000). 적어는 두는데 어디에도
            안 더해져서 '정산받을 금액'이 0원으로 떴다.

            계약팀 것만 센다. 다른 자리에서는 이 칸이 그 차 총비용으로 채워진다 —
            같이 더하면 차 값이 사람이 받아 갈 돈으로 둔갑한다.
          */
          fee: e.department === CONTRACT_TEAM ? c.fee : 0,
        };
      })
      .sort((a, b) => b.done - a.done || b.count - a.count || a.employee.name.localeCompare(b.employee.name));
  }, [filtered, state.employees]);

  /*
    식대.

    이우주 차장과 안원용 본부장 두 사람은 정산금액에 식대가 같이 붙는다. 차 한 대에
    붙는 값이 아니라 달마다 한 번 적는 값이라 줄에 넣지 않고 카드로 둔다 — 줄에 넣으면
    어느 차에 붙일지부터 정해야 하는데 그건 뜻이 없는 질문이다.

    대표는 둘 다 보고 고치고, 본인은 자기 것만 본다. 계약팀이 다 보는 자리에 두지
    않는다 — 서버도 같은 기준으로 다시 본다.
  */
  const mealPeople = useMemo(() => {
    const named = state.employees.filter(e => SETTLEMENT_VIEWERS.includes(e.name.trim()));
    const mine = role === 'ADMIN' ? named : named.filter(e => e.id === state.currentEmployeeId);
    /*
      담당자 칩을 누르면 카드도 그 사람 것만 남는다.

      표는 걸러졌는데 식대와 월급은 두 사람 것이 그대로 떠 있었다. 이우주 차장을 눌러
      놓고 안원용 본부장 월급을 보고 있으면, 합계가 무엇을 더한 값인지 알 수가 없다.
    */
    return employeeFilter === 'all' ? mine : mine.filter(e => e.id === employeeFilter);
  }, [state.employees, role, state.currentEmployeeId, employeeFilter]);

  const seesMeal = mealPeople.length > 0;
  const [meals, setMeals] = useState<MealRow[]>([]);

  const loadMeals = useCallback(async () => {
    if (!seesMeal) return;
    try {
      setMeals(await api<MealRow[]>('/settlements/purchase/meal'));
    } catch {
      // 못 불러와도 표는 그대로 보여준다 — 식대만 0으로 남는다
    }
  }, [seesMeal]);

  useEffect(() => {
    void loadMeals();
  }, [loadMeals]);

  /** 지금 보고 있는 달(또는 전체 기간)의 식대 — 내가 볼 수 있는 사람 것만 더한다 */
  const mealOf = (employeeId: string) =>
    meals
      .filter(m => m.employeeId === employeeId && (allMonths || m.month === month))
      .reduce((sum, m) => sum + m.amount, 0);
  const mealTotal = mealPeople.reduce((sum, p) => sum + mealOf(p.id), 0);

  /*
    본부장 월급.

    안원용 본부장은 매도정산과 식대 말고 월급이 같이 붙는다. 달마다 같은 금액이라
    적어 둘 칸을 만들지 않고 여기 한 줄로 둔다 — 바뀌면 이 줄만 고친다.

    전체 기간을 보고 있을 때는 안 더한다. 달마다 한 번 붙는 돈이라 몇 달치인지가
    정해지지 않으면 더할 수가 없다.
  */
  const salaryPerson = mealPeople.find(p => p.name.trim() === CHIEF_SALARY.name);
  const salaryTotal = !allMonths && salaryPerson ? CHIEF_SALARY.amount : 0;


  /**
   * 차량판매가를 표에서 바로 적는다.
   *
   * 알선·수출 정산이 있는 차는 그쪽을 저장할 때 따라오지만, 우리가 직접 판 차는 따라올
   * 데가 없다. 적을 자리를 표에 두지 않으면 줄마다 수정 창을 열어야 한다.
   */
  const saveSalePrice = async (row: PurchaseSettlement, amount: number) => {
    try {
      await api(`/settlements/purchase/${row.id}`, { method: 'PATCH', body: { salePrice: amount } });
      await refresh();
    } catch (e) {
      void alertError('차량판매가를 적지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 카비어 수수료를 켜고 끈다.
   *
   * 리포트와 같은 쪽으로 맞추면 '리포트 따라감'(null)으로 되돌린다 — 손으로 건드린
   * 표를 남겨 두면, 나중에 리포트가 붙어도 꺼진 채로 남는다.
   */
  const toggleCarvior = async (row: PurchaseSettlement, on: boolean) => {
    const back = on === (row.hasReport ?? false);
    try {
      await api(`/settlements/purchase/${row.id}`, { method: 'PATCH', body: { carvior: back ? null : on } });
      await refresh();
    } catch (e) {
      void alertError('카비어 수수료를 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const saveMeal = async (employeeId: string, amount: number) => {
    try {
      setMeals(await api<MealRow[]>('/settlements/purchase/meal', {
        method: 'POST',
        body: { month, employeeId, amount },
      }));
    } catch (e) {
      void alertError('식대를 적지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 매도정산 배분을 정한다 — 신차냐 개인이냐.
   *
   * 같은 걸 다시 누르면 지운다(안 정한 것으로 되돌린다). 잘못 눌렀을 때 되돌릴 자리가
   * 없으면 지우려고 정산을 열어야 한다.
   */
  const setShare = async (s: PurchaseSettlement, key: string) => {
    try {
      await api(`/settlements/purchase/${s.id}`, {
        method: 'PATCH',
        body: { profitShare: s.profitShare === key ? '' : key },
      });
      await refresh();
    } catch (e) {
      void alertError('매도정산을 정하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 차를 며칠 들고 있었나 — 제시일자부터 센다.
   *
   * 판 차는 판 날까지, 아직 안 판 차는 오늘까지 센다. 안 판 차는 지금도 늘고 있는
   * 숫자라서, 오래 들고 있는 차가 눈에 띄어야 한다.
   */
  const stockDays = (s: PurchaseSettlement) => {
    if (!s.intakeDate) return 0;
    const end = s.salePrice > 0 ? dayjs(s.date) : dayjs();
    return Math.max(0, end.diff(dayjs(s.intakeDate), 'day'));
  };

  /**
   * 정산완료 — 이미 받은 건으로 표시한다.
   *
   * 줄을 지우지 않는다. 지우면 그 차가 얼마였는지가 같이 사라져서, 다음 달에 "이 차
   * 정산했던가"를 다시 묻게 된다. 표시만 남기고 합계에서 뺀다.
   */
  const setSharePaid = async (s: PurchaseSettlement, paid: boolean) => {
    try {
      await api(`/settlements/purchase/${s.id}`, { method: 'PATCH', body: { profitSharePaid: paid } });
      await refresh();
    } catch (e) {
      void alertError('정산완료를 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /** 그 사람이 가져가는 몫 합계 — 판 차만, 아직 안 받은 것만 센다 */
  const shareTotal = filtered.reduce((sum, s) => sum + (s.profitSharePaid ? 0 : s.shareAmount ?? 0), 0);
  /** 이미 받은 몫 — 얼마를 받았는지도 보여야 한다 */
  const sharePaidTotal = filtered.reduce((sum, s) => sum + (s.profitSharePaid ? s.shareAmount ?? 0 : 0), 0);

  /**
   * 정산받을 금액 — 지금 보고 있는 사람이 받아 갈 돈.
   *
   * 받는 길이 자리마다 다르다. 계약팀은 결재를 끝낸 건수로 인센티브를 받고, 차장·본부장은
   * 매도정산과 식대를 받는다(본부장은 월급도 여기 붙는다).
   *
   * 무엇이 더해졌는지 조각을 같이 돌려준다. 합계만 띄우면 "이 돈이 어디서 나왔냐"를
   * 매달 다시 묻게 된다.
   */
  const payout = useMemo(() => {
    const mine = owners.filter(o => employeeFilter === 'all' || o.employee.id === employeeFilter);
    const bonus = mine.reduce((sum, o) => sum + o.bonus, 0);
    // 계약팀이 줄마다 적어 둔 건당 정산 — owners 가 계약팀 것만 모아 둔다
    const fee = mine.reduce((sum, o) => sum + o.fee, 0);

    const parts: string[] = [];
    if (shareTotal > 0) parts.push(`매도정산 ${MAN(shareTotal)}`);
    if (mealTotal > 0) parts.push(`식대 ${MAN(mealTotal)}`);
    if (salaryTotal > 0) parts.push(`월급 ${MAN(salaryTotal)}`);
    if (fee > 0) parts.push(`건당정산 ${MAN(fee)}`);
    if (bonus > 0) parts.push(`인센티브 ${MAN(bonus)}`);

    return { total: shareTotal + mealTotal + salaryTotal + bonus + fee, parts };
  }, [owners, employeeFilter, shareTotal, mealTotal, salaryTotal]);


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
    /** 헤이딜러·엔카 경매장에 낸 수수료 — 직접 사온 차는 0이라 합계가 곧 플랫폼으로 산 값이다 */
    platform: filtered.reduce((sum, s) => sum + (s.platformFee ?? 0), 0),
    platformCount: filtered.filter(s => (s.platformFee ?? 0) > 0).length,
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
      '판매 경로': SOLD_CHANNEL_LABEL[soldChannelOf(s.vehicleNumber)],
      '이전비+추가이전비(원)': s.transferFee,
      '매입가(원)': s.purchasePrice,
      // 항목별 합계 6칸 — 업체별 세부는 '상품화 명세' 열에 풀어 쓴다.
      ...Object.fromEntries(PREP_COST_KINDS.map(k => [`${PREP_COST_LABEL[k]}(원)`, breakdownOf(s)[k]])),
      '구전(원)': s.brokerFee,
      '플랫폼 수수료(원)': s.platformFee ?? 0,
      '카비어 수수료(원)': carviorFeeOf(s.carvior, s.hasReport ?? false),
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
      '실제지급액(원)': s.payoutAmount ?? 0,
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

      {/*
        정산 전에 아직 안 채워진 것 — 입고일자·판매완료·실제지급액·계약서·결재.

        한 군데가 비면 정산이 멈추는데, 멈춘 줄은 표 수백 줄 어딘가에 섞여 있어 아무도
        못 본다. 다 채워진 달에는 아무것도 안 그린다.
      */}
      {seesAll && (
        <MissingInputPanel
          rows={filtered}
          onOpen={s => {
            setEditing(s);
            setFormOpen(true);
          }}
        />
      )}

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

      <div
        className={`mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 ${
          [seesMeal, seesShare, !!salaryPerson].filter(Boolean).length >= 2
            ? 'lg:grid-cols-9'
            : seesMeal || seesShare || salaryPerson
              ? 'lg:grid-cols-8'
              : 'lg:grid-cols-7'
        }`}
      >
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
        {/* 매도정산 — 그 사람이 이 달에 가져가는 몫. 안 정한 건은 안 들어간다 */}
        {seesShare && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2">
            <p className="text-xs font-medium text-indigo-700/80">매도정산</p>
            <p className="text-xl font-bold text-indigo-700">
              {MAN(shareTotal)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
            </p>
            <p className="text-[10px] text-slate-400">
              신차 30% · 개인 50% · {filtered.filter(s => (s.shareAmount ?? 0) > 0 && !s.profitSharePaid).length}대
              {sharePaidTotal > 0 && (
                <>
                  {' · '}
                  <span className="text-rose-500">받음 {MAN(sharePaidTotal)}</span>
                </>
              )}
            </p>
          </div>
        )}
        {/* 본부장 월급 — 달마다 같은 금액이라 적는 칸 없이 붙는다 */}
        {salaryPerson && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2">
            <p className="text-xs font-medium text-indigo-700/80">월급</p>
            <p className="text-xl font-bold text-indigo-700">
              {MAN(allMonths ? CHIEF_SALARY.amount : salaryTotal)}
              <span className="ml-1 text-sm font-medium text-slate-400">원</span>
            </p>
            <p className="text-[10px] text-slate-400">
              {salaryPerson.name} · {allMonths ? '달을 고르면 더합니다' : `${dayjs(month).format('M월')} 한 달치`}
            </p>
          </div>
        )}
        {/*
          식대 — 정산금액 바로 왼쪽이다. 아래 정산금액 합계에 이 값이 더해져 있어서,
          두 숫자가 떨어져 있으면 어디서 더해진 건지 알 수가 없다.
        */}
        {seesMeal && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2">
            <p className="text-xs font-medium text-indigo-700/80">식대</p>
            <p className="text-xl font-bold text-indigo-700">
              {MAN(mealTotal)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
            </p>
            {allMonths ? (
              <p className="text-[10px] text-slate-400">달을 고르면 적을 수 있습니다</p>
            ) : (
              <div className="mt-1 space-y-0.5">
                {mealPeople.map(p => (
                  <MealInput
                    key={p.id}
                    name={p.name}
                    amount={mealOf(p.id)}
                    onSave={next => void saveMeal(p.id, next)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {/*
          정산받을 금액 — 사람이 받아 갈 돈.

          예전에는 '정산금액 합계'였다. 그런데 그건 차 한 대씩의 정산금액(총비용)을 더한
          값이라, 계약팀을 골라 놓고 천팔백만원이 떠 있었다 — 받을 돈이 아니라 차에 들어간
          돈이다. 사람을 고르고 보는 자리이므로 그 사람이 받아 갈 돈으로 바꾼다.

          받는 길이 자리마다 다르다. 계약팀은 차 한 대를 맡을 때마다 줄에 적어 둔 건당
          정산을 받고(결재를 스무 건 넘게 끝내면 인센티브가 더 붙는다), 차장·본부장은
          매도정산과 식대(그리고 월급)를 받는다. 무엇이 더해졌는지 아래에 적는다 —
          숫자만 보면 아무도 못 맞춰 본다.
        */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">정산받을 금액</p>
          <p className="text-xl font-bold text-indigo-600">
            {MAN(payout.total)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {payout.parts.length > 0 ? (
            <p className="text-[10px] text-slate-400">{payout.parts.join(' + ')}</p>
          ) : (
            <p className="text-[10px] text-slate-400">
              {employeeFilter === 'all' ? '담당자를 누르면 그 사람 것만 봅니다' : '이 달에 받을 것이 없습니다'}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">차량비용 합계</p>
          <p className="text-xl font-bold text-sky-600">{NUM(totals.vehicleCost)}<span className="ml-1 text-sm font-medium text-slate-400">원</span></p>
          <p className="text-[10px] text-slate-400">주유·배터리·주차·세차·수리 자동 반영</p>
        </div>
        {/* 헤이딜러·엔카 경매장에서 사온 차에 붙는 돈 */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-slate-400">플랫폼 수수료</p>
          <p className="text-xl font-bold text-violet-700">
            {MAN(totals.platform)}<span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[10px] text-slate-400">{totals.count}건 중 {totals.platformCount}건</p>
        </div>
        {/* 담당자 칩을 누르면 그 사람이 판 차만 더해진다. 회사에 남는 돈이라 대표만 본다 */}
        {seesProfit && (
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
        )}
        {/* 대표가 아닌 사람에게는 몇 대 팔렸는지까지만 보여준다 */}
        {!seesProfit && (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-slate-400">판매 대수</p>
            <p className="text-xl font-bold text-emerald-700">
              {totals.sold}<span className="ml-1 text-sm font-medium text-slate-400">대</span>
            </p>
            <p className="text-[10px] text-slate-400">{totals.count}건 중</p>
          </div>
        )}
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
          {owners.map(({ employee, count, done, bonus, fee, profit, sold }) => (
            <button
              key={employee.id}
              onClick={() => setEmployeeFilter(v => (v === employee.id ? 'all' : employee.id))}
              title={`${employee.name} ${employee.position} · ${count}건 중 결재완료 ${done}건 · ${sold}대 판매${
                seesProfit ? `, 판매수익 ${NUM(profit)}원` : ''
              }${
                bonus > 0
                  ? ` · 인센티브 ${NUM(bonus)}원 (${PURCHASE_BONUS_MIN}건 넘는 ${done - PURCHASE_BONUS_MIN}건치)`
                  : ` · 결재완료 ${PURCHASE_BONUS_MIN}건을 넘으면 넘는 만큼 건당 ${NUM(PURCHASE_BONUS_PER_CASE)}원`
              }${fee > 0 ? ` · 건당정산 ${NUM(fee)}원 (줄마다 적어 둔 정산금액 합계)` : ''}`}
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
              {/* 판 대수는 일한 양이라 다 보고, 남은 돈은 대표만 본다 */}
              {sold > 0 &&
                (seesProfit ? (
                  <span className={`text-[11px] font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    수익 {MAN(profit)}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">판매 {sold}</span>
                ))}
              {/* 계약팀이 줄마다 적어 둔 건당 정산 — 그 달에 받아 갈 돈이다 */}
              {fee > 0 && (
                <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  +{NUM(fee)}
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
        {focusSet.size > 0 && (
          <button
            onClick={() => setOnlyFocused(v => !v)}
            title={onlyFocused ? '눌러서 전체를 봅니다' : '눌러서 들고 온 차만 봅니다'}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              onlyFocused ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {focus?.label ?? '들고 온 차'} {focusSet.size}대{onlyFocused ? ' 만 보는 중 · 해제' : ' 만 보기'}
          </button>
        )}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="차량번호·차량명 검색"
          className={`w-52 ${PLATE_SEARCH_CLASS}`} />
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
            onSelect: lockedFor(s) ? undefined : () => { setEditing(s); setFormOpen(true); },
          }))}
        />
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        {/*
          세로로도 옆으로도 이 안에서만 구른다.

          정산이 백 줄이 넘는 달이 있는데, 그때 제목줄이 화면 위로 올라가 버리면 지금
          보는 숫자가 매입가인지 정산금액인지 세어 가며 읽게 된다. 제목줄을 붙여 둔다.
        */}
        {/* 표가 화면 밖으로 한참 나간다 — 아무 데나 잡고 끌어서 옆으로 넘긴다 */}
        <div ref={dragRef} className="max-h-[70vh] overflow-auto">
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
                /*
                  이미 받은 건은 연한 빨강으로 깔고 줄을 긋는다.

                  글자는 그대로 읽혀야 한다 — 얼마짜리 차였는지 다시 볼 일이 있어서
                  지우지 않고 표시만 남기는 것이다. 그래서 진한 색이 아니라 파스텔이다.
                */
                /*
                  줄을 누르면 수정 창이 뜬다.

                  칸이 스물이 넘어 [수정] 단추는 맨 오른쪽 끝에 있다 — 왼쪽 끝 일자를
                  보고 고치러 가려면 화면을 옆으로 끝까지 밀어야 했다.

                  단추·입력칸 위에서 누른 건 그 자리 일로 둔다. 차량판매가를 치려다,
                  매도정산을 찍으려다 창이 뜨면 안 된다. 승인이 찍혀 잠긴 줄은 안 연다.
                */
                <tr
                  key={s.id}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('button, input, select, a, label')) return;
                    if (lockedFor(s)) return;
                    setEditing(s);
                    setFormOpen(true);
                  }}
                  title={lockedFor(s) ? '승인된 정산은 고칠 수 없습니다' : '눌러서 고칩니다'}
                  className={`border-b border-slate-50 last:border-0 ${lockedFor(s) ? '' : 'cursor-pointer'} ${
                    s.profitSharePaid
                      ? 'bg-rose-50 text-slate-500 line-through decoration-rose-300 hover:bg-rose-100/70'
                      : 'hover:bg-indigo-50/40'
                  }`}
                >
                  {cols.cells({
                    /*
                      아직 안 판 차는 출고일자를 비워 둔다.

                      매입관리에서 정산 줄이 만들어질 때 이 날짜에는 매입일이 들어간다.
                      그걸 그대로 출고일자로 적어 두면 "들어온 날과 나간 날이 같은데 재고는
                      이레"처럼 읽힌다 — 실은 아직 안 나간 차다.
                    */
                    date:
                      s.salePrice > 0 ? (
                        <span className="text-slate-600">{dayjs(s.date).format('M/D')}</span>
                      ) : (
                        <span className="text-slate-300" title="아직 안 판 차입니다 — 차량판매가를 적으면 출고일자가 찍힙니다">
                          —
                        </span>
                      ),
                    /*
                      차가 들어온 날과, 그날부터 센 재고일수.

                      판 차는 판 날까지, 아직 안 판 차는 오늘까지 센다 — 안 판 차는 지금도
                      늘고 있는 숫자다. 오래 들고 있는 차가 눈에 띄어야 한다.
                    */
                    intakeDate: s.intakeDate ? (
                      <span className="text-slate-600">
                        {dayjs(s.intakeDate).format('YY.M.D')}
                        {/* 안 판 차는 지금도 늘고 있는 숫자다 — '이레째'로 적어 둔다 */}
                        <span
                          className={`ml-1 text-[11px] ${stockDays(s) >= 60 ? 'font-bold text-red-500' : 'text-slate-400'}`}
                          title={
                            s.salePrice > 0
                              ? '입고일부터 출고일까지'
                              : '아직 안 판 차입니다 — 입고일부터 오늘까지 세고 있습니다'
                          }
                        >
                          {stockDays(s)}일{s.salePrice > 0 ? '' : '째'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300" title="매입 관리에 이 차량번호의 매입 기록이 없습니다(재고 금융의 제시일자도 비어 있습니다)">
                        —
                      </span>
                    ),
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
                    // 헤이딜러·엔카 경매장에서 사온 차만 값이 있다 — 0은 흐리게 둔다
                    platformFee: (
                      <span className={(s.platformFee ?? 0) > 0 ? 'font-semibold text-violet-700' : 'text-slate-300'}>
                        {(s.platformFee ?? 0) > 0 ? MAN(s.platformFee) : '—'}
                      </span>
                    ),
                    /*
                      카비어 수수료 — 여기서 바로 켜고 끈다.

                      줄을 눌러 창을 열지 않아도 되게 표에 체크를 둔다. 한 달에 수십
                      건을 훑으며 켜고 끄는 자리라, 창을 열었다 닫는 품이 쌓인다.

                      리포트가 붙은 차는 저절로 켜져 있다(점). 손으로 건드린 건은
                      그 값이 이긴다 — 되돌리려면 체크를 리포트와 같은 쪽으로 맞춘다.
                    */
                    carvior: (
                      <label
                        className="inline-flex cursor-pointer items-center gap-1"
                        title={
                          s.hasReport
                            ? '검차 리포트가 붙은 차입니다 — 기본으로 뭅니다'
                            : '검차 리포트가 없는 차입니다 — 체크하면 뭅니다'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={s.carviorOn ?? false}
                          onChange={e => void toggleCarvior(s, e.target.checked)}
                          className="size-3.5 accent-indigo-600"
                        />
                        <span className={s.carviorOn ? 'font-semibold text-indigo-700' : 'text-slate-300'}>
                          {s.carviorOn ? MAN(s.carviorFee ?? CARVIOR_FEE) : '—'}
                        </span>
                        {/* 리포트가 붙은 차라는 표 — 왜 저절로 켜졌는지가 보여야 한다 */}
                        {s.hasReport && <span className="text-[10px] text-slate-400">리포트</span>}
                      </label>
                    ),
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
                    /*
                      차량판매가는 표에서 바로 적는다.

                      알선·수출 정산이 있는 차는 저장할 때 저절로 따라오지만, 우리가 직접
                      판 차는 따라올 데가 없어 손으로 적어야 한다. 그걸 적자고 줄마다
                      수정 창을 열고 닫게 두면, 스무 대를 적는 데 창을 마흔 번 여닫는다.

                      승인이 찍힌 줄도 이 칸만은 연다.

                      결재가 지키는 건 우리가 얼마를 들였느냐다 — 매입가·상품화 비용·
                      이전비가 그것이고, 본부장과 대표가 보고 찍은 것도 그 숫자다.
                      차량판매가는 그 뒤에 차가 팔려야 생기는 값이라 찍을 때 있지도 않았다.

                      막아 두니 9월에 결재가 끝난 차가 10월에 팔리면 판매가를 영영 못
                      적었다 — 결재된 110건 중 91건이 빈칸이고 그 줄의 판매수익은 거짓이다.
                      나머지 칸은 그대로 잠겨 있다(서버도 같은 기준으로 다시 본다).
                    */
                    salePrice: (
                      <MoneyCell
                        amount={s.salePrice}
                        onSave={next => void saveSalePrice(s, next)}
                        title={
                          s.locked
                            ? '차량판매가 — 결재된 줄이지만 이 칸은 적을 수 있습니다(판 뒤에 생기는 값입니다)'
                            : '차량판매가 — 적으면 바로 저장됩니다'
                        }
                      />
                    ),
                    /*
                      매도정산 — 신차 30% / 개인 50%.

                      같은 걸 다시 누르면 지운다. 안 정한 건은 0원이라 합계에 안 들어간다 —
                      정하지 않은 건을 섞어 더하면 받을 돈이 사실보다 커진다.
                    */
                    share: (
                      <div className="flex items-center justify-end gap-1">
                        {PROFIT_SHARES.map(p => (
                          <button
                            key={p.key}
                            onClick={() => void setShare(s, p.key)}
                            title={`${p.label} — 판매수익의 ${Math.round(p.rate * 100)}%`}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              s.profitShare === p.key
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                        {/* 받은 건은 눌러서 되돌릴 수 있다 — 잘못 누르는 일이 있다 */}
                        <button
                          onClick={() => void setSharePaid(s, !s.profitSharePaid)}
                          title={
                            s.profitSharePaid
                              ? '이미 받은 건입니다 — 누르면 되돌립니다'
                              : '정산을 받았으면 누릅니다. 합계에서 빠지고 줄에 빨간 줄이 그어집니다'
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            s.profitSharePaid ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          완료
                        </button>
                        <span
                          className={`ml-1 font-semibold ${
                            s.profitSharePaid
                              ? 'text-rose-400 line-through'
                              : (s.shareAmount ?? 0) > 0
                                ? 'text-indigo-700'
                                : 'text-slate-300'
                          }`}
                        >
                          {(s.shareAmount ?? 0) > 0 ? MAN(s.shareAmount ?? 0) : '—'}
                        </span>
                      </div>
                    ),
                    // 적힌 건만 값이 있다 — 적힌 줄은 판매수익이 이 금액 기준으로 나온다
                    payoutAmount: (
                      <span className={(s.payoutAmount ?? 0) > 0 ? 'font-semibold text-emerald-700' : 'text-slate-300'}>
                        {(s.payoutAmount ?? 0) > 0 ? MAN(s.payoutAmount ?? 0) : '—'}
                      </span>
                    ),
                    profit: (
                      <span
                        className="font-semibold text-emerald-700"
                        title={
                          (s.payoutAmount ?? 0) > 0
                            ? '실제지급액 − (총합계 − 매입가) · 실제지급액을 적으면 추가이전비는 총비용에서 빠집니다(상사가 먼저 뗀 금액입니다)'
                            : '차량판매가 − 총합계'
                        }
                      >
                        {MAN(profitOf(s))}
                      </span>
                    ),
                    soldChannel: (() => {
                      const how = soldChannelOf(s.vehicleNumber);
                      return (
                        <span
                          className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold ${SOLD_CHANNEL_TONE[how]}`}
                          title={SOLD_CHANNEL_HINT[how]}
                        >
                          {SOLD_CHANNEL_LABEL[how]}
                        </span>
                      );
                    })(),
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
                        {/*
                          반려 — 한 단계 아래로 돌려보낸다.

                          내 차례일 때도, 이미 찍은 뒤에도 같은 버튼이다. 누르는 사람에게는
                          둘 다 "이건 아니다, 다시"이고 가는 곳도 같다.
                        */}
                        {canUndo(s) && (
                          <button
                            onClick={() => void step(s, 'revoke')}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                            title={undoHint(s)}
                          >
                            <Undo2 size={12} /> {undoLabel(s)}
                          </button>
                        )}
                        <button
                          disabled={lockedFor(s)}
                          onClick={() => {
                            setEditing(s);
                            setFormOpen(true);
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                          title={lockedFor(s) ? '승인된 정산은 고칠 수 없습니다' : s.locked ? '승인된 정산입니다 — 테스트 계정이라 고칠 수 있습니다' : '수정'}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          disabled={lockedFor(s)}
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

/**
 * 식대 한 칸 — 이름과 금액.
 *
 * 저장 버튼을 따로 두지 않는다. 칸을 떠날 때(또는 엔터) 적는다 — 카드 안에 들어가는
 * 작은 칸이라 버튼까지 놓으면 정작 금액이 안 보인다.
 *
 * 고치는 중에는 밖에서 온 값으로 덮지 않는다. 적는 사이에 목록이 다시 와서 글자가
 * 바뀌면 적던 숫자가 날아간다.
 */
/**
 * 표 안에서 금액을 적는 칸.
 *
 * 창을 열지 않고 그 자리에서 고친다. 적고 나서 칸을 벗어나면 저장한다 — 값이 안 바뀌면
 * 아무 일도 안 한다(스무 줄을 훑어보기만 해도 스무 번 저장되면 안 된다).
 */
function MoneyCell({
  amount,
  onSave,
  title,
}: {
  amount: number;
  onSave: (next: number) => void;
  title?: string;
}) {
  const [text, setText] = useState(() => (amount > 0 ? amount.toLocaleString() : ''));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(amount > 0 ? amount.toLocaleString() : '');
  }, [amount, editing]);

  const commit = () => {
    setEditing(false);
    const next = moneyToNumber(text);
    if (next !== amount) onSave(next);
  };

  return (
    <input
      value={text}
      title={title}
      onFocus={() => setEditing(true)}
      onChange={e => setText(toMoneyValue(e.target.value))}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      placeholder="0"
      inputMode="numeric"
      className={`w-24 min-w-0 rounded border px-1.5 py-0.5 text-right text-xs outline-none ${
        amount > 0
          ? 'border-transparent bg-transparent text-slate-600 hover:border-slate-200'
          : 'border-amber-200 bg-amber-50/60 text-slate-600 placeholder:text-amber-400'
      } focus:border-emerald-400 focus:bg-white`}
    />
  );
}

function MealInput({
  name,
  amount,
  onSave,
}: {
  name: string;
  amount: number;
  onSave: (next: number) => void;
}) {
  const [text, setText] = useState(() => (amount > 0 ? amount.toLocaleString() : ''));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(amount > 0 ? amount.toLocaleString() : '');
  }, [amount, editing]);

  const commit = () => {
    setEditing(false);
    const next = moneyToNumber(text);
    if (next !== amount) onSave(next);
  };

  return (
    <label className="flex items-center gap-1">
      <span className="w-9 shrink-0 text-[10px] font-medium text-indigo-700/70">{name}</span>
      <input
        value={text}
        onFocus={() => setEditing(true)}
        onChange={e => setText(toMoneyValue(e.target.value))}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="0"
        inputMode="numeric"
        className="w-full min-w-0 rounded border border-indigo-200 bg-white px-1.5 py-0.5 text-right text-[11px] outline-none focus:border-indigo-400"
      />
    </label>
  );
}
