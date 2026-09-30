import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { withCommas } from '../../lib/money';
import { readPanelInvoice, type PanelInvoiceRead } from '../../lib/panelInvoice';

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

/** 붙일 수 있는 정산 — 매입 정산에 올라와 있는 차들이다 */
export interface PanelInvoiceTarget {
  vehicleNumber: string;
  vehicleName: string;
  /** 이 차에 이미 들어가 있는 판금·덴트 금액. 0이면 아직 비어 있는 차다 */
  dent: number;
}

interface Row {
  vehicleNumber: string;
  vehicleName: string;
  panelCount: number;
  work: string;
  amount: number;
  /** 손으로 고친 줄 — 메모에 남겨서 나중에 왜 다른지 알 수 있게 한다 */
  edited?: boolean;
  /** 청구서에 적혀 온 원래 차량번호. 다른 차로 옮겼을 때 어디서 온 금액인지 남긴다 */
  origin?: string;
  /** 손으로 더한 줄 — 청구서에 없던 줄이다 */
  added?: boolean;
}

interface Result {
  applied: { vehicleNumber: string; vehicleName: string; amount: number }[];
  skipped: { vehicleNumber: string; reason: string }[];
  locked: { vehicleNumber: string }[];
}

const plateKey = (v: string) => v.replace(/\s/g, '');

