import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/** 카비오 파트너 API가 내려주는 계약 한 건. 서버 src/carvior/carvior.module.ts 와 맞춰야 한다. */
interface CarviorContract {
  id: number;
  carNumber: string;
  carModel: string;
  carOwner: string;
  dealerName: string;
  preferredDateTime: string | null;
  contractWriter: string;
  vehicleTransferred: boolean;
  contractConfirmed: boolean;
  contractDeposit: number | null; // 만원
  contractBalance: number | null; // 만원
  purchasePrice: number | null; // 만원
  status: string;
  createdAt: string;
  reportUrl: string | null;
}

/** 저쪽에서 오는 상태값. 모르는 값이 오면 원문을 그대로 보여준다(조용히 감추지 않는다). */
const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: '계약완료', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  CANCELLED: { label: '취소', className: 'bg-slate-100 text-slate-500 ring-slate-400/20' },
  PENDING: { label: '진행중', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
};

const NUM = (n: number | null) => (n == null ? '' : n.toLocaleString());

export default function ExportConsultationModule() {
  const [rows, setRows] = useState<CarviorContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<CarviorContract[]>('/carvior/contracts');
      if (myReq !== reqId.current) return;
      setRows(data);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '계약 목록을 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(
        r =>
          !q ||
          r.carNumber.includes(q) ||
          r.carModel.includes(q) ||
          r.carOwner.includes(q) ||
          r.dealerName.includes(q) ||
          r.contractWriter.includes(q),
      );
  }, [rows, statusFilter, query]);

  // 취소 건은 매입가에 넣지 않는다 — 성사되지 않은 금액이다.
  const totalPrice = filtered
    .filter(r => r.status !== 'CANCELLED')
    .reduce((sum, r) => sum + (r.purchasePrice ?? 0), 0);

  const handleExport = () => {
    const data = filtered.map(r => ({
      차량번호: r.carNumber,
      차량명: r.carModel,
      차주: r.carOwner,
      딜러: r.dealerName,
      희망일시: r.preferredDateTime ?? '',
      작성자: r.contractWriter,
      차량인수: r.vehicleTransferred ? 'O' : '',
      계약확정: r.contractConfirmed ? 'O' : '',
      '계약금(만원)': r.contractDeposit ?? '',
      '잔금(만원)': r.contractBalance ?? '',
      '매입가(만원)': r.purchasePrice ?? '',
      상태: STATUS_STYLE[r.status]?.label ?? r.status,
      등록일: dayjs(r.createdAt).format('YYYY-MM-DD'),
      진단서: r.reportUrl ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수출상담');
    XLSX.writeFile(wb, `수출상담_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">수출 상담 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            카비오에서 성사된 계약을 그대로 가져옵니다. 금액 단위는 <b>만원</b>입니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> 엑셀
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">계약 건수</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {filtered.length}
            <span className="ml-1 text-sm font-medium text-slate-400">건</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 sm:col-span-2">
          <p className="text-xs font-medium text-slate-400">매입가 합계 (취소 제외)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {totalPrice.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">만원</span>
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차량명·차주·딜러·작성자 검색"
          className="w-72 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="all">전체 상태</option>
          {statuses.map(s => (
            <option key={s} value={s}>{STATUS_STYLE[s]?.label ?? s}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `총 ${filtered.length}건`}</span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                <th className="px-3 py-2.5 font-medium">등록일</th>
                <th className="px-3 py-2.5 font-medium">차량번호</th>
                <th className="px-3 py-2.5 font-medium">차량명</th>
                <th className="px-3 py-2.5 font-medium">차주</th>
                <th className="px-3 py-2.5 font-medium">딜러</th>
                <th className="px-3 py-2.5 font-medium">희망일시</th>
                <th className="px-3 py-2.5 font-medium">작성자</th>
                <th className="px-3 py-2.5 text-center font-medium">인수</th>
                <th className="px-3 py-2.5 text-center font-medium">확정</th>
                <th className="px-3 py-2.5 text-right font-medium">계약금</th>
                <th className="px-3 py-2.5 text-right font-medium">잔금</th>
                <th className="px-3 py-2.5 text-right font-medium">매입가</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">진단서</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '계약 내역이 없습니다.'}
                  </td>
                </tr>
              )}
              {filtered.map(r => {
                const style = STATUS_STYLE[r.status];
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-slate-500">{dayjs(r.createdAt).format('M/D')}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{r.carNumber}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.carModel}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.carOwner}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.dealerName}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.preferredDateTime ?? ''}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.contractWriter}</td>
                    <td className="px-3 py-2.5 text-center">{r.vehicleTransferred ? '✓' : ''}</td>
                    <td className="px-3 py-2.5 text-center">{r.contractConfirmed ? '✓' : ''}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(r.contractDeposit)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{NUM(r.contractBalance)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{NUM(r.purchasePrice)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                          style?.className ?? 'bg-slate-100 text-slate-600 ring-slate-400/20'
                        }`}
                      >
                        {style?.label ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.reportUrl ? (
                        <a
                          href={r.reportUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                        >
                          보기 <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
