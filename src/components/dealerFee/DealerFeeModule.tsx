import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { ClipboardPaste, Download, Plus, Trash2, Trophy, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import DealerRankingModal from './DealerRankingModal';
import { alertError, confirmDanger } from '../../lib/alert';
import { withCommas } from '../../lib/money';
import { DEALER_BRAND_LABEL, DEALER_FEE_METHOD_LABEL, type DealerFeeAccount } from '../../types';
import { ContractPhotoThumb } from '../settlement/ContractPhotos';
import DealerFeeForm from './DealerFeeForm';
import { useColumnOrder, ColumnResetButton, type Column } from '../table/useColumnOrder';
import DealerFeePasteModal from './DealerFeePasteModal';

/**
 * 신차영업소 상조회비 납부현황.
 *
 * 엑셀로 돌리던 대장을 그대로 옮겼다. 칸을 눌러 바로 고치고, 이체 조건(날짜·회비·기한·
 * 계좌·이체여부)이 바뀌면 사무장과 대표에게 알림이 간다.
 *
 * 날짜 꼴이 제각각이라(매달5일 / 10-01 / 매달1일고정 / 직접이체) 날짜 입력칸으로 두지
 * 않고 적힌 그대로 받는다. 억지로 맞추면 원장과 달라진다.
 */
/**
 * 표의 칸들.
 *
 * 제목과 그리는 방법을 한 벌로 묶어야 차례를 바꿔도 값이 안 엉킨다. 칸이 스무 개라
 * 보는 사람마다 먼저 보고 싶은 게 다르다 — 회비부터 보는 사람, 이체일부터 보는 사람.
 */
const COLUMNS: Column[] = [
  // 지우는 건 제일 앞에 둔다 — 칸이 스물 가까이 돼서 옆으로 끝까지 밀어야 나왔다
  { key: 'actions', label: '' },
  { key: 'brand', label: '제조사' },
  { key: 'dealerName', label: '업체명' },
  { key: 'managerName', label: '담당자' },
  { key: 'managerPhone', label: '담당연락처' },
  { key: 'startedOn', label: '거래시작일' },
  { key: 'bank', label: '은행' },
  { key: 'accountHolder', label: '예금주' },
  { key: 'accountNumber', label: '자동이체계좌' },
  { key: 'transferDay', label: '자동이체날짜' },
  { key: 'transferDayOfMonth', label: '이체일', align: 'text-center', title: '이 날 아침에 이체 알림이 갑니다' },
  { key: 'monthlyFee', label: '매달 회비', align: 'text-right' },
  { key: 'inspected', label: '판매 누적', align: 'text-right', title: '카비어에 접수된 건수 / 그중 판매완료(매입가가 잡힌 건)' },
  { key: 'purchased', label: '매입', align: 'text-right', title: '매입 관리의 매입처로 셉니다' },
  { key: 'lastAt', label: '최근 판매' },
  { key: 'method', label: '자동이체여부' },
  { key: 'autoTransferUntil', label: '자동이체기한' },
  { key: 'note', label: '비고' },
  { key: 'memo', label: '메모' },
  // 명함·간판·약정서처럼 글로 못 적는 것 — 한 장만 받는다
  { key: 'photo', label: '사진', align: 'text-center' },
  { key: 'active', label: '거래중', align: 'text-center' },
];

/** 빈 칸은 줄표로 — 비어 있는 것과 안 받아온 것이 같아 보이면 안 된다 */
const dash = (v: string) => (v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span>);

export default function DealerFeeModule() {
  const [rows, setRows] = useState<DealerFeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  /** '판매·매입 없는 곳'만 보고 있는가 */
  const [idleOnly, setIdleOnly] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  /** 제조사로 걸러 보기 — null 이면 전체 */
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  /** 이 장부를 볼 수 있는 사람 — "누가 보는지"를 화면에서 확인한다 */
  const [viewers, setViewers] = useState<{ id: string; name: string; position: string }[]>([]);
  /**
   * 영업소별 실적 — 검차를 몇 건 맡겼고 우리가 몇 대를 사왔는가.
   *
   * 회비는 매달 나가는데 판매도 안 넘기고 차도 안 주는 곳이 있다.
   * 그런 곳을 찾으려면 회비 옆에 실적이 같이 보여야 한다.
   */
  const [activity, setActivity] = useState<
    Record<string, { inspected: number; completed: number; purchased: number; lastAt: string | null }>
  >({});
  /** 어느 장부에도 안 붙은 카비어 이름 — 장부에 없는 곳이거나 이름이 안 맞는 곳이다 */
  const [unmatched, setUnmatched] = useState<{ name: string; count: number }[]>([]);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ ...(includeInactive ? { includeInactive: 'true' } : {}) });
      const data = await api<DealerFeeAccount[]>(`/dealer-fees${params.toString() ? `?${params}` : ''}`);
      if (myReq !== reqId.current) return;
      setRows(data);
      setError(null);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '납부현황을 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ id: string; name: string; position: string }[]>('/dealer-fees/viewers')
      .then(setViewers)
      .catch(() => setViewers([]));
    // 실적은 곁다리라 못 받아와도 장부는 그대로 쓴다(카비어가 막힐 수 있다).
    api<{ byDealer: typeof activity; unmatched: { name: string; count: number }[] }>('/dealer-fees/activity')
      .then(res => {
        setActivity(res.byDealer);
        setUnmatched(res.unmatched);
      })
      .catch(() => setActivity({}));
  }, []);

  /** 한 칸만 고쳐 보낸다. 고친 게 이체 조건이면 서버가 알림을 띄운다. */
  /* 제목줄을 끌어 열 순서를 바꾼다 — 화면마다 같은 방식이다. 칸이 스무 개라 빽빽하게 */
  const cols = useColumnOrder('dealerFeeColOrder', COLUMNS, { dense: true });
  /** 가로로 펴서 고치는 창 — 줄을 누르면 열린다 */
  const [editing, setEditing] = useState<DealerFeeAccount | null>(null);

  const patch = async (row: DealerFeeAccount, body: Partial<DealerFeeAccount>) => {
    setBusyId(row.id);
    try {
      const updated = await api<DealerFeeAccount>(`/dealer-fees/${row.id}`, { method: 'PATCH', body });
      setRows(prev => prev.map(r => (r.id === row.id ? updated : r)));
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    try {
      await api('/dealer-fees', { method: 'POST', body: { dealerName: '새 영업소' } });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: DealerFeeAccount) => {
    const ok = await confirmDanger(
      `${row.dealerName}을(를) 목록에서 지울까요?`,
      '거래만 끝난 곳이면 지우지 말고 "거래중" 체크를 풀어 두세요 — 지난 내용이 남습니다.',
    );
    if (!ok) return;
    try {
      await api(`/dealer-fees/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter(r =>
      [r.dealerName, r.managerName, r.accountHolder, r.bank, r.note].some(v => v?.includes(q)),
    );
  }, [rows, query]);

  const active = filtered.filter(r => r.active);
  const monthlyTotal = active.reduce((sum, r) => sum + r.monthlyFee, 0);

  /** 회비는 나가는데 판매도 매입도 없는 곳 — 끊을지 볼 자리다. */
  const idle = (id: string) => (activity[id]?.inspected ?? 0) === 0 && (activity[id]?.purchased ?? 0) === 0;
  const idleAccounts = active.filter(r => r.monthlyFee > 0 && idle(r.id));
  const idleTotal = idleAccounts.reduce((sum, r) => sum + r.monthlyFee, 0);
  const autoCount = filtered.filter(r => r.active && r.method === 'AUTO').length;

  /*
    '판매·매입 없는 곳' 칸을 누르면 그 곳들만 본다.

    끊을지 말지는 업체명·회비·담당자를 봐야 정하는데, 숫자만 보고는 어디인지 알 수가 없어
    표에서 한 줄씩 찾아야 했다. 눌러서 그 목록만 남긴다.
    합계 숫자는 그대로 둔다 — 걸러 놓고도 몇 곳인지는 계속 보여야 한다.
  */
  /*
    제조사별로 묶어 본다.

    회비를 어디에 내고 있는지는 결국 '어느 제조사에 얼마'다. 업체명만 늘어놓으면
    현대가 몇 곳인지 세려고 표를 훑어야 한다. 제조사를 눌러 그 곳들만 볼 수 있게 한다.

    제조사는 업체명에서 서버가 뽑아 준다. 못 알아본 곳은 '기타'로 묶는다 —
    빼버리면 회비가 나가는데 어디에도 안 세이는 곳이 생긴다.
  */
  const ETC = '__etc__';
  const brands = useMemo(() => {
    const by = new Map<string, { count: number; fee: number; idle: number }>();
    for (const r of active) {
      const key = r.brand ?? ETC;
      const prev = by.get(key) ?? { count: 0, fee: 0, idle: 0 };
      by.set(key, {
        count: prev.count + 1,
        fee: prev.fee + r.monthlyFee,
        idle: prev.idle + (r.monthlyFee > 0 && idle(r.id) ? 1 : 0),
      });
    }
    return [...by]
      .map(([brand, v]) => ({ brand, ...v }))
      // 곳이 많은 제조사부터. '기타'는 정체를 모르는 묶음이라 맨 뒤에 둔다
      .sort((a, b) => (a.brand === ETC ? 1 : b.brand === ETC ? -1 : 0) || b.count - a.count || b.fee - a.fee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activity]);

  const shown = (idleOnly ? idleAccounts : filtered).filter(
    r => !brandFilter || (r.brand ?? ETC) === brandFilter,
  );

  const handleExport = () => {
    const data = shown.map(r => ({
      업체명: r.dealerName,
      담당자: r.managerName,
      담당연락처: r.managerPhone,
      거래시작일: r.startedOn ?? '',
      은행: r.bank,
      예금주: r.accountHolder,
      자동이체계좌: r.accountNumber,
      자동이체날짜: r.transferDay,
      이체일: r.transferDayOfMonth || '',
      '매달 회비': r.monthlyFee || r.feeNote,
      '판매 누적': activity[r.id]?.inspected ?? 0,
      판매완료: activity[r.id]?.completed ?? 0,
      매입: activity[r.id]?.purchased ?? 0,
      '최근 판매': activity[r.id]?.lastAt ?? '',
      자동이체여부: DEALER_FEE_METHOD_LABEL[r.method],
      비고: r.note,
      자동이체기한: r.autoTransferUntil,
      메모: r.memo,
      거래중: r.active ? 'O' : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '상조회비');
    XLSX.writeFile(wb, `상조회비_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  /** 칸을 벗어날 때만 저장한다 — 한 글자마다 보내면 요청이 쏟아진다. */

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">신차영업소 상조회비</h1>
          <p className="mt-1 text-sm text-slate-500">
            칸을 눌러 바로 고칩니다. <b>이체일 아침에 그날 이체할 곳과 합계</b>가 알림으로 갑니다.
            이체날짜 · 회비 · 기한 · 계좌 · 이체여부를 고쳐도 알림이 갑니다.
          </p>
          {viewers.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              보는 사람 {viewers.length}명 —{' '}
              {viewers.map(v => `${v.name}(${v.position})`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* 안 파는 곳만큼 잘 파는 곳도 봐야 회비를 어디에 낼지 정할 수 있다 */}
          <button
            onClick={() => setRankingOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="판매를 많이 해 준 딜러를 순위로 봅니다"
          >
            <Trophy size={15} /> 판매 순위
          </button>
          {/* 제목줄을 끌어 옮긴 차례를 되돌린다 — 화면마다 같은 자리에 둔다 */}
          <ColumnResetButton onReset={cols.reset} />
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> 엑셀
          </button>
          <button
            onClick={() => setPasteOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="엑셀에서 복사해 한 번에 등록합니다"
          >
            <ClipboardPaste size={15} /> 엑셀에서 붙여넣기
          </button>
          <button
            onClick={() => void addRow()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 영업소 추가
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">매달 회비 합계</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {monthlyTotal.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">거래중인 곳만 셉니다</p>
        </div>
        {/* 끊으면 바로 굳는 돈이라 합계 옆에 크게 둔다. 누르면 그 곳들만 남는다 */}
        <button
          type="button"
          disabled={idleAccounts.length === 0}
          onClick={() => setIdleOnly(v => !v)}
          title={idleAccounts.length > 0 ? '누르면 이 곳들만 표에 남깁니다' : undefined}
          className={`rounded-2xl border px-4 py-3.5 text-left transition-colors ${
            idleAccounts.length > 0 ? 'border-red-200 bg-red-50/50 hover:bg-red-50' : 'border-slate-200 bg-white'
          } ${idleOnly ? 'ring-2 ring-red-400' : ''}`}
        >
          <p className={`text-xs font-medium ${idleAccounts.length > 0 ? 'text-red-700/80' : 'text-slate-400'}`}>
            판매·매입 없는 곳
          </p>
          <p className={`mt-1 text-2xl font-bold ${idleAccounts.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {idleAccounts.length}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
          <p className="text-[11px] text-slate-500">매달 {idleTotal.toLocaleString()}원 나갑니다</p>
          {idleAccounts.length > 0 && (
            <p className="mt-0.5 text-[11px] font-semibold text-red-700">
              {idleOnly ? '눌러서 전체 보기' : '눌러서 어디인지 보기'}
            </p>
          )}
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">거래중</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {filtered.filter(r => r.active).length}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">자동이체</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {autoCount}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
          <p className="text-[11px] text-slate-400">나머지는 직접이체·해지</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="업체명·담당자·예금주·은행 검색"
          className="w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          거래 끝난 곳도 보기
        </label>
        {brandFilter && (
          <button
            onClick={() => setBrandFilter(null)}
            className="flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            {brandFilter === ETC ? '기타' : (DEALER_BRAND_LABEL[brandFilter] ?? brandFilter)}만 보는 중 <X size={12} />
          </button>
        )}
        {idleOnly && (
          <button
            onClick={() => setIdleOnly(false)}
            className="flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            판매·매입 없는 곳만 보는 중 <X size={12} />
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${shown.length}곳`}</span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      {/* 제조사별로 몇 곳에 얼마가 나가는지. 누르면 그 제조사만 표에 남는다 */}
      {brands.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setBrandFilter(null)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              brandFilter === null
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            전체 <span className="ml-1 font-bold">{active.length}</span>
          </button>
          {brands.map(b => (
            <button
              key={b.brand}
              onClick={() => setBrandFilter(v => (v === b.brand ? null : b.brand))}
              title={`매달 ${b.fee.toLocaleString()}원${b.idle > 0 ? ` · 판매·매입 없는 곳 ${b.idle}곳` : ''}`}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                brandFilter === b.brand
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold">{b.brand === ETC ? '기타' : (DEALER_BRAND_LABEL[b.brand] ?? b.brand)}</span>
              <span className="font-bold text-indigo-600">{b.count}</span>
              {/* 회비만 나가는 곳이 몇인지 — 끊을 데를 제조사 단위로 먼저 본다 */}
              {b.idle > 0 && <span className="font-bold text-red-500">{b.idle}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr className="border-b border-slate-100">{cols.headers()}</tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={cols.count} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : idleOnly ? '판매·매입 없는 곳이 없습니다.' : '등록된 영업소가 없습니다.'}
                  </td>
                </tr>
              )}
              {shown.map(r => (
                /*
                  줄을 누르면 가로로 펴진 수정 창이 뜬다.

                  칸이 스무 개라 표에서 바로 고치면 옆으로 끝까지 밀어야 끝 칸이 나오고,
                  밀고 나면 어느 줄을 고치고 있었는지 놓친다.

                  단추 위에서 누른 건 그 자리 일로 둔다 — 지우려다 수정 창이 뜨면 안 된다.
                */
                <tr
                  key={r.id}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
                    setEditing(r);
                  }}
                  title="눌러서 고칩니다"
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50/40 ${
                    r.active ? '' : 'bg-slate-50/60 text-slate-400'
                  } ${busyId === r.id ? 'opacity-50' : ''}`}
                >
                  {cols.cells({
                    actions: (
                      <button
                        onClick={() => void removeRow(r)}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    ),
                    /* 업체명에서 뽑는 값이라 고칠 수 없다 — 업체명을 고치면 따라 바뀐다 */
                    brand: r.brand ? (
                      <span className="text-xs text-slate-500">{DEALER_BRAND_LABEL[r.brand] ?? r.brand}</span>
                    ) : (
                      <span className="text-xs text-slate-300">기타</span>
                    ),
                    dealerName: <span className="font-semibold text-slate-800">{r.dealerName}</span>,
                    managerName: dash(r.managerName),
                    managerPhone: dash(r.managerPhone),
                    startedOn: r.startedOn ? (
                      <span className="text-slate-500">{dayjs(r.startedOn).format('YY.M.D')}</span>
                    ) : (
                      dash('')
                    ),
                    bank: dash(r.bank),
                    accountHolder: dash(r.accountHolder),
                    accountNumber: dash(r.accountNumber),
                    transferDay: dash(r.transferDay),
                    /*
                      적힌 문장에서 뽑아낸 날. 이 숫자로 그날 아침 알림이 돈다.
                      못 뽑았으면 노랗게 칠해 채우라고 알린다 — 틀린 날에 알리느니 안 알리는 게 낫다.
                    */
                    transferDayOfMonth: r.transferDayOfMonth ? (
                      <span className="text-slate-700">{r.transferDayOfMonth}</span>
                    ) : (
                      <span
                        className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"
                        title="이 날이 없으면 이체 알림이 안 갑니다"
                      >
                        없음
                      </span>
                    ),
                    monthlyFee: r.monthlyFee ? (
                      <span className="font-semibold text-slate-800">{withCommas(r.monthlyFee)}</span>
                    ) : (
                      dash('')
                    ),
                    /*
                      회비만 나가고 아무것도 안 들어오는 곳을 찾는 칸이다.
                      판매도 매입도 0이면 빨갛게 — 그게 끊을지 말지 볼 자리다.
                    */
                    inspected: (
                      <span className={idle(r.id) ? 'font-bold text-red-600' : 'text-slate-700'}>
                        {activity[r.id]?.inspected ?? 0}
                        {(activity[r.id]?.completed ?? 0) > 0 && (
                          <span className="ml-1 text-[11px] font-normal text-slate-400">
                            (판매 {activity[r.id]?.completed})
                          </span>
                        )}
                      </span>
                    ),
                    purchased: (
                      <span className={idle(r.id) ? 'font-bold text-red-600' : 'text-slate-700'}>
                        {activity[r.id]?.purchased ?? 0}
                      </span>
                    ),
                    lastAt: activity[r.id]?.lastAt ? (
                      <span className="text-slate-500">{dayjs(activity[r.id]!.lastAt!).format('YY.M.D')}</span>
                    ) : (
                      dash('')
                    ),
                    method: (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                          r.method === 'CANCELED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {DEALER_FEE_METHOD_LABEL[r.method]}
                      </span>
                    ),
                    autoTransferUntil: dash(r.autoTransferUntil),
                    note: dash(r.note),
                    memo: dash(r.memo),
                    /* 한 장만 받는다 — 여러 장이면 어느 게 지금 맞는 것인지 아무도 모른다 */
                    photo: r.photo ? (
                      <ContractPhotoThumb value={r.photo} size={32} alt="상조회 사진" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    ),
                    active: (
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={e => void patch(r, { active: e.target.checked })}
                        className="size-4 accent-indigo-600"
                        aria-label="거래중"
                      />
                    ),
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        가로로 펴서 고치는 창.

        저장은 한 번에 한다 — 표에서 칸마다 보내던 때는 한 곳을 손보는 동안 열 번이
        넘게 날아갔고, 중간에 끊기면 반만 들어갔다.
      */}
      {editing && (
        <DealerFeeForm
          row={editing}
          onSave={body => patch(editing, body)}
          onDelete={() => {
            const row = editing;
            setEditing(null);
            void removeRow(row);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/*
        장부 어디에도 안 붙은 이름.
        장부에 없는 영업소이거나, 있는데 이름이 달라 못 맞춘 곳이다.
        실적이 0으로 보이는 곳이 있으면 여기부터 본다.
      */}
      {unmatched.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50/50 p-4">
          <p className="text-xs font-bold text-amber-900">장부에 없는 카비어 딜러 {unmatched.length}곳</p>
          <p className="mt-0.5 text-[11px] text-amber-800/70">
            장부에 없는 영업소이거나, 있는데 이름이 달라 못 맞춘 곳입니다.
            실적이 0인 영업소가 있으면 여기에 다른 이름으로 들어와 있는지 봐 주세요.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {unmatched.map(u => (
              <span
                key={u.name}
                className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] text-slate-700"
              >
                {u.name}
                {u.count > 1 && <b className="ml-1 text-amber-700">{u.count}</b>}
              </span>
            ))}
          </div>
        </div>
      )}

      {rankingOpen && <DealerRankingModal onClose={() => setRankingOpen(false)} />}

      {pasteOpen && <DealerFeePasteModal onClose={() => setPasteOpen(false)} onImported={() => void load()} />}
    </div>
  );
}
