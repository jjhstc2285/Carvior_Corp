import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { CalendarDays, Copy, Download, ExternalLink, List, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess } from '../../lib/alert';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';
import PurchaseIntakeForm from '../purchaseIntake/PurchaseIntakeForm';
import type { PurchaseIntakeInput } from '../purchaseIntake/usePurchaseIntake';
import type { PurchaseIntake } from '../../types';

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
  mileage: number | null; // km
  keyCount: number | null;
  /** 구전(만원). 카비오가 아직 안 내려준다 — 생기면 그대로 흘러오도록 자리만 열어뒀다. */
  brokerFee?: number | null;
  status: string;
  createdAt: string;
  reportUrl: string | null;
}

/** 저쪽에서 오는 상태값. 모르는 값이 오면 원문을 그대로 보여준다(조용히 감추지 않는다). */
const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: '계약완료', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  CANCELLED: { label: '취소', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
  PENDING: { label: '진행중', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
};

const WON_PER_MANWON = 10000;

/** 알선 상담의 '내용' 자리에 들어갈 한 줄 요약 — 저쪽엔 상담 내용 칸이 없다. */
function contentOf(r: CarviorContract): string {
  return [
    r.purchasePrice != null ? `매입가 ${r.purchasePrice.toLocaleString()}만원` : '',
    r.mileage ? `주행 ${r.mileage.toLocaleString()}km` : '',
    r.keyCount ? `키 ${r.keyCount}개` : '',
    r.vehicleTransferred ? '차량인수' : '',
    r.contractConfirmed ? '계약확정' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * 알선 상담과 같은 카톡 양식으로 복사한다.
 *
 * 두 상담이 같은 카톡방에 올라가는데 양식이 다르면 읽는 쪽이 매번 다시 봐야 한다.
 * 그래서 칸 이름은 알선과 똑같이 두고, 값만 수출 쪽에서 가져온다.
 */
async function copyKakao(r: CarviorContract) {
  const text = [
    `플랫폼: ${r.dealerName || '카비오'}`,
    `차량번호: ${r.carNumber}`,
    `차명: ${r.carModel}`,
    `손님번호: ${r.carOwner}`,
    `내용: ${contentOf(r)}`,
    ...(r.preferredDateTime ? [`방문예정: ${r.preferredDateTime}`] : []),
  ].join(String.fromCharCode(10));

  try {
    await navigator.clipboard.writeText(text);
    await alertSuccess('카톡 양식으로 복사했습니다', '메시지 창에 붙여넣으세요.');
  } catch {
    await alertError('복사하지 못했습니다', text);
  }
}

/**
 * 수출 계약을 매입 관리 칸에 맞춰 옮긴다.
 *
 * 진단서(reportUrl)는 넘기지 않는다 — 매입 대장에 남길 값이 아니고, 링크는 이 화면에서 바로 열 수 있다.
 *
 * 금액 단위가 다르다: 카비오는 만원, 매입 관리는 원이다.
 *
 * 구전·고객번호·연식·연료는 카비오가 안 내려줘서 비워둔다 — 폼에서 사람이 마저 채운다.
 * (카비오가 주는 금액은 계약금·잔금·매입가 셋뿐이고, 매입가 = 계약금 + 잔금이다)
 */
function toIntake(r: CarviorContract): Partial<PurchaseIntakeInput> {
  return {
    date: dayjs(r.createdAt).format('YYYY-MM-DD'),
    customerName: r.carOwner,
    customerPhone: '',
    source: r.dealerName,
    vehicleName: r.carModel,
    vehicleNumber: r.carNumber,
    keyCount: r.keyCount ?? 0,
    mileage: r.mileage ?? 0,
    purchaseAmount: (r.purchasePrice ?? 0) * WON_PER_MANWON,
    brokerFee: (r.brokerFee ?? 0) * WON_PER_MANWON,
    note: [
      '카비오 수출계약',
      r.contractWriter ? `작성자 ${r.contractWriter}` : '',
      r.contractDeposit ? `계약금 ${r.contractDeposit.toLocaleString()}만원` : '',
      r.contractBalance ? `잔금 ${r.contractBalance.toLocaleString()}만원` : '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 255),
  };
}

export default function ExportConsultationModule() {
  const [rows, setRows] = useState<CarviorContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => dayjs().startOf('month'));
  const [intakePreset, setIntakePreset] = useState<Partial<PurchaseIntakeInput> | null>(null);
  /** 이미 매입 관리에 올라간 차량번호 — 같은 차를 두 번 등록하지 않게 표시만 해준다. */
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  const loadRegistered = useCallback(async () => {
    try {
      const items = await api<PurchaseIntake[]>('/purchase-intake');
      setRegistered(new Set(items.map(i => i.vehicleNumber)));
    } catch {
      // 표시용일 뿐이라 실패해도 화면을 막지 않는다.
    }
  }, []);

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
    void loadRegistered();
  }, [load, loadRegistered]);

  const statuses = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(
        r => !q || [r.carNumber, r.carModel, r.carOwner, r.dealerName, r.contractWriter].some(v => v?.includes(q)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, statusFilter, query]);

  // 취소 건은 매입가에 넣지 않는다 — 성사되지 않은 금액이다.
  const totalPrice = filtered
    .filter(r => r.status !== 'CANCELLED')
    .reduce((sum, r) => sum + (r.purchasePrice ?? 0), 0);

  // 알선 상담과 같은 달력을 쓴다 — 방문(희망) 일시가 그날 칸에 뜬다.
  const eventsForDate = (dateStr: string): CalEvent[] =>
    filtered
      .filter(r => r.preferredDateTime?.slice(0, 10) === dateStr)
      .map(r => ({
        id: `carvior-${r.id}`,
        label: `${r.carModel || r.carNumber} 방문 ${r.preferredDateTime?.slice(11, 16) ?? ''}`.trim(),
        sublabel: STATUS_STYLE[r.status]?.label ?? r.status,
        colorClass: 'bg-indigo-50 text-indigo-700',
        dotClass: 'bg-indigo-400',
      }));

  const saveIntake = async (input: PurchaseIntakeInput): Promise<string | null> => {
    try {
      await api('/purchase-intake', { method: 'POST', body: input });
      await loadRegistered();
      await alertSuccess('매입 관리에 등록했습니다', '차량 관리에도 그 차가 올라갑니다.');
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : '등록하지 못했습니다.';
    }
  };

  const handleExport = () => {
    const data = filtered.map(r => ({
      계약일: dayjs(r.createdAt).format('YYYY-MM-DD'),
      딜러: r.dealerName,
      차량번호: r.carNumber,
      차명: r.carModel,
      차주: r.carOwner,
      작성자: r.contractWriter,
      방문예정: r.preferredDateTime ?? '',
      상태: STATUS_STYLE[r.status]?.label ?? r.status,
      차량인수: r.vehicleTransferred ? 'O' : '',
      계약확정: r.contractConfirmed ? 'O' : '',
      주행거리: r.mileage ?? '',
      차키갯수: r.keyCount ?? '',
      '계약금(만원)': r.contractDeposit ?? '',
      '잔금(만원)': r.contractBalance ?? '',
      '매입가(만원)': r.purchasePrice ?? '',
      진단서: r.reportUrl ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수출상담');
    XLSX.writeFile(wb, `수출상담_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500">
          카비오에서 성사된 계약을 그대로 가져옵니다. 금액은 <b>만원</b> 단위이고,
          <b> 매입등록</b>을 누르면 매입 관리 칸에 채워 넘깁니다.
        </p>
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
          placeholder="차량번호·차명·차주·딜러·작성자 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="all">전체 상태</option>
          {statuses.map(s => (
            <option key={s} value={s}>
              {STATUS_STYLE[s]?.label ?? s}
            </option>
          ))}
        </select>
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

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      {view === 'calendar' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EventCalendar month={calMonth} onMonthChange={setCalMonth} eventsForDate={eventsForDate} />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-5 py-2.5 font-medium">계약일시</th>
                  <th className="px-4 py-2.5 font-medium">딜러</th>
                  <th className="px-4 py-2.5 font-medium">차량번호</th>
                  <th className="px-4 py-2.5 font-medium">차명</th>
                  <th className="px-4 py-2.5 font-medium">차주</th>
                  <th className="px-4 py-2.5 font-medium">작성자</th>
                  <th className="px-4 py-2.5 font-medium">방문예정</th>
                  <th className="px-4 py-2.5 font-medium">상태</th>
                  <th className="px-4 py-2.5 font-medium">내용</th>
                  <th className="px-5 py-2.5 text-right font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">
                      {loading ? '불러오는 중…' : '계약 내역이 없습니다.'}
                    </td>
                  </tr>
                )}
                {filtered.map(r => {
                  const style = STATUS_STYLE[r.status];
                  const done = registered.has(r.carNumber);
                  return (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                        {dayjs(r.createdAt).format('M/D HH:mm')}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.dealerName ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {r.dealerName}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.carNumber}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.carModel || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.carOwner || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.contractWriter}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {r.preferredDateTime ? (
                          <>
                            <span className="font-medium">{dayjs(r.preferredDateTime).format('M/D')}</span>
                            <span className="ml-1 text-slate-500">{r.preferredDateTime.slice(11, 16)}</span>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            style?.className ?? 'bg-slate-100 text-slate-600 ring-slate-400/20'
                          }`}
                        >
                          {style?.label ?? r.status}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-slate-500" title={contentOf(r)}>
                        {contentOf(r)}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => void copyKakao(r)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                            title="카톡 양식으로 복사"
                          >
                            <Copy size={13} />
                          </button>
                          {r.reportUrl && (
                            <a
                              href={r.reportUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                              title="카비오 진단서 열기"
                            >
                              진단서 <ExternalLink size={11} />
                            </a>
                          )}
                          {done ? (
                            <span
                              className="rounded-md px-2 py-1 text-xs font-medium text-slate-300"
                              title="이미 매입 관리에 있는 차량번호입니다"
                            >
                              매입등록됨
                            </span>
                          ) : (
                            <button
                              onClick={() => setIntakePreset(toIntake(r))}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                              title="이 계약을 매입 관리에 넘깁니다 (진단서는 넘기지 않습니다)"
                            >
                              매입등록
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {intakePreset && (
        <PurchaseIntakeForm
          editing={null}
          preset={intakePreset}
          presetHint="카비오에서 가져왔습니다. 구전·고객번호·연식·연료는 저쪽에 없는 값이라 직접 채워 주세요."
          onSave={saveIntake}
          onClose={() => setIntakePreset(null)}
        />
      )}
    </>
  );
}