export default function PanelInvoiceModal({
  targets,
  myName,
  onClose,
  onApplied,
}: {
  targets: PanelInvoiceTarget[];
  /** 내 이름 — 거래처별로 나뉘어 온 파일에서 내 장을 먼저 고른다 */
  myName?: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [vendor, setVendor] = useState('대산');
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  /** 읽힌 장들과 지금 보는 장 — 대산 파일은 거래처마다 한 장씩 백 장이 넘는다 */
  const [sheets, setSheets] = useState<PanelInvoiceRead['sheets']>([]);
  const [sheetName, setSheetName] = useState('');
  /** 못 읽었을 때 무엇을 봤는지 — 어느 시트의 어떤 칸을 봤는지 그대로 띄운다 */
  const [looked, setLooked] = useState<PanelInvoiceRead['looked']>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    청구서에 찍힌 총액.

    줄마다 적힌 금액을 다 더해도 청구서 총액과 안 맞는 달이 있다 — 판을 몇 개로 셌는지가
    현장과 판금집이 달라서다. 그걸 한 줄씩 따져 맞추는 건 사람이 할 일이 아니라서,
    총액을 적어 두고 차액이 얼마인지 보이게만 한다. 어디에 얹을지는 보는 사람이 정한다.
  */
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /*
    청구서 줄이 어느 정산에 붙는지 넣기 전에 여기서 본다.

    서버도 같은 기준으로 다시 맞추지만(전체 번호 → 뒤 네 자리), 넣고 나서야 '없는 차'를
    알면 그 금액이 어디로 갔는지 모른 채 총액만 안 맞는다. 붙기 전에 보여주고, 없는 차는
    다른 차로 옮길 수 있게 한다.
  */
  const byPlate = useMemo(() => new Map(targets.map(t => [plateKey(t.vehicleNumber), t])), [targets]);
  const byTail = useMemo(() => {
    const m = new Map<string, PanelInvoiceTarget[]>();
    for (const t of targets) {
      const tail = plateKey(t.vehicleNumber).slice(-4);
      if (tail.length === 4) m.set(tail, [...(m.get(tail) ?? []), t]);
    }
    return m;
  }, [targets]);

  const matchOf = (plate: string): PanelInvoiceTarget | null => {
    const key = plateKey(plate);
    if (!key) return null;
    const exact = byPlate.get(key);
    if (exact) return exact;
    const hits = byTail.get(key.slice(-4)) ?? [];
    return hits.length === 1 ? hits[0] : null;
  };

  const patch = (index: number, next: Partial<Row>) =>
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...next, edited: true } : r)));

  /** 다른 차로 옮긴다 — 청구서에 적혀 온 번호는 남겨서 어디서 온 금액인지 알 수 있게 한다 */
  const moveTo = (index: number, plate: string) =>
    setRows(prev =>
      prev.map((r, i) => (i === index ? { ...r, origin: r.origin ?? r.vehicleNumber, vehicleNumber: plate, edited: true } : r)),
    );

  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  const read = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const got = readPanelInvoice(book, myName);

      if (got.sheets.length === 0) {
        setError('읽을 줄이 없습니다. 차량번호와 금액 칸이 있는지 확인해 주세요.');
      }
      setSheets(got.sheets);
      setSheetName(got.picked);
      setRows(got.sheets.find(x => x.name === got.picked)?.rows ?? []);
      setLooked(got.looked);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : '엑셀을 읽지 못했습니다.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /** 다른 장을 고른다 — 손으로 고쳐 둔 것은 그 장 것이라 같이 버린다 */
  const pickSheet = (name: string) => {
    setSheetName(name);
    setRows(sheets.find(x => x.name === name)?.rows ?? []);
    setResult(null);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
        손으로 고친 줄과 옮긴 줄은 그렇다고 남긴다.

        총액을 맞추려고 금액을 조정하거나, 청구서에 있는데 정산에 없는 차를 다른 차에
        얹는 일이 있다. 표시가 없으면 나중에 청구서와 견줄 때 어디가 왜 다른지 아무도
        모른다 — 그 차 원가에 왜 이 금액이 붙어 있는지도 모른다.
      */
      const body = {
        vendor,
        rows: rows
          .filter(r => plateKey(r.vehicleNumber) && r.amount > 0)
          .map(r => ({
            vehicleNumber: r.vehicleNumber,
            vehicleName: r.vehicleName,
            panelCount: r.panelCount,
            work: [
              r.work,
              r.origin && plateKey(r.origin) !== plateKey(r.vehicleNumber) ? `(${r.origin} 대체)` : '',
              r.added ? '(손으로 추가)' : '',
              r.edited && !r.added ? '(금액 조정)' : '',
            ]
              .filter(Boolean)
              .join(' '),
            amount: r.amount,
          })),
      };
      setResult(await api<Result>('/settlements/purchase/panel-invoice', { method: 'POST', body }));
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const stated = Number(invoiceTotal.replace(/[^\d]/g, '')) || 0;
  /** 청구서 총액과 줄 합계의 차이 — 양수면 줄에 덜 적힌 것이고, 음수면 오바다 */
  const gap = stated > 0 ? stated - sum : 0;
  /** 붙을 곳이 없는 줄 — 이대로 넣으면 이 금액만큼 판금·덴트 총액이 빈다 */
  const orphan = rows.filter(r => plateKey(r.vehicleNumber) && !matchOf(r.vehicleNumber));
  const orphanSum = orphan.reduce((s, r) => s + r.amount, 0);
  /** 실제로 정산에 꽂히는 금액 */
  const landing = sum - orphanSum;

  const addRow = () =>
    setRows(prev => [
      ...prev,
      {
        vehicleNumber: '',
        vehicleName: '',
        panelCount: 0,
        work: '',
        // 모자란 만큼을 미리 채워 둔다 — 대개 그걸 맞추려고 줄을 더한다
        amount: Math.max(0, gap > 0 ? gap : orphanSum),
        added: true,
        edited: true,
      },
    ]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">판금 청구서 넣기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          판금집에서 받은 엑셀을 그대로 넣으면 차량번호로 맞춰 매입 정산의 <b>판금·덴트</b> 칸에 꽂습니다. 정산에 없는
          차는 <b>붙을 곳 없음</b>으로 띄웁니다 — 총액을 맞추려면 다른 차로 옮기거나 금액을 고치세요.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            업체
            <input
              value={vendor}
              list="panel-invoice-vendors"
              onChange={e => setVendor(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            {/* 업체마다 한 줄씩 들어간다 — 대산과 KS를 각각 넣으면 판금·덴트는 둘을 더한 값이 된다 */}
            <datalist id="panel-invoice-vendors">
              <option value="대산" />
              <option value="KS" />
            </datalist>
          </label>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <FileSpreadsheet size={14} /> 엑셀 고르기
          </button>
          {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
          {/*
            어느 장을 넣을지 고른다.

            대산은 거래처마다 한 장씩 담아 백 장이 넘는 파일 하나를 보낸다. 아무 장이나
            먼저 골라 넣으면 남의 거래처 판금비가 우리 차에 붙는다 — 내 이름과 같은 장을
            먼저 띄우고, 다르면 여기서 바꾼다.
          */}
          {sheets.length > 0 && (
            <label className="text-xs text-slate-500">
              시트
              <select
                value={sheetName}
                onChange={e => pickSheet(e.target.value)}
                className="mt-1 block max-w-[220px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              >
                {sheets.map(x => (
                  <option key={x.name} value={x.name}>
                    {x.name} · {x.rows.length}줄 · {withCommas(String(x.total))}원
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => void read(e.target.files)}
            className="hidden"
          />
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {/* 못 읽었을 때 — 어느 시트에서 무슨 칸을 봤는지 그대로 보여준다 */}
        {looked.length > 0 && (
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <p className="font-medium text-slate-600">읽어본 시트</p>
            <ul className="mt-1 space-y-0.5">
              {looked.map((l, i) => (
                <li key={i}>
                  <b>{l.sheet}</b> — {l.headers.length > 0 ? l.headers.join(' | ') : '칸 이름을 못 찾았습니다'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && !result && (
          <>
            {/*
              줄 합계와 청구서 총액을 나란히 둔다.

              판을 몇 개로 셌는지가 현장과 판금집이 달라서 안 맞는 달이 있다. 어디가
              틀렸는지 한 줄씩 따지는 건 사람이 할 일이 아니라, 차액만 보여주고 금액은
              손으로 고치게 둔다.
            */}
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs text-slate-500">
                읽은 줄 <b className="text-sm text-slate-700">{rows.length}</b>
              </span>
              <span className="text-xs text-slate-500">
                줄 합계 <b className="text-sm text-slate-800">{withCommas(String(sum))}</b>원
              </span>
              {/* 붙을 곳 없는 줄을 뺀 금액 — 판금·덴트 총액은 이 값이 된다 */}
              {orphanSum > 0 && (
                <span className="text-xs text-slate-500">
                  실제 반영 <b className="text-sm text-slate-800">{withCommas(String(landing))}</b>원
                </span>
              )}
              <label className="text-xs text-slate-500">
                청구서 총액
                <input
                  value={withCommas(invoiceTotal)}
                  onChange={e => setInvoiceTotal(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  placeholder="16,049,000"
                  className="mt-1 block w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
                />
              </label>
              {stated > 0 && (
                <span
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    gap === 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : gap < 0
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {gap === 0
                    ? '✓ 딱 맞습니다'
                    : gap < 0
                      ? `오바 ${withCommas(String(-gap))}원`
                      : `모자람 ${withCommas(String(gap))}원`}
                </span>
              )}
              <button
                onClick={addRow}
                className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Plus size={12} /> 줄 추가
              </button>
              {gap !== 0 && (
                <span className="w-full text-[11px] text-slate-400">
                  금액 칸을 고치거나, 얹을 줄의 <b>[차액]</b> 을 누르세요
                </span>
              )}
            </div>

            {/* 붙을 곳이 없는 줄 — 그대로 넣으면 그만큼 총액이 빈다 */}
            {orphan.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                <b>
                  {orphan.length}건 {withCommas(String(orphanSum))}원
                </b>
                은 매입 정산에 없는 차입니다. 그대로 넣으면 그만큼 판금·덴트 총액이 빕니다 — 차량번호 칸에서 다른 차를
                고르면 그 차에 얹힙니다(어느 차에서 온 금액인지 작업내용에 남습니다).
              </p>
            )}

            {/* 어느 차로 옮길지 — 판금이 아직 비어 있는 차를 먼저 보여준다 */}
            <datalist id="panel-invoice-plates">
              {[...targets]
                .sort((a, b) => a.dent - b.dent)
                .map(t => (
                  <option key={t.vehicleNumber} value={t.vehicleNumber}>
                    {t.vehicleName} {t.dent > 0 ? `· 판금 ${withCommas(String(t.dent))}` : '· 비어 있음'}
                  </option>
                ))}
            </datalist>

            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-400">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">차량번호</th>
                    <th className="px-2.5 py-1.5 font-medium">차명</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">판수</th>
                    <th className="px-2.5 py-1.5 font-medium">작업내용</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">금액</th>
                    <th className="px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => {
                    const hit = matchOf(r.vehicleNumber);
                    const moved = r.origin && plateKey(r.origin) !== plateKey(r.vehicleNumber);
                    return (
                      <tr key={i} className={r.edited ? 'bg-amber-50/50' : ''}>
                        {/* 번호가 틀리게 읽힌 줄도 여기서 고친다 — 못 붙은 채로 넘기면 그 차만 원가가 빈다 */}
                        <td className="px-2.5 py-1">
                          <input
                            value={r.vehicleNumber}
                            list="panel-invoice-plates"
                            onChange={e => moveTo(i, e.target.value)}
                            className={`w-28 rounded border bg-transparent px-1 py-0.5 font-mono focus:border-indigo-400 focus:bg-white focus:outline-none ${
                              hit
                                ? 'border-transparent text-slate-700 hover:border-slate-200'
                                : 'border-amber-300 text-amber-800'
                            }`}
                          />
                          {!hit && <span className="ml-1 text-[10px] font-bold text-amber-700">붙을 곳 없음</span>}
                          {moved && (
                            <span className="ml-1 text-[10px] text-slate-400" title={`청구서에는 ${r.origin}`}>
                              ← {r.origin}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1 text-slate-600">
                          {r.vehicleName || hit?.vehicleName || ''}
                          {hit && hit.dent > 0 && (
                            <span className="ml-1 text-[10px] text-slate-400" title="이 차에 이미 들어간 판금·덴트">
                              (판금 {withCommas(String(hit.dent))})
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1 text-right text-slate-500">{r.panelCount || '–'}</td>
                        <td className="px-2.5 py-1 text-slate-500">{r.work}</td>
                        <td className="whitespace-nowrap px-2.5 py-1 text-right">
                          <input
                            value={withCommas(String(r.amount))}
                            onChange={e => patch(i, { amount: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                            inputMode="numeric"
                            className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-semibold text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                          />
                        </td>
                        <td className="whitespace-nowrap px-1 py-1">
                          {/* 차액을 이 줄에 몰아 얹는다 — 어디에 얹을지는 보는 사람이 안다 */}
                          {gap !== 0 && (
                            <button
                              onClick={() => patch(i, { amount: Math.max(0, r.amount + gap) })}
                              title={`차액 ${withCommas(String(gap))}원을 이 줄에 얹습니다`}
                              className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                            >
                              차액
                            </button>
                          )}
                          <button
                            onClick={() => removeRow(i)}
                            title="이 줄은 빼고 넣습니다"
                            className="ml-1 rounded px-1 py-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                          >
                            <X size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
