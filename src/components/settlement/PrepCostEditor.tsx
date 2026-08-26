import { Plus, Trash2 } from 'lucide-react';
import { toMoneyValue, withCommas } from '../../lib/money';
import {
  PREP_COST_KINDS,
  PREP_COST_LABEL,
  PREP_COST_VENDOR_HINT,
  type PrepCostKind,
} from '../../types';

/** 편집 중에는 금액을 문자열로 들고 있는다(쉼표를 붙여 보여주기 위해). */
export interface PrepCostRow {
  kind: PrepCostKind;
  vendor: string;
  amount: string;
  memo: string;
}

interface Props {
  rows: PrepCostRow[];
  onChange: (rows: PrepCostRow[]) => void;
  /** 항목별로 지금까지 쓴 업체·카테고리 이름 — 자동완성에 쓴다 */
  vendors: Record<string, string[]>;
}

const INPUT = 'rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400';

/**
 * 상품화 비용 명세 편집기.
 *
 * 항목 6종을 각각 묶음으로 두고, 묶음 안에 업체·카테고리별 줄을 쌓는다.
 * 광택은 A광택집·B광택집으로 갈리고, 진단비는 플랫폼마다 광고 형태와 비용이 다르다 —
 * 항목마다 금액 칸이 하나뿐이던 예전 구조로는 그걸 남길 데가 없었다.
 *
 * 업체명은 자유 입력이다. 한 번 쓴 이름은 다음부터 추천 목록에 뜬다(자동완성).
 */
export default function PrepCostEditor({ rows, onChange, vendors }: Props) {
  const rowsOf = (kind: PrepCostKind) =>
    rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === kind);

  const subtotalOf = (kind: PrepCostKind) =>
    rows.filter(r => r.kind === kind).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const addRow = (kind: PrepCostKind) => onChange([...rows, { kind, vendor: '', amount: '', memo: '' }]);

  const patchRow = (index: number, patch: Partial<PrepCostRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2">
        <span className="text-xs font-bold text-slate-600">상품화 비용 명세</span>
        <span className="text-xs text-slate-500">
          합계 <b className="text-sm text-slate-800">{total.toLocaleString()}</b> 만원
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {PREP_COST_KINDS.map(kind => {
          const kindRows = rowsOf(kind);
          const subtotal = subtotalOf(kind);

          return (
            <div key={kind} className="px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-700">{PREP_COST_LABEL[kind]}</span>
                  <span className="text-[11px] text-slate-400">{kindRows.length ? `${kindRows.length}건` : '없음'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${subtotal ? 'text-slate-800' : 'text-slate-300'}`}>
                    {subtotal.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => addRow(kind)}
                    className="flex items-center gap-0.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    <Plus size={11} /> 추가
                  </button>
                </div>
              </div>

              {kindRows.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {kindRows.map(({ row, index }) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <input
                        value={row.vendor}
                        onChange={e => patchRow(index, { vendor: e.target.value })}
                        list={`prep-vendors-${kind}`}
                        placeholder={PREP_COST_VENDOR_HINT[kind]}
                        className={`${INPUT} min-w-0 flex-1`}
                      />
                      <input
                        value={withCommas(row.amount)}
                        onChange={e => patchRow(index, { amount: toMoneyValue(e.target.value) })}
                        inputMode="numeric"
                        placeholder="0"
                        className={`${INPUT} w-24 text-right`}
                      />
                      <input
                        value={row.memo}
                        onChange={e => patchRow(index, { memo: e.target.value })}
                        placeholder="메모"
                        className={`${INPUT} w-28 shrink-0`}
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="shrink-0 rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 한 번 쓴 이름은 다음부터 여기서 추천된다 */}
              <datalist id={`prep-vendors-${kind}`}>
                {(vendors[kind] ?? []).map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          );
        })}
      </div>
    </div>
  );
}
