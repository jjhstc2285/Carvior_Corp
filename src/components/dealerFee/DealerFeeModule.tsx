import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { DEALER_FEE_METHOD_LABEL, type DealerFeeAccount, type DealerFeeMethod } from '../../types';

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

  // 대당으로 잡힌 곳은 정액이 아니라 합계에 못 넣는다 — 몇 곳인지만 따로 알려준다.
  const monthlyTotal = filtered.filter(r => r.active).reduce((sum, r) => sum + r.monthlyFee, 0);
  const perUnit = filtered.filter(r => r.active && r.monthlyFee === 0 && r.feeNote).length;
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
      '매달 회비': r.monthlyFee || r.feeNote,
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
            칸을 눌러 바로 고칩니다. <b>이체날짜 · 회비 · 기한 · 계좌 · 이체여부</b>가 바뀌면 사무장과 대표에게
            알림이 갑니다.
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
            onClick={() => void addRow()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 영업소 추가
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">매달 회비 합계</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {monthlyTotal.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {perUnit > 0 && <p className="text-[11px] text-slate-400">대당으로 잡힌 {perUnit}곳 제외</p>}
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
                <th className="px-3 py-3 text-right font-medium">매달 회비</th>
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
                  <td colSpan={15} className="px-5 py-10 text-center text-sm text-slate-400">
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
                    {/* 대당처럼 정액이 아닌 곳 — 금액을 비우고 여기에 적는다 */}
                    {text(r, 'feeNote', 'mt-1 w-28', '대당 5만')}
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
    </div>
  );
}
