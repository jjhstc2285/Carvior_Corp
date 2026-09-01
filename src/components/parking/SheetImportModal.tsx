import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';

interface Spot {
  lot: string;
  zone: string;
  slot: string;
  vehicleNumber: string;
  vehicleModel: string;
  memo: string;
  /** 앱에 이미 등록돼 있다면 지금 자리 */
  occupiedBy?: string;
}

interface Skipped {
  where: string;
  value: string;
  reason: string;
}

interface Preview {
  spots: Spot[];
  skipped: Skipped[];
  /** 시트에 있는데 차량관리에 없는 차량번호 — 같이 등록된다 */
  newVehicles: string[];
  /** 시트 전체에서 찾은 차량번호 수 */
  plateCount: number;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

/**
 * 구글 시트에서 주차 배치를 한 번 옮겨온다.
 *
 * 옮긴 뒤에는 앱이 정답이고 시트는 보지 않는다 — 계속 맞추면 여기서 끌어다 옮긴 게
 * 다음 동기화에 되돌아간다.
 *
 * 백 대가 넘는 자리를 확인 없이 덮어쓰면 무엇이 바뀌었는지 알 수 없어서,
 * 무엇이 들어오고 무엇이 빠지는지 먼저 보여준 다음 실행한다.
 */
export default function SheetImportModal({ onClose, onImported }: Props) {
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
      const data = await api<Preview>('/parking/sheet/preview');
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

  const moved = preview?.spots.filter(s => s.occupiedBy && s.occupiedBy !== `${s.lot} ${s.zone} ${s.slot}`) ?? [];

  const run = async () => {
    if (!preview) return;
    const ok = await confirmDanger(
      `차량 ${preview.newVehicles.length}대를 등록하고 ${preview.spots.length}대를 시트 자리로 맞출까요?`,
      moved.length > 0
        ? `이 중 ${moved.length}대는 앱에 이미 다른 자리로 등록돼 있어 시트 자리로 옮겨집니다.`
        : undefined,
      '가져오기',
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api<{ imported: number; vehiclesAdded: number }>('/parking/sheet/import', { method: 'POST' });
      await alertSuccess(
        `차량 ${res.vehiclesAdded}대 등록, ${res.imported}대 배치 완료`,
        '차량명은 비어 있습니다 — 차량 관리에서 채워 주세요.',
      );
      onImported();
      onClose();
    } catch (e) {
      void alertError('가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">구글 시트에서 가져오기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          시트의 <b>차량번호를 모두 차량관리에 등록</b>하고, 본관 주차 배치를 자리에 맞춰 옮깁니다.
          옮긴 뒤에는 이 화면이 정답이고 시트는 보지 않습니다.
        </p>

        {loading && <p className="py-10 text-center text-sm text-slate-400">시트를 읽는 중…</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

        {preview && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                <p className="text-[11px] text-emerald-700/80">차량관리에 등록</p>
                <p className="text-xl font-bold text-emerald-700">
                  {preview.newVehicles.length}<span className="ml-0.5 text-xs text-slate-400">대</span>
                </p>
                <p className="text-[10px] text-slate-400">시트 전체 {preview.plateCount}대 중 새 차량</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">자리에 배치</p>
                <p className="text-xl font-bold text-indigo-600">{preview.spots.length}<span className="ml-0.5 text-xs text-slate-400">대</span></p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">자리가 바뀌는 차</p>
                <p className="text-xl font-bold text-amber-600">{moved.length}<span className="ml-0.5 text-xs text-slate-400">대</span></p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">건너뛴 칸</p>
                <p className="text-xl font-bold text-slate-400">{preview.skipped.length}</p>
              </div>
            </div>

            <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">자리</th>
                    <th className="px-3 py-2 font-medium">차량번호</th>
                    <th className="px-3 py-2 font-medium">차량명</th>
                    <th className="px-3 py-2 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.spots.map(s => (
                    <tr key={`${s.lot}|${s.zone}|${s.slot}`} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 text-slate-600">{s.lot} {s.zone} {s.slot}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-800">{s.vehicleNumber}</td>
                      <td className="px-3 py-1.5 text-slate-500">{s.vehicleModel || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-slate-400">
                        {s.occupiedBy && s.occupiedBy !== `${s.lot} ${s.zone} ${s.slot}` && (
                          <span className="mr-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700">{s.occupiedBy}에서 이동</span>
                        )}
                        {s.memo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.skipped.length > 0 && (
              <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={13} /> 건너뛴 칸 {preview.skipped.length}개
                </summary>
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-900/80">
                  {preview.skipped.map((s, i) => (
                    <li key={i}>
                      <b>{s.where}</b> — “{s.value}” · {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="mt-3 text-[11px] text-slate-400">
              차량번호는 시트 어디에 적혀 있든 전부 차량관리에 올라갑니다(외부 주차장 포함).
              <b> 차량명은 시트에 없어 비워둡니다</b> — 차량 관리에서 나중에 채우시면 됩니다.
              <br />
              다만 <b>자리 배치</b>는 본관(B4F·5F·B2F)만 옮깁니다. 외부 주차장은 시트에 구역 이름과
              앞/뒤 구분이 없어 자리를 맞추려면 추측이 들어갑니다.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                취소
              </button>
              <button
                onClick={() => void run()}
                disabled={busy || (preview.spots.length === 0 && preview.newVehicles.length === 0)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Download size={15} /> {busy ? '가져오는 중…' : '가져오기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
