import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { withCommas } from '../../lib/money';

/**
 * 판금집 청구서 넣기.
 *
 * 대산에서 달마다 엑셀로 청구서를 보낸다 — 날짜·차명·차량번호·판수·작업내용·금액이
 * 한 줄씩 서른 줄쯤 온다. 지금은 그걸 보면서 정산을 한 건씩 열어 판금 금액을 옮겨
 * 친다. 서른 번을 옮기면 몇 건은 빠지고, 빠진 건 원가가 낮게 잡힌 채로 결재까지 간다.
 *
 * 파일을 그대로 넣는다. 읽는 건 이 화면에서 하고 서버에는 줄만 보낸다 — 엑셀 모양이
 * 바뀌어도 서버를 고칠 일이 없다.
 *
 * 넣기 전에 무엇이 붙고 무엇이 안 붙는지 먼저 보여준다. 못 찾은 차를 모른 채 반영하면
 * 그 차 원가만 조용히 비어 있게 된다.
 */

/** 청구서에 적힌 칸 이름 — 시트마다 조금씩 다르게 적혀 와서 여러 이름을 받는다 */
const FIELD = {
  plate: ['차량번호', '차번호', '번호'],
  name: ['차명', '차종', '차량명'],
  count: ['판수', '판', '수량'],
  work: ['작업내용', '내용', '작업'],
  total: ['금액', '합계', '청구금액', '총액'],
  supply: ['공급가액', '공급가'],
  vat: ['세액', '부가세'],
} as const;

interface Row {
  vehicleNumber: string;
  vehicleName: string;
  panelCount: number;
  work: string;
  amount: number;
}

interface Result {
  applied: { vehicleNumber: string; vehicleName: string; amount: number }[];
  skipped: { vehicleNumber: string; reason: string }[];
  locked: { vehicleNumber: string }[];
}

/** 시트 칸 이름이 조금 달라도 찾아낸다 */
function pick(row: Record<string, unknown>, names: readonly string[]): unknown {
  const keys = Object.keys(row);
  for (const want of names) {
    const hit = keys.find(k => k.replace(/\s/g, '') === want);
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Math.round(v);
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

export default function PanelInvoiceModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [vendor, setVendor] = useState('대산');
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const read = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const sheet = book.Sheets[book.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const parsed = raw
        .map(r => {
          // 금액 칸이 비어 있으면 공급가 + 세액으로 낸다 — 합계를 안 적어 보내는 시트가 있다
          const total = toNumber(pick(r, FIELD.total)) || toNumber(pick(r, FIELD.supply)) + toNumber(pick(r, FIELD.vat));
          return {
            vehicleNumber: String(pick(r, FIELD.plate) ?? '').trim(),
            vehicleName: String(pick(r, FIELD.name) ?? '').trim(),
            panelCount: toNumber(pick(r, FIELD.count)),
            work: String(pick(r, FIELD.work) ?? '').trim(),
            amount: total,
          };
        })
        // 합계 줄과 빈 줄을 걷어낸다
        .filter(r => r.vehicleNumber && r.amount > 0 && !/합계|소계|계$/.test(r.vehicleNumber));

      if (parsed.length === 0) {
        setError('읽을 줄이 없습니다. 차량번호와 금액 칸이 있는지 확인해 주세요.');
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : '엑셀을 읽지 못했습니다.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Result>('/settlements/purchase/panel-invoice', { method: 'POST', body: { vendor, rows } }));
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const sum = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">판금 청구서 넣기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          판금집에서 받은 엑셀을 그대로 넣으면 차량번호로 맞춰 매입 정산의 <b>판금·덴트</b> 칸에 꽂습니다. 못 찾은
          차는 붙이지 않고 그대로 보여드립니다.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            업체
            <input
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <FileSpreadsheet size={14} /> 엑셀 고르기
          </button>
          {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => void read(e.target.files)}
            className="hidden"
          />
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {rows.length > 0 && !result && (
          <>
            <p className="mt-3 text-xs text-slate-500">
              <b className="text-slate-700">{rows.length}줄</b> · 합계{' '}
              <b className="text-slate-700">{withCommas(String(sum))}</b>원
            </p>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-400">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">차량번호</th>
                    <th className="px-2.5 py-1.5 font-medium">차명</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">판수</th>
                    <th className="px-2.5 py-1.5 font-medium">작업내용</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-2.5 py-1 font-mono text-slate-700">{r.vehicleNumber}</td>
                      <td className="whitespace-nowrap px-2.5 py-1 text-slate-600">{r.vehicleName}</td>
                      <td className="px-2.5 py-1 text-right text-slate-500">{r.panelCount || '–'}</td>
                      <td className="px-2.5 py-1 text-slate-500">{r.work}</td>
                      <td className="whitespace-nowrap px-2.5 py-1 text-right font-semibold text-slate-800">
                        {withCommas(String(r.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 넣고 난 뒤 — 무엇이 붙었고 무엇이 안 붙었는지 */}
        {result && (
          <div className="mt-3 space-y-2 text-xs">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
              <b>{result.applied.length}건</b> 반영했습니다.
            </p>
            {result.locked.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                <b>{result.locked.length}건</b>은 결재가 끝나 못 고칩니다 — 승인을 취소해야 들어갑니다.
                <p className="mt-1 font-mono text-[11px] text-amber-700">
                  {result.locked.map(x => x.vehicleNumber).join(', ')}
                </p>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                <b>{result.skipped.length}건</b>은 붙이지 못했습니다.
                <ul className="mt-1 space-y-0.5">
                  {result.skipped.map((x, i) => (
                    <li key={i} className="text-[11px]">
                      <span className="font-mono">{x.vehicleNumber}</span> — {x.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            {result ? '닫기' : '취소'}
          </button>
          {!result && (
            <button
              onClick={() => void apply()}
              disabled={busy || rows.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? '반영 중…' : `${rows.length}건 반영`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
