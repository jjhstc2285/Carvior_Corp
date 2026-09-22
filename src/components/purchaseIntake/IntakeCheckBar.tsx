import { useEffect, useState } from 'react';
import { CHECK_ITEMS, DENT_PRICE, estimateCost, panelUnit, parseChecked, PREP_VENDORS, serializeChecked } from '../../lib/inspectionCheck';
import { digitsOnly } from '../../lib/money';
import type { PurchaseIntake } from '../../types';

/**
 * 매물 줄에서 바로 하는 실차 검차.
 *
 * 창을 열고 들어가서 체크하게 두면 현장에서 안 쓴다 — 차 앞에 서서 휴대폰으로 누르는
 * 일이라, 목록에 뜬 그 줄에서 바로 눌러야 한다.
 *
 * 누르는 즉시 저장한다. 저장 단추를 따로 두면 체크만 하고 안 누르고 나간다.
 */

const INPUT =
  'w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400 disabled:opacity-50';

interface Props {
  item: PurchaseIntake;
  /** 성공하면 null, 실패하면 화면에 띄울 말 */
  onPatch: (patch: Partial<PurchaseIntake>) => Promise<string | null>;
}

export default function IntakeCheckBar({ item, onPatch }: Props) {
  const [checked, setChecked] = useState(() => parseChecked(item.checkedItems ?? ''));
  const [panel, setPanel] = useState(String(item.panelCount ?? 0));
  const [dent, setDent] = useState(String(item.dentCount ?? 0));
  const [large, setLarge] = useState(String(item.dentLargeCount ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 사람이 고친 게 들어오면 따라간다 — 내가 누르는 중이 아닐 때만
  useEffect(() => {
    if (busy) return;
    setChecked(parseChecked(item.checkedItems ?? ''));
    setPanel(String(item.panelCount ?? 0));
    setDent(String(item.dentCount ?? 0));
    setLarge(String(item.dentLargeCount ?? 0));
  }, [item.checkedItems, item.panelCount, item.dentCount, item.dentLargeCount, busy]);

  const save = async (patch: Partial<PurchaseIntake>) => {
    setBusy(true);
    setError(null);
    const failed = await onPatch(patch);
    setBusy(false);
    if (failed) setError(failed);
  };

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
    void save({ checkedItems: serializeChecked(next) });
  };

  const counts = {
    panelCount: Number(digitsOnly(panel)) || 0,
    dentCount: Number(digitsOnly(dent)) || 0,
    dentLargeCount: Number(digitsOnly(large)) || 0,
    vendor: item.prepVendor ?? '',
    imported: item.imported ?? false,
    bulk: false,
  };
  const cost = estimateCost(counts);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] font-bold text-slate-500">
          검차 {checked.size}/{CHECK_ITEMS.length}
        </span>
        {CHECK_ITEMS.map(c => {
          const on = checked.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              disabled={busy}
              title={c.hint}
              className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
                on
                  ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
              }`}
            >
              {on ? '✓ ' : ''}
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* 센 개수가 그대로 상품화 비용이 된다 — 차 앞에서 세는 값이라 여기 둔다 */}
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          판
          <input
            value={panel}
            onChange={e => setPanel(digitsOnly(e.target.value).slice(0, 3))}
            onBlur={() => Number(panel || 0) !== (item.panelCount ?? 0) && void save({ panelCount: Number(panel) || 0 })}
            disabled={busy}
            inputMode="numeric"
            className={INPUT}
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          덴트
          <input
            value={dent}
            onChange={e => setDent(digitsOnly(e.target.value).slice(0, 3))}
            onBlur={() => Number(dent || 0) !== (item.dentCount ?? 0) && void save({ dentCount: Number(dent) || 0 })}
            disabled={busy}
            inputMode="numeric"
            className={INPUT}
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          큰 덴트
          <input
            value={large}
            onChange={e => setLarge(digitsOnly(e.target.value).slice(0, 3))}
            onBlur={() =>
              Number(large || 0) !== (item.dentLargeCount ?? 0) && void save({ dentLargeCount: Number(large) || 0 })
            }
            disabled={busy}
            inputMode="numeric"
            className={INPUT}
          />
        </label>

        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          판금집
          <select
            value={item.prepVendor ?? ''}
            onChange={e => void save({ prepVendor: e.target.value })}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400 disabled:opacity-50"
          >
            <option value="">-</option>
            {PREP_VENDORS.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <input
            type="checkbox"
            checked={item.imported ?? false}
            onChange={e => void save({ imported: e.target.checked })}
            disabled={busy}
            className="size-3.5 accent-indigo-600"
          />
          수입차
        </label>

        {cost.total > 0 && (
          <span className="ml-auto text-[11px] text-slate-500">
            예상 상품화 <b className="text-xs text-indigo-700">{cost.total.toLocaleString()}</b>원
            <span className="ml-1 text-slate-400">
              (판 {counts.panelCount}곳 × {panelUnit(counts).toLocaleString() || '–'} · 덴트{' '}
              {DENT_PRICE.small.toLocaleString()}/{DENT_PRICE.large.toLocaleString()})
            </span>
          </span>
        )}
      </div>

      {error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
    </div>
  );
}
