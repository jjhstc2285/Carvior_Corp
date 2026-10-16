import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { useEscClose } from '../../lib/useEscClose';

interface PreviewItem {
  vehicleNumber: string;
  vehicleName: string;
  customerName: string;
  source: string;
  /** 원 */
  purchaseAmount: number;
  /** 구전(원) — 카비어가 안 적어둔 계약은 0 */
  brokerFee: number;
  date: string;
}

interface Skipped {
  vehicleNumber: string;
  reason: string;
}

interface Preview {
  /** 카비어가 준 계약 수(취소 제외) */
  total: number;
  items: PreviewItem[];
  skipped: Skipped[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

/**
 * 카비어에서 성사된 계약을 매입 내역으로 한 번에 옮긴다.
 *
 * 백 건 가까이 한꺼번에 들어가는 일이라, 무엇이 들어오고 무엇이 빠지는지 먼저 보여준다.
 * 이미 매입 관리에 있는 차량번호는 건너뛴다 — 두 번 눌러도 중복이 생기지 않는다.
 */
export default function CarviorImportModal({ onClose, onImported }: Props) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
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
      const data = await api<Preview>('/purchase-intake/carvior/preview');
      if (myReq !== reqId.current) return;
      setPreview(data);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '카비어 계약을 읽지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!preview || preview.items.length === 0) return;
    const ok = await confirmDanger(
      `카비어 계약 ${preview.items.length}건을 매입 관리에 등록할까요?`,
      '차량 관리에도 그 차들이 함께 올라갑니다. 고객번호·연식·연료는 카비어에 없는 값이라 비어 있습니다.',
      '일괄 등록',
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api<{ imported: number; skipped: Skipped[] }>('/purchase-intake/carvior/import', {
        method: 'POST',
      });
      await alertSuccess(
        `${res.imported}건을 매입 관리에 등록했습니다`,
        '고객번호·연식·연료는 비어 있습니다 — 목록에서 채워 주세요.',
      );
      onImported();
      onClose();
    } catch (e) {
      void alertError('등록하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">카비어에서 일괄 등록</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          카비어에서 성사된 계약을 매입 내역으로 옮깁니다. 취소된 계약과 <b>이미 매입 관리에 있는 차량번호는 건너뜁니다</b> —
          여러 번 눌러도 중복되지 않습니다.
        </p>

        {loading && <p className="py-10 text-center text-sm text-slate-400">카비어를 읽는 중…</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

        {preview && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">카비어 계약</p>
                <p className="text-xl font-bold text-slate-700">
                  {preview.total}
                  <span className="ml-0.5 text-xs text-slate-400">건</span>
                </p>
                <p className="text-[10px] text-slate-400">취소 건 제외</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                <p className="text-[11px] text-emerald-700/80">새로 등록</p>
                <p className="text-xl font-bold text-emerald-700">
                  {preview.items.length}
                  <span className="ml-0.5 text-xs text-slate-400">건</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">건너뜀</p>
                <p className="text-xl font-bold text-slate-400">{preview.skipped.length}</p>
              </div>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">계약일</th>
                    <th className="px-3 py-2 font-medium">차량번호</th>
                    <th className="px-3 py-2 font-medium">차명</th>
                    <th className="px-3 py-2 font-medium">고객이름</th>
                    <th className="px-3 py-2 font-medium">매입처</th>
                    <th className="px-3 py-2 text-right font-medium">실매입금액</th>
                    <th className="px-3 py-2 text-right font-medium">구전</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        새로 등록할 계약이 없습니다.
                      </td>
                    </tr>
                  )}
                  {preview.items.map(i => (
                    <tr key={i.vehicleNumber} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 text-slate-500">{i.date}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-800">{i.vehicleNumber}</td>
                      <td className="px-3 py-1.5 text-slate-600">{i.vehicleName || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-slate-600">{i.customerName}</td>
                      <td className="px-3 py-1.5 text-slate-500">{i.source}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                        {i.purchaseAmount.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500">
                        {i.brokerFee ? i.brokerFee.toLocaleString() : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.skipped.length > 0 && (
              <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={13} /> 건너뛴 계약 {preview.skipped.length}건
                </summary>
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-900/80">
                  {preview.skipped.map((s, i) => (
                    <li key={i}>
                      <b>{s.vehicleNumber}</b> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="mt-3 text-[11px] text-slate-400">
              금액은 카비어의 <b>만원</b>을 <b>원</b>으로 바꿔 넣습니다. 작성자·계약금·잔금은 특이사항에 한 줄로 남깁니다.
              <br />
              구전은 카비어에 적혀 있으면 같이 들어옵니다. <b>지급 방식(현금·3.3%·13.3%)은 저쪽에 없어 현금으로 두니</b> 다르면 고쳐 주세요.
              <br />
              <b>고객번호·연식·연료는 카비어가 안 내려주는 값</b>이라 비어 있습니다 — 등록 후 목록에서 채우시면 됩니다.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                취소
              </button>
              <button
                onClick={() => void run()}
                disabled={busy || preview.items.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Download size={15} /> {busy ? '등록하는 중…' : `${preview.items.length}건 일괄 등록`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
