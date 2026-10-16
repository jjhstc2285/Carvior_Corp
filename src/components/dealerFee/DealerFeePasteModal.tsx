import { useMemo, useState } from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess } from '../../lib/alert';
import { DEALER_FEE_METHOD_LABEL, type DealerFeeMethod } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

interface ParsedRow {
  dealerName: string;
  managerName: string;
  managerPhone: string;
  startedOn: string | null;
  bank: string;
  accountHolder: string;
  accountNumber: string;
  transferDay: string;
  monthlyFee: number;
  feeNote: string;
  method: DealerFeeMethod;
  note: string;
  autoTransferUntil: string;
  memo: string;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

/** 엑셀에서 그대로 복사하면 칸이 탭으로 나뉘어 온다. 시트 칸 순서를 그대로 따른다. */
const COLUMNS = [
  '업체명',
  '담당자',
  '담당연락처',
  '거래시작일',
  '은행',
  '예금주',
  '자동이체계좌',
  '자동이체날짜',
  '매달 회비',
  '자동이체여부',
  '비고',
  '자동이체기한',
  '메모',
] as const;

/** "2025-03-01", "2025.03.01", "2025/3/1" 을 다 받는다 — 엑셀 설정마다 달라진다. */
function toDate(text: string): string | null {
  const m = text.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * "100,000" 은 금액, 그 밖의 말은 조건으로 적어둔다.
 *
 * 숫자로 안 떨어지는 조건은 사람이 보고 판단할 일이라 문장 그대로 남긴다.
 */
function toFee(text: string): { monthlyFee: number; feeNote: string } {
  const raw = text.trim();
  if (!raw) return { monthlyFee: 0, feeNote: '' };
  if (/^[\d,]+$/.test(raw)) return { monthlyFee: Number(raw.replace(/,/g, '')) || 0, feeNote: '' };
  return { monthlyFee: 0, feeNote: raw.slice(0, 60) };
}

function toMethod(text: string): DealerFeeMethod {
  const raw = text.replace(/\s/g, '');
  if (raw.includes('해지')) return 'CANCELED';
  if (raw.includes('직접')) return 'DIRECT';
  return 'AUTO';
}

/**
 * 붙여넣은 표를 줄 단위로 읽는다.
 *
 * 머리글 줄이 섞여 와도 업체명 칸이 '업체명'이면 건너뛴다. 빈 줄과 업체명 없는 줄도 버린다 —
 * 엑셀에서 범위를 넉넉히 잡아 복사하면 아래에 빈 줄이 딸려 온다.
 */
function parse(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map(line => line.split('\t'))
    .filter(cells => cells[0]?.trim() && cells[0].trim() !== '업체명')
    .map(cells => {
      const at = (i: number) => (cells[i] ?? '').trim();
      const fee = toFee(at(8));
      return {
        dealerName: at(0).slice(0, 60),
        managerName: at(1).slice(0, 30),
        managerPhone: at(2).slice(0, 20),
        startedOn: toDate(at(3)),
        bank: at(4).slice(0, 30),
        accountHolder: at(5).slice(0, 30),
        accountNumber: at(6).slice(0, 40),
        transferDay: at(7).slice(0, 30),
        ...fee,
        method: toMethod(at(9)),
        note: at(10).slice(0, 255),
        autoTransferUntil: at(11).slice(0, 30),
        memo: at(12).slice(0, 255),
      };
    });
}

/**
 * 엑셀에서 복사해 한 번에 등록한다.
 *
 * 일흔 곳을 한 줄씩 손으로 넣는 건 일이 아니다. 시트에서 범위를 잡아 복사하고 붙여넣으면
 * 그대로 들어간다. 이미 있는 업체명은 서버가 건너뛰므로 두 번 붙여넣어도 겹치지 않는다.
 */
export default function DealerFeePasteModal({ onClose, onImported }: Props) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => parse(text), [text]);

  const run = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const res = await api<{ added: number; skipped: string[] }>('/dealer-fees/bulk', {
        method: 'POST',
        body: { items: rows },
      });
      await alertSuccess(
        `${res.added}곳을 등록했습니다`,
        res.skipped.length > 0 ? `이미 있던 ${res.skipped.length}곳은 건너뛰었습니다.` : undefined,
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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-6 sm:p-10">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">엑셀에서 한 번에 등록</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          엑셀에서 <b>머리글 빼고 내용만</b> 골라 복사(Ctrl+C)한 뒤 아래에 붙여넣으세요(Ctrl+V).
          이미 있는 업체명은 건너뜁니다.
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          칸 순서 — {COLUMNS.join(' · ')}
        </p>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          placeholder="여기에 붙여넣으세요"
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-400"
        />

        {rows.length > 0 && (
          <>
            <p className="mt-3 mb-1.5 text-xs font-bold text-slate-600">읽어낸 {rows.length}곳 — 맞는지 보고 등록하세요</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full whitespace-nowrap text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">업체명</th>
                    <th className="px-3 py-2 font-medium">담당자</th>
                    <th className="px-3 py-2 font-medium">거래시작일</th>
                    <th className="px-3 py-2 font-medium">은행 · 예금주</th>
                    <th className="px-3 py-2 font-medium">이체날짜</th>
                    <th className="px-3 py-2 text-right font-medium">회비</th>
                    <th className="px-3 py-2 font-medium">이체여부</th>
                    <th className="px-3 py-2 font-medium">기한</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 font-semibold text-slate-800">{r.dealerName}</td>
                      <td className="px-3 py-1.5 text-slate-600">{r.managerName}</td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {r.startedOn ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{[r.bank, r.accountHolder].filter(Boolean).join(' · ')}</td>
                      <td className="px-3 py-1.5 text-slate-600">{r.transferDay}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                        {r.monthlyFee ? (
                          r.monthlyFee.toLocaleString()
                        ) : (
                          <span className="text-amber-700">{r.feeNote}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{DEALER_FEE_METHOD_LABEL[r.method]}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.autoTransferUntil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              회비가 숫자면 <b>매달 회비</b>로 들어가고, 숫자가 아닌 말은 <b>회비 조건</b>에 그대로 적어둡니다.
            </p>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <ClipboardPaste size={15} /> {busy ? '등록하는 중…' : `${rows.length}곳 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}
