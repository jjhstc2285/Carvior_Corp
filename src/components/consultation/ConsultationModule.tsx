import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarDays, Copy, LineChart, List, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import {
  CONSULTATION_KIND_LABEL,
  CONSULTATION_STATUS_LABEL,
  type ConsultationKind,
  type ConsultationRecord,
  type ConsultationStatus,
  type ManagedVehicle,
} from '../../types';
import ConsultationForm from './ConsultationForm';
import PriceCheckModal from '../price/PriceCheckModal';
import CustomerHistoryModal from './CustomerHistoryModal';
import SellableVehicles from './SellableVehicles';
import CallInbox from './CallInbox';
import ConsultationDetailModal from './ConsultationDetailModal';
import VisitAssignPanel, { VisitDealerSelect, visitDealers } from './VisitAssignPanel';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { api, ApiError } from '../../lib/api';
import { conversionOf, isOfKind } from '../../lib/consultationStats';
import { ColumnResetButton, useColumnOrder, type Column } from '../table/useColumnOrder';

/** 표의 칸들 — 제목과 그리는 방법을 한 벌로 묶어야 차례를 바꿔도 값이 안 엉킨다 */
const COLUMNS: Column[] = [
  { key: 'date', label: '상담일시' },
  { key: 'platform', label: '플랫폼' },
  { key: 'vehicleNumber', label: '차량번호' },
  { key: 'vehicleName', label: '차명', nowrap: false },
  { key: 'offerDate', label: '매입날짜' },
  { key: 'customer', label: '손님번호' },
  { key: 'owner', label: '담당자' },
  { key: 'visit', label: '방문예정' },
  { key: 'visitDealer', label: '담당 딜러' },
  { key: 'status', label: '상태' },
  { key: 'content', label: '내용', nowrap: false },
  { key: 'actions', label: '관리', align: 'text-right' },
];

/**
 * 카톡으로 주고받던 양식 그대로 만들어 클립보드에 넣는다.
 * 상담을 받아 적은 뒤 그대로 붙여넣어 공유하는 흐름이라, 화면에서 옮겨 적지 않게 한다.
 */
async function copyKakao(c: ConsultationRecord) {
  const text = [
    `플랫폼: ${c.platform}`,
    `차량번호: ${c.vehicleNumber}`,
    `차명: ${c.vehicleName}`,
    `손님번호: ${c.customerPhone || c.customerName}`,
    `내용: ${c.content}`,
    // 방문 예정은 적혀 있을 때만 붙인다 — 빈 줄이 따라가면 붙여넣은 쪽이 지저분해진다.
    ...(c.visitDate || c.visitTime ? [`방문예정: ${[c.visitDate, c.visitTime].filter(Boolean).join(' ')}`] : []),
  ].join(String.fromCharCode(10));

  try {
    await navigator.clipboard.writeText(text);
    await alertSuccess('카톡 양식으로 복사했습니다', '메시지 창에 붙여넣으세요.');
  } catch {
    // 브라우저가 클립보드를 막는 경우가 있다(비보안 컨텍스트 등) — 그때는 눈으로 보고 복사하게 띄운다.
    await alertError('복사하지 못했습니다', text);
  }
}

/**
 * 출고 카톡 양식 — "12가3456 입금1000만원 동주 출고완료"
 * 이 한 줄이 카톡방에 올라가면 광고팀이 전산을 내리고 판매완료 처리를 한다.
 */
async function copyRelease(c: ConsultationRecord, staffName: string) {
  const text = [
    c.vehicleNumber,
    c.depositAmount ? `입금${c.depositAmount}만원` : '입금',
    staffName,
    '출고완료',
  ].join(' ');

  try {
    await navigator.clipboard.writeText(text);
    await alertSuccess('출고 양식으로 복사했습니다', text);
  } catch {
    await alertError('복사하지 못했습니다', text);
  }
}

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
  /** 알선 / 수출 — 같은 화면을 종류만 바꿔 쓴다 */
  kind: ConsultationKind;
}

