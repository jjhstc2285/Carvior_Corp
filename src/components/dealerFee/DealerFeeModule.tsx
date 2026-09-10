import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { ClipboardPaste, Download, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { DEALER_FEE_METHOD_LABEL, type DealerFeeAccount, type DealerFeeMethod } from '../../types';
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
export default function DealerFeeModule() {
  const [rows, setRows] = useState<DealerFeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  /** 이 장부를 볼 수 있는 사람 — "누가 보는지"를 화면에서 확인한다 */
  const [viewers, setViewers] = useState<{ id: string; name: string; position: string }[]>([]);
  /**
   * 영업소별 실적 — 검차를 몇 건 맡겼고 우리가 몇 대를 사왔는가.
   *
   * 회비는 매달 나가는데 검차도 안 맡기고 차도 안 주는 곳이 있다.
   * 그런 곳을 찾으려면 회비 옆에 실적이 같이 보여야 한다.
   */
  const [activity, setActivity] = useState<
    Record<string, { inspected: number; completed: number; purchased: number; lastAt: string | null }>
  >({});
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
    api<typeof activity>('/dealer-fees/activity')
      .then(setActivity)
      .catch(() => setActivity({}));
  }, []);

  /** 한 칸만 고쳐 보낸다. 고친 게 이체 조건이면 서버가 알림을 띄운다. */
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

  /** 회비는 나가는데 검차도 매입도 없는 곳 — 끊을지 볼 자리다. */
  const idle = (id: string) => (activity[id]?.inspected ?? 0) === 0 && (activity[id]?.purchased ?? 0) === 0;
  const idleAccounts = active.filter(r => r.monthlyFee > 0 && idle(r.id));
  const idleTotal = idleAccounts.reduce((sum, r) => sum + r.monthlyFee, 0);
  const autoCount = filtered.filter(r => r.active && r.method === 'AUTO').length;

  const handleExport = () => {
    const data = filtered.map(r => ({
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
      '검차 누적': activity[r.id]?.inspected ?? 0,
      거래완료: activity[r.id]?.completed ?? 0,
      매입: activity[r.id]?.purchased ?? 0,
      '최근 검차': activity[r.id]?.lastAt ?? '',
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
  const text = (row: DealerFeeAccount, key: keyof DealerFeeAccount, width: string, placeholder = '') => (
    <input
      defaultValue={String(row[key] ?? '')}
      onBlur={e => {
        const next = e.target.value.trim();
        if (next !== String(row[key] ?? '')) void patch(row, { [key]: next });
      }}
      disabled={busyId === row.id}
      placeholder={placeholder}
      className={`${width} rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 disabled:opacity-50`}
    />
  );

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
        {/* 끊으면 바로 굳는 돈이라 합계 옆에 크게 둔다 */}
        <div className={`rounded-2xl border px-4 py-3.5 ${idleAccounts.length > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
          <p className={`text-xs font-medium ${idleAccounts.length > 0 ? 'text-red-700/80' : 'text-slate-400'}`}>
            검차·매입 없는 곳
          </p>
          <p className={`mt-1 text-2xl font-bold ${idleAccounts.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {idleAccounts.length}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
          <p className="text-[11px] text-slate-500">매달 {idleTotal.toLocaleString()}원 나갑니다</p>
        </div>
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
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${filtered.length}곳`}</span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-3 font-medium">업체명</th>
                <th className="px-3 py-3 font-medium">담당자</th>
                <th className="px-3 py-3 font-medium">담당연락처</th>
                <th className="px-3 py-3 font-medium">거래시작일</th>
                <th className="px-3 py-3 font-medium">은행</th>
                <th className="px-3 py-3 font-medium">예금주</th>
                <th className="px-3 py-3 font-medium">자동이체계좌</th>
                <th className="px-3 py-3 font-medium">자동이체날짜</th>
                <th className="px-3 py-3 text-center font-medium">이체일</th>
                <th className="px-3 py-3 text-right font-medium">매달 회비</th>
                <th
                  className="px-3 py-3 text-right font-medium"
                  title="카비어에 접수된 검차 건수 / 그중 거래완료(매입가가 잡힌 건)"
                >
                  검차 누적
                </th>
                <th className="px-3 py-3 text-right font-medium" title="매입 관리의 매입처로 셉니다">
                  매입
                </th>
                <th className="px-3 py-3 font-medium">최근 검차</th>
                <th className="px-3 py-3 font-medium">자동이체여부</th>
                <th className="px-3 py-3 font-medium">자동이체기한</th>
                <th className="px-3 py-3 font-medium">비고</th>
                <th className="px-3 py-3 font-medium">메모</th>
                <th className="px-3 py-3 text-center font-medium">거래중</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={17} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '등록된 영업소가 없습니다.'}
                  </td>
                </tr>
              )}
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${r.active ? '' : 'bg-slate-50/60 text-slate-400'}`}
                >
                  <td className="px-3 py-2.5">{text(r, 'dealerName', 'w-40', '업체명')}</td>
                  <td className="px-3 py-2.5">{text(r, 'managerName', 'w-20')}</td>
                  <td className="px-3 py-2.5">{text(r, 'managerPhone', 'w-32', '010-')}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="date"
                      defaultValue={r.startedOn ?? ''}
                      onBlur={e => {
                        if (e.target.value !== (r.startedOn ?? '')) void patch(r, { startedOn: e.target.value || null });
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2.5">{text(r, 'bank', 'w-24', '카카오뱅크')}</td>
                  <td className="px-3 py-2.5">{text(r, 'accountHolder', 'w-20')}</td>
                  <td className="px-3 py-2.5">{text(r, 'accountNumber', 'w-40')}</td>
                  {/* 꼴이 제각각이라(매달5일 / 10-01 / 매달1일고정) 적힌 그대로 받는다 */}
                  <td className="px-3 py-2.5">{text(r, 'transferDay', 'w-28', '매달5일')}</td>
                  {/*
                    적힌 문장에서 뽑아낸 날. 이 숫자로 그날 아침 알림이 돈다.
                    못 뽑았으면 노랗게 칠해 채우라고 알린다 — 틀린 날에 알리느니 안 알리는 게 낫다.
                  */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      defaultValue={r.transferDayOfMonth || ''}
                      onBlur={e => {
                        const next = Math.min(31, Number(digitsOnly(e.target.value)) || 0);
                        if (next !== r.transferDayOfMonth) void patch(r, { transferDayOfMonth: next });
                      }}
                      inputMode="numeric"
                      placeholder="—"
                      title="이 날 아침에 알림이 갑니다"
                      className={`w-14 rounded-lg border px-2 py-1.5 text-center text-[13px] outline-none focus:border-indigo-400 ${
                        r.transferDayOfMonth ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                      }`}
                    />
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    <input
                      defaultValue={r.monthlyFee ? withCommas(r.monthlyFee) : ''}
                      onBlur={e => {
                        const next = Number(digitsOnly(e.target.value)) || 0;
                        if (next !== r.monthlyFee) void patch(r, { monthlyFee: next });
                      }}
                      inputMode="numeric"
                      placeholder="100,000"
                      className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[13px] outline-none focus:border-indigo-400"
                    />
                  </td>

                  {/*
                    회비만 나가고 아무것도 안 들어오는 곳을 찾는 칸이다.
                    검차도 매입도 0이면 빨갛게 — 그게 끊을지 말지 볼 자리다.
                  */}
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right ${idle(r.id) ? 'font-bold text-red-600' : 'text-slate-700'}`}>
                    {activity[r.id]?.inspected ?? 0}
                    {(activity[r.id]?.completed ?? 0) > 0 && (
                      <span className="ml-1 text-[11px] font-normal text-slate-400">
                        (거래 {activity[r.id]?.completed})
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${idle(r.id) ? 'font-bold text-red-600' : 'text-slate-700'}`}>
                    {activity[r.id]?.purchased ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                    {activity[r.id]?.lastAt ? (
                      dayjs(activity[r.id]!.lastAt!).format('YY.M.D')
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    <select
                      value={r.method}
                      onChange={e => void patch(r, { method: e.target.value as DealerFeeMethod })}
                      className={`rounded-lg border px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 ${
                        r.method === 'CANCELED' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200'
                      }`}
                    >
                      {(Object.entries(DEALER_FEE_METHOD_LABEL) as [DealerFeeMethod, string][]).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-3 py-2.5">{text(r, 'autoTransferUntil', 'w-32', '2026년12월')}</td>
                  <td className="px-3 py-2.5">{text(r, 'note', 'w-56')}</td>
                  <td className="px-3 py-2.5">{text(r, 'memo', 'w-56')}</td>

                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={e => void patch(r, { active: e.target.checked })}
                      className="size-4 accent-indigo-600"
                      aria-label="거래중"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => void removeRow(r)}
                      className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pasteOpen && <DealerFeePasteModal onClose={() => setPasteOpen(false)} onImported={() => void load()} />}
    </div>
  );
}
