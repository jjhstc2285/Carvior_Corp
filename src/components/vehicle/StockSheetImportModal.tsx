import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess } from '../../lib/alert';
import { isImportable, parseStockSheet, type StockSheetParse } from '../../lib/stockSheet';

/**
 * 재고차량 장부(구글 시트) 가져오기.
 *
 * 사무실에서 달마다 쌓아온 장부를 손으로 백 대씩 옮겨 적게 두지 않는다.
 * 넣기 전에 무엇이 들어갈지 먼저 보여준다 — 확인 없이 밀어넣으면 무엇이 잘못
 * 들어갔는지 알 수가 없다(주차장 시트 가져오기와 같은 방식이다).
 *
 * 시트에서 읽는 것: 차량번호 · 차명 · 연식 · 제시일 · 재고금액 · 여신사
 * 전산이 채우는 것: 이전일자(= 제시일자) · 상환일자(여신사 규칙대로)
 */

/** 시트 주소를 매번 붙여넣지 않게 이 브라우저에 기억해 둔다 */
const URL_KEY = 'stock-sheet-url';

const NUM = (n: number) => n.toLocaleString();

export default function StockSheetImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem(URL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [parsed, setParsed] = useState<StockSheetParse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { csv } = await api<{ csv: string }>(`/vehicles/stock-sheet?url=${encodeURIComponent(url.trim())}`);
      setParsed(parseStockSheet(csv));
      try {
        localStorage.setItem(URL_KEY, url.trim());
      } catch {
        // 기억 못 해도 가져오는 데는 지장이 없다
      }
    } catch (e) {
      void alertError('시트를 읽지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  const ready = (parsed?.rows ?? []).filter(isImportable);
  const notReady = (parsed?.rows ?? []).filter(r => !isImportable(r));

  const run = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: number; updated: number }>('/vehicles/stock-import', {
        method: 'POST',
        body: {
          rows: ready.map(r => ({
            vehicleNumber: r.vehicleNumber,
            vehicleModel: r.vehicleModel,
            modelYear: r.modelYear,
            offerDate: r.offerDate,
            repayDate: r.repayDate!,
            stockCapital: r.stockCapital,
            stockAmount: r.stockAmount,
          })),
        },
      });
      void alertSuccess('가져왔습니다', `새로 등록 ${res.created}대 · 갱신 ${res.updated}대`);
      onImported();
      onClose();
    } catch (e) {
      void alertError('가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">재고차량 장부 가져오기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          구글 시트 주소를 넣고 먼저 확인한 다음 가져옵니다. 시트는 <b>링크가 있는 모든 사용자</b>가 볼 수 있어야 합니다.
          <br />
          이전일자는 <b>제시일자와 같은 날</b>로, 상환일자는 <b>여신사 규칙대로</b> 전산이 채웁니다. 시트에 적힌 상환일자는 쓰지 않습니다.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => void load()}
            disabled={busy || !url.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} 확인하기
          </button>
        </div>

        {parsed && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                들어갈 차 {ready.length}대
              </span>
              {notReady.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  여신사를 못 알아본 차 {notReady.length}대
                </span>
              )}
              {parsed.skipped.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">
                  못 읽은 줄 {parsed.skipped.length}개
                </span>
              )}
            </div>

            <div className="mt-2.5 max-h-80 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full whitespace-nowrap text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2.5 py-2 font-medium">차량번호</th>
                    <th className="px-2.5 py-2 font-medium">차명</th>
                    <th className="px-2.5 py-2 font-medium">연식</th>
                    <th className="px-2.5 py-2 font-medium">제시일자 = 이전일자</th>
                    <th className="px-2.5 py-2 font-medium">할부사</th>
                    <th className="px-2.5 py-2 text-right font-medium">재고금액</th>
                    <th className="px-2.5 py-2 font-medium">상환일자</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map(r => (
                    <tr key={r.vehicleNumber} className="border-t border-slate-50">
                      <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-700">{r.vehicleNumber}</td>
                      <td className="px-2.5 py-1.5 text-slate-600">{r.vehicleModel}</td>
                      <td className="px-2.5 py-1.5 text-slate-400">{r.modelYear || '—'}</td>
                      <td className="px-2.5 py-1.5 text-slate-600">{r.offerDate}</td>
                      <td className="px-2.5 py-1.5">
                        {r.stockCapital ? (
                          <span className="text-slate-600">
                            {r.stockCapital}
                            {/* 시트에 줄여 적은 이름과 다르면 무엇을 무엇으로 봤는지 보여준다 */}
                            {r.capitalRaw && r.capitalRaw !== r.stockCapital && (
                              <span className="ml-1 text-slate-400">({r.capitalRaw})</span>
                            )}
                          </span>
                        ) : (
                          <span className="font-bold text-amber-700">{r.capitalRaw || '없음'} — 모르는 여신사</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-slate-600">{NUM(r.stockAmount)}</td>
                      <td className="px-2.5 py-1.5 text-slate-600">{r.repayDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 왜 빠졌는지 안 보여주면 몇 대가 조용히 사라진다 */}
            {parsed.skipped.length > 0 && (
              <details className="mt-2.5 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold">못 읽은 줄 {parsed.skipped.length}개 보기</summary>
                <ul className="mt-1.5 space-y-0.5">
                  {parsed.skipped.map((s, i) => (
                    <li key={i} className="truncate">
                      <span className="font-semibold text-amber-700">{s.reason}</span> · {s.line}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || ready.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} {ready.length}대 가져오기
          </button>
        </div>
      </div>
    </div>
  );
}