const STATUS_COLOR: Record<ConsultationStatus, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  CONTRACTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  SOLD: 'bg-indigo-600 text-white ring-indigo-700/20',
  ON_HOLD: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CLOSED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

/**
 * 상태 보기.
 *
 * 'open' 은 종결을 뺀 나머지다. 지난 상담을 백업으로 옮겨 담으면서 종결 건이 천 단위로
 * 쌓였는데, 그걸 매번 다 그리느라 화면이 느려졌다. 종결은 찾을 일이 있을 때만 본다.
 */
type StatusView = 'open' | 'all' | ConsultationStatus;

/** 한 번에 그리는 줄 수. 넘으면 '더 보기'로 늘린다 — 천 줄을 한꺼번에 그리면 멈춘다. */
/** 상담은 알선팀이 맡는다 — 전환율은 이 팀만 센다 */
const CONSULTATION_TEAM = '알선팀';

const PAGE_SIZE = 100;

export default function ConsultationModule({ role, kind }: Props) {
  const { state, deleteConsultation, refresh } = useStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusView>('open');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState<string | null>(null);
  const [preset, setPreset] = useState<
    | {
        vehicleNumber?: string;
        vehicleName?: string;
        content?: string;
        customerPhone?: string;
        visitDate?: string;
        visitTime?: string;
      }
    | undefined
  >();
  const [editing, setEditing] = useState<ConsultationRecord | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null);
  /** 달력에서 차를 누르면 뜨는 상세 */
  const [detail, setDetail] = useState<ConsultationRecord | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => dayjs().startOf('month'));

  // 직급과 상관없이 전체 상담을 본다 — 상담을 받은 사람과 뒤를 이어받는 사람이 다르다.
  // 내 것만 보고 싶으면 담당자에서 고른다.
  const ofKind = useMemo(() => state.consultations.filter(c => isOfKind(c, kind)), [state.consultations, kind]);

  /** 종결함에 몇 건이 들어 있는지 — 버튼에 붙여 보여준다. */
  const closedCount = useMemo(() => ofKind.filter(c => c.status === 'CLOSED').length, [ofKind]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return ofKind
      .filter(c => ownerFilter === 'all' || c.employeeId === ownerFilter)
      .filter(c =>
        statusFilter === 'all' ? true : statusFilter === 'open' ? c.status !== 'CLOSED' : c.status === statusFilter,
      )
      .filter(c =>
        !q || [c.vehicleNumber, c.vehicleName, c.customerPhone, c.customerName, c.platform].some(v => v?.includes(q)),
      )
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  }, [ofKind, ownerFilter, statusFilter, query]);

  // 조건이 바뀌면 처음부터 다시 센다 — 안 그러면 걸러진 목록이 이미 펼쳐진 채로 나온다.
  useEffect(() => setVisible(PAGE_SIZE), [ownerFilter, statusFilter, query, kind]);

  const shown = filtered.slice(0, visible);

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  /** 방문을 맡는 알선팀 — 담당 딜러 칸에 뜨는 사람들 */
  const dealers = useMemo(() => visitDealers(state.employees), [state.employees]);

  const setVisitDealer = async (c: ConsultationRecord, dealerId: string) => {
    try {
      await api(`/consultations/${c.id}`, { method: 'PATCH', body: { visitDealerId: dealerId } });
      await refresh();
    } catch (e) {
      void alertError('담당 딜러를 정하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 날짜별로 미리 묶어둔다.
   *
   * 예전에는 칸 하나를 그릴 때마다 상담 전체를 훑었다. 한 달이 42칸이라 건수가 늘자
   * 달력을 열 때마다 수만 번을 돌았다.
   */
  const eventIndex = useMemo(() => {
    const index = new Map<string, CalEvent[]>();
    const push = (date: string | null | undefined, event: CalEvent) => {
      if (!date) return;
      const list = index.get(date);
      if (list) list.push(event);
      else index.set(date, [event]);
    };

    /*
      달력에는 방문 일정이 적힌 건만 올린다.

      예전에는 상담 등록일과 후속연락일까지 다 올려서 하루에 칩이 열 개씩 쌓였고,
      정작 '그날 손님이 오는 차'가 그 속에 묻혔다. 달력은 나가서 맞이할 준비를 하려고
      보는 것이라 방문만 남긴다 — 나머지는 목록에서 본다.

      끝난 상담을 뺄지는 위 목록 필터를 따라간다(기본이 '종결 제외'다).
    */
    filtered.forEach(c => {
      if (!c.visitDate) return;
      // 달력 칸은 좁아서 한 줄만 보인다 — 차명이 있으면 그게 제일 알아보기 쉽고,
      // 없으면 차량번호, 그것도 비면 손님번호로 내려간다.
      const label = c.vehicleName || c.vehicleNumber || c.customerPhone || c.customerName;
      push(c.visitDate, {
        id: `visit-${c.id}`,
        label: `${label}${c.visitTime ? ` ${c.visitTime}` : ''}`,
        sublabel: `방문 · ${CONSULTATION_STATUS_LABEL[c.status]}`,
        colorClass: 'bg-indigo-50 text-indigo-700',
        dotClass: 'bg-indigo-400',
        onSelect: () => setDetail(c),
      });
    });
    return index;
  }, [filtered]);

  const eventsForDate = (dateStr: string): CalEvent[] => eventIndex.get(dateStr) ?? [];

  /* 제목줄을 끌어 열 순서를 바꾼다 — 화면마다 같은 방식이다 */
  const cols = useColumnOrder('consultationColOrder', COLUMNS);

  /**
   * 담당자별 전환율.
   *
   * 상담을 맡는 건 알선팀이다. 다른 팀 사람이 어쩌다 한 건 적어두면 1/1 = 100%로
   * 맨 앞에 뜨는데, 그건 실적이 아니라 잡음이다 — 알선팀만 센다.
   *
   * 세는 규칙은 lib/consultationStats.ts 한 곳에 있다:
   * 계약 = 계약 + 판매완료 · 보류는 계약이 아니고 · 종결은 모수에서 뺀다.
   */
  // 이미 상담이 등록된 차는 흐리게 보여준다(막지는 않는다 — 같은 차에 문의가 여러 번 온다)
  const consultedNumbers = useMemo(
    () => new Set(state.consultations.filter(c => c.kind === kind).map(c => c.vehicleNumber)),
    [state.consultations, kind],
  );

  const staffStats = useMemo(() => {
    if (role !== 'ADMIN') return [];
    return state.employees
      .filter(emp => emp.department === CONSULTATION_TEAM)
      .map(emp => ({ emp, ...conversionOf(ofKind.filter(c => c.employeeId === emp.id)) }))
      .filter(s => s.total > 0 || s.closed > 0)
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
  }, [ofKind, state.employees, role]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          받은 카톡 양식 그대로 등록합니다. <b>전체 상담이 다 보입니다</b> — 손님번호를 누르면 그 손님의 지난 상담이 모여 나옵니다.
          {/* 알선으로 골라놓고 내용에 수출이라 적는 일이 많아, 어디로 가는지 미리 알려준다 */}
          {kind === 'BROKERAGE'
            ? ' 상담 내용에 "수출"이 들어가면 수출 상담으로 모입니다.'
            : ' 알선으로 적었어도 내용에 "수출"이 있으면 여기로 모입니다.'}
        </p>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setPriceOpen('')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          title="상담 등록 없이 값만 봅니다"
        >
          <LineChart size={15} /> 시세 조회
        </button>
        <button
          onClick={() => { setEditing(null); setPreset(undefined); setFormOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> {CONSULTATION_KIND_LABEL[kind]} 상담 등록
        </button>
        </div>
      </div>

      {/*
        채널톡으로 들어온 전화 — 통화 내용을 그대로 상담으로 옮긴다.
        지금 보고 있는 탭이 그대로 상담 종류가 된다(알선 탭에서 옮기면 알선 상담이다).
      */}
      <div className="mb-3">
        <CallInbox
          onStart={seed => {
            setEditing(null);
            setPreset({
              content: seed.content,
              customerPhone: seed.customerPhone,
              vehicleNumber: seed.vehicle?.vehicleNumber,
              vehicleName: seed.vehicle?.vehicleModel,
              visitDate: seed.visitDate,
              visitTime: seed.visitTime,
            });
            setFormOpen(true);
          }}
        />
      </div>

      {/*
        방문 배정 — 그날 오는 손님을 누가 맞을지 정한다.
        우리 물건을 우리가 파는 자리에서만 띄운다(수출·기타는 손님이 오지 않는다).
      */}
      {(kind === 'SALE' || kind === 'BROKERAGE') && <VisitAssignPanel />}

      {/* 상품화된 차를 눌러 그 차로 상담을 연다 — 차량번호를 옮겨 치지 않게 */}
      {/* 우리 물건을 우리가 파는 자리(판매·알선)에서만 — 수출·기타는 고를 차가 다르다 */}
      {(kind === 'SALE' || kind === 'BROKERAGE') && (
        <SellableVehicles
          consultedNumbers={consultedNumbers}
          onStart={(v: ManagedVehicle) => {
            setEditing(null);
            setPreset({ vehicleNumber: v.vehicleNumber, vehicleName: v.vehicleModel });
            setFormOpen(true);
          }}
        />
      )}

      {role === 'ADMIN' && staffStats.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <p className="text-xs font-bold text-slate-500">담당자별 상담 → 계약 전환율</p>
            <p className="text-[11px] text-slate-400">
              {CONSULTATION_TEAM} · 계약 = 계약 + 판매완료 · 계약보류는 계약으로 안 세고 · 상담종결은 아예 빼고 셉니다
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {staffStats.map(({ emp, total, contracted, onHold, closed, rate }) => (
              <div key={emp.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500">{emp.name}</p>
                <p className="mt-1 text-lg font-bold text-slate-800">{rate}<span className="text-xs font-medium text-slate-400">%</span></p>
                <p className="text-[11px] text-slate-400">{contracted}/{total}건 계약</p>
                {/* 보류·종결은 왜 숫자가 그런지 설명해 주는 값이라 같이 둔다 */}
                {(onHold > 0 || closed > 0) && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {onHold > 0 && <span className="text-amber-700">계약보류 {onHold}건</span>}
                    {onHold > 0 && closed > 0 && ' · '}
                    {closed > 0 && <span>상담종결 {closed}건 제외</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호 또는 고객명 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">담당자 전체</option>
          {state.currentEmployeeId && <option value={state.currentEmployeeId}>내 상담만</option>}
          {state.employees
            .filter(e => e.id !== state.currentEmployeeId)
            .map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusView)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="open">진행 중인 상담 (종결 제외)</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="CONTRACTED">계약</option>
          <option value="SOLD">판매완료</option>
          <option value="ON_HOLD">보류</option>
          <option value="all">종결까지 전체</option>
        </select>
        {/* 종결은 기본으로 뺀다 — 지난 건이 천 단위라 다 그리면 화면이 느려진다 */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'CLOSED' ? 'open' : 'CLOSED')}
          className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
            statusFilter === 'CLOSED'
              ? 'border-slate-700 bg-slate-700 text-white'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          종결함 {closedCount.toLocaleString()}
        </button>
        {/* 제목줄을 끌어 옮긴 차례를 되돌린다 — 리스트에서만 뜻이 있다 */}
        {view === 'list' && <ColumnResetButton onReset={cols.reset} />}
        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <List size={14} /> 리스트
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <CalendarDays size={14} /> 캘린더
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EventCalendar month={calMonth} onMonthChange={setCalMonth} eventsForDate={eventsForDate} />
        </div>
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">{cols.headers()}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={cols.count} className="px-5 py-10 text-center text-sm text-slate-400">
                    상담 내역이 없습니다.
                  </td>
                </tr>
              )}
              {shown.map(c => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {cols.cells({
                    date: (
                      <span className="text-slate-600">
                        {dayjs(c.date).format('M/D')} {c.time}
                      </span>
                    ),
                    platform: c.platform ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {c.platform}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    ),
                    vehicleNumber: <span className="font-mono text-slate-600">{c.vehicleNumber}</span>,
                    vehicleName: c.vehicleName ? (
                      <span className="text-slate-700">{c.vehicleName}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    ),
                    // 매입날짜(제시일자) — 차량 관리에서 맞춰 붙여 준다. 얼마나 들고 있는 차인지가 보인다
                    offerDate: c.offerDate ? (
                      <span className="text-slate-500">{dayjs(c.offerDate).format('YY.M.D')}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    ),
                    // 번호를 누르면 그 손님의 지난 상담이 모여 나온다
                    customer: (
                      <button
                        onClick={() => setHistoryCustomer(c.customerPhone || c.customerName)}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {c.customerPhone || c.customerName || '—'}
                      </button>
                    ),
                    owner:
                      c.kind === 'OTHER' && c.outsideDealer ? (
                        <span className="text-slate-500" title="우리 물건을 판 남의 딜러·상사">
                          {c.outsideDealer}
                        </span>
                      ) : (
                        <span className="text-slate-500">{employeeOf(c.employeeId)?.name}</span>
                      ),
                    visit:
                      c.visitDate || c.visitTime ? (
                        <span className="text-slate-600">
                          {c.visitDate && <span className="font-medium">{dayjs(c.visitDate).format('M/D')}</span>}
                          {c.visitTime && <span className="ml-1 text-slate-500">{c.visitTime}</span>}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      ),
                    /*
                      방문을 맞을 사람 — 전화받은 사람이 여기서 바로 고른다.

                      방문 약속이 없는 건에는 안 띄운다. 올 날이 없는데 맞을 사람부터
                      정해 두면 아무 뜻이 없다.
                    */
                    visitDealer: c.visitDate ? (
                      <VisitDealerSelect
                        value={c.visitDealerId}
                        dealers={dealers}
                        onPick={id => setVisitDealer(c, id)}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    ),
                    status: (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[c.status]}`}
                      >
                        {CONSULTATION_STATUS_LABEL[c.status]}
                      </span>
                    ),
                    content: (
                      <span className="block max-w-xs truncate text-slate-500" title={c.content}>
                        {c.content}
                      </span>
                    ),
                    actions: (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => void copyKakao(c)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          title="상담 카톡 양식으로 복사"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => setPriceOpen(c.vehicleName || c.vehicleNumber)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          title="이 차 시세 보기"
                        >
                          <LineChart size={13} />
                        </button>
                        {c.status === 'SOLD' && (
                          <button
                            onClick={() => void copyRelease(c, employeeOf(c.employeeId)?.name ?? '')}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                            title="출고 양식으로 복사 — 카톡방에 올리면 광고팀이 전산을 내립니다"
                          >
                            출고
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditing(c);
                            setPreset(undefined);
                            setFormOpen(true);
                          }}
                          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                        >
                          수정
                        </button>
                        <button
                          onClick={() =>
                            void confirmDanger('상담 내역을 삭제할까요?').then(ok => {
                              if (ok) void deleteConsultation(c.id);
                            })
                          }
                          className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
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
        {filtered.length > shown.length && (
          <div className="border-t border-slate-100 px-5 py-3 text-center">
            <button
              onClick={() => setVisible(v => v + PAGE_SIZE)}
              className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              더 보기 — {shown.length.toLocaleString()} / {filtered.length.toLocaleString()}건
            </button>
          </div>
        )}
      </div>
      )}

      {formOpen && (
        <ConsultationForm kind={kind} editing={editing} defaultEmployeeId={state.currentEmployeeId} preset={preset} onClose={() => setFormOpen(false)} />
      )}
      {detail && (
        <ConsultationDetailModal
          consultation={detail}
          onEdit={() => {
            setEditing(detail);
            setPreset(undefined);
            setDetail(null);
            setFormOpen(true);
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {priceOpen !== null && <PriceCheckModal defaultQuery={priceOpen} onClose={() => setPriceOpen(null)} />}
      {historyCustomer && (
        <CustomerHistoryModal customerName={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}
    </>
  );
}
