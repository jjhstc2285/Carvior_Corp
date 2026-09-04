import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';

interface SampleRow {
  sourceId: string;
  kind: 'BROKERAGE' | 'EXPORT';
  date: string;
  vehicleNumber: string;
  vehicleName: string;
  platform: string;
  customerPhone: string;
  counselor: string;
  content: string;
}

interface Preview {
  /** 시트에서 읽어낸 전체 */
  total: number;
  /** 이미 넣어둔 건 */
  already: number;
  toImport: number;
  exportCount: number;
  brokerageCount: number;
  /** 직원과 못 맞춘 상담자 이름 */
  unmatchedCounselors: string[];
  skipped: { no: string; reason: string }[];
  sample: SampleRow[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

/**
 * 구글 시트 '알선 상담 정리' 를 옮겨온다.
 *
 * 1500건이 한 번에 들어오는 일이라 무엇이 들어오는지 먼저 보여주고 확인받는다.
 * 이미 넣은 건은 원래 번호로 건너뛰므로 여러 번 눌러도 겹치지 않는다.
 */
export default function ConsultationSheetImportModal({ onClose, onImported }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<Preview>('/consultations/sheet/preview');
      if (myReq !== reqId.current) return;
      setPreview(data);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '시트를 읽지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!preview || preview.toImport === 0) return;
    const ok = await confirmDanger(
      `상담 ${preview.toImport.toLocaleString()}건을 옮길까요?`,
      `수출 ${preview.exportCount.toLocaleString()}건 · 알선 ${preview.brokerageCount.toLocaleString()}건. 지난 상담이라 모두 '종결'로 들어갑니다.`,
      '가져오기',
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api<{ imported: number }>('/consultations/sheet/import', { method: 'POST' });
      await alertSuccess(`${res.imported.toLocaleString()}건을 옮겼습니다`, '알선·수출 탭에서 확인하세요.');
      onImported();
      onClose();
    } catch (e) {
      void alertError('옮기지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-6 sm:p-10" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">구글 시트에서 상담 가져오기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          '알선 상담 정리' 시트를 옮깁니다. 상담내용이 <b>수출</b>로 시작하거나 그 말이 들어가면 수출 상담으로,
          나머지는 알선으로 갑니다. <b>이미 옮긴 건은 건너뛰므로</b> 여러 번 눌러도 겹치지 않습니다.
        </p>

        {loading && <p className="py-10 text-center text-sm text-slate-400">시트를 읽는 중…</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

        {preview && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                <p className="text-[11px] text-emerald-700/80">옮길 상담</p>
                <p className="text-xl font-bold text-emerald-700">
                  {preview.toImport.toLocaleString()}
                  <span className="ml-0.5 text-xs text-slate-400">건</span>
                </p>
                <p className="text-[10px] text-slate-400">시트 전체 {preview.total.toLocaleString()}건</p>
              </div>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 px-3 py-2.5">
                <p className="text-[11px] text-cyan-700/80">수출</p>
                <p className="text-xl font-bold text-cyan-700">{preview.exportCount.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">알선 (내수)</p>
                <p className="text-xl font-bold text-slate-700">{preview.brokerageCount.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">이미 옮김</p>
                <p className="text-xl font-bold text-slate-400">{preview.already.toLocaleString()}</p>
              </div>
            </div>

            {preview.unmatchedCounselors.length > 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900">
                <AlertTriangle size={12} className="mr-1 inline" />
                직원과 못 맞춘 상담자 — {preview.unmatchedCounselors.join(', ')}. 이 건들은 <b>가져오는 사람 앞으로</b> 들어갑니다.
                담당자는 나중에 상담 수정에서 바꿀 수 있습니다.
              </p>
            )}

            <p className="mt-3 mb-1.5 text-xs font-bold text-slate-600">앞 {preview.sample.length}건 미리보기</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full whitespace-nowrap text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">구분</th>
                    <th className="px-3 py-2 font-medium">상담일</th>
                    <th className="px-3 py-2 font-medium">차량번호</th>
                    <th className="px-3 py-2 font-medium">차명</th>
                    <th className="px-3 py-2 font-medium">손님번호</th>
                    <th className="px-3 py-2 font-medium">상담자</th>
                    <th className="px-3 py-2 font-medium">내용</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map(r => (
                    <tr key={r.sourceId} className="border-t border-slate-50">
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            r.kind === 'EXPORT' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {r.kind === 'EXPORT' ? '수출' : '알선'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{r.date}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700">{r.vehicleNumber}</td>
                      <td className="px-3 py-1.5 text-slate-600">{r.vehicleName}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.customerPhone}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.counselor}</td>
                      <td className="max-w-64 truncate px-3 py-1.5 text-slate-400">{r.content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.skipped.length > 0 && (
              <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={13} /> 건너뛴 줄 {preview.skipped.length}건
                </summary>
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-900/80">
                  {preview.skipped.map((s, i) => (
                    <li key={i}>
                      <b>{s.no}</b> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="mt-3 text-[11px] text-slate-400">
              지난 상담이라 <b>모두 '종결'로 들어갑니다</b> — 진행중으로 두면 안 끝난 건 목록이 1500건으로 덮여
              정작 처리할 건이 묻힙니다. 상담 시각은 시트에 없어 00:00으로 둡니다.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                취소
              </button>
              <button
                onClick={() => void run()}
                disabled={busy || preview.toImport === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Download size={15} /> {busy ? '옮기는 중…' : `${preview.toImport.toLocaleString()}건 가져오기`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
