import { useEffect, useState } from 'react';
import {
  CHECK_ITEMS,
  DENT_PRICE,
  FUEL_LEVELS,
  WHEEL_PRICE,
  estimateCost,
  panelUnit,
  parseChecked,
  PREP_VENDORS,
  serializeChecked,
} from '../../lib/inspectionCheck';
import { digitsOnly } from '../../lib/money';
import { useAuth } from '../../authStore';
import InspectionOrderModal from './InspectionOrderModal';
import type { PurchaseIntake } from '../../types';

/**
 * 매물 줄에서 바로 하는 실차 검차.
 *
 * 창을 열고 들어가서 체크하게 두면 현장에서 안 쓴다 — 차 앞에 서서 휴대폰으로 누르는
 * 일이라, 목록에 뜬 그 줄에서 바로 눌러야 한다.
 *
 * 직접 가기 어려운 차는 여기서 **카비어 평가사에게 맡긴다**. 차를 보러 갈지 말지를
 * 정하는 자리가 바로 이 줄이라, 맡기는 단추도 같은 자리에 둔다 — 다른 메뉴로 보내면
 * 결국 전화로 부르게 된다. 진단비가 나가는 일이라 관리자에게만 보인다.
 *
 * 누르면 화면이 먼저 바뀌고 저장은 뒤따라간다. 서버를 기다렸다 바꾸면 누를 때마다 한 박자
 * 멈추는데, 열 개를 연달아 누르는 자리라 그 멈춤이 그대로 쌓인다. 실패하면 되돌리고 알린다.
 *
 * 폰에서는 접어 둔다. 칩 열 개에 숫자 칸 넷이 좁은 화면을 다 덮어서, 목록을 훑을 때는
 * 차 한 대가 한 화면을 차지해 버린다 — 검차할 때만 펴서 쓴다. 넓은 화면에서는 늘 펴 둔다.
 */

const INPUT =
  'w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400';

interface Props {
  item: PurchaseIntake;
  /** 성공하면 null, 실패하면 화면에 띄울 말 */
  onPatch: (patch: Partial<PurchaseIntake>) => Promise<string | null>;
  /** 검차를 맡긴 뒤 목록을 다시 받는다 — 리포트 링크가 나중에 거기로 들어온다 */
  onReload?: () => void;
}

export default function IntakeCheckBar({ item, onPatch, onReload }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [orderOpen, setOrderOpen] = useState(false);
  /*
    화면에 보이는 값은 여기 들고 있는다.

    서버가 돌려준 값을 그대로 쓰면 누를 때마다 왕복을 기다리게 된다. 누른 즉시 여기를
    바꾸고, 저장이 실패했을 때만 서버 값으로 되돌린다.
  */
  const [draft, setDraft] = useState(() => pick(item));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // 다른 사람이 고친 게 들어오면 따라간다
  useEffect(() => setDraft(pick(item)), [item]);

  const save = async (patch: Partial<PurchaseIntake>) => {
    const before = draft;
    setDraft(prev => ({ ...prev, ...patch }));
    setError(null);
    const failed = await onPatch(patch);
    if (failed) {
      setDraft(before);
      setError(failed);
    }
  };

  const checked = parseChecked(draft.checkedItems);

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void save({ checkedItems: serializeChecked(next) });
  };

  const counts = {
    panelCount: draft.panelCount,
    dentCount: draft.dentCount,
    dentLargeCount: draft.dentLargeCount,
    wheelCount: draft.wheelCount,
    vendor: draft.prepVendor,
    imported: draft.imported,
  };
  const cost = estimateCost(counts);

  /** 숫자 칸 — 고치는 동안은 화면만 바꾸고, 칸을 벗어날 때 저장한다 */
  const numberField = (label: string, key: 'panelCount' | 'dentCount' | 'dentLargeCount' | 'wheelCount') => (
    <label className="flex items-center gap-1 text-[11px] text-slate-500">
      {label}
      <input
        value={draft[key] || ''}
        onChange={e => {
          const next = Number(digitsOnly(e.target.value).slice(0, 3)) || 0;
          setDraft(prev => ({ ...prev, [key]: next }));
        }}
        onBlur={() => draft[key] !== (item[key] ?? 0) && void save({ [key]: draft[key] })}
        inputMode="numeric"
        placeholder="0"
        className={INPUT}
      />
    </label>
  );

  /** 접었을 때 보여줄 한 줄 — 무엇을 셌는지까지는 보여야 펼지 말지 정한다 */
  const summary = [
    `검차 ${checked.size}/${CHECK_ITEMS.length}`,
    draft.panelCount > 0 ? `판 ${draft.panelCount}` : '',
    draft.dentCount > 0 ? `덴트 ${draft.dentCount}` : '',
    draft.wheelCount > 0 ? `휠 ${draft.wheelCount}` : '',
    draft.fuelLevel ? `기름 ${draft.fuelLevel}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      {/* 폰에서는 한 줄로 접는다 — 넓은 화면에서는 이 줄이 아예 안 보인다 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-bold text-slate-500 sm:hidden"
      >
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
        {summary}
        {cost.total > 0 && <span className="ml-auto text-indigo-700">{cost.total.toLocaleString()}원</span>}
      </button>

      <div className={`${open ? 'block' : 'hidden'} sm:block`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 hidden text-[11px] font-bold text-slate-500 sm:inline">
          검차 {checked.size}/{CHECK_ITEMS.length}
        </span>
        {CHECK_ITEMS.map(c => {
          const on = checked.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              title={c.hint}
              className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
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

        {/* 기름은 있다/없다가 아니라 얼마나 있는지를 본다 — 넣고 와야 하는지가 거기서 갈린다 */}
        <span className="ml-1 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5">
          <span className="text-[11px] text-slate-400">기름</span>
          {FUEL_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => void save({ fuelLevel: draft.fuelLevel === level ? '' : level })}
              className={`rounded px-1 text-[11px] transition-colors ${
                draft.fuelLevel === level
                  ? level === '없음'
                    ? 'bg-red-100 font-bold text-red-700'
                    : 'bg-emerald-100 font-bold text-emerald-800'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {level}
            </button>
          ))}
        </span>

        {/*
          직접 안 가고 맡기는 길.

          이미 리포트가 있으면 단추 대신 리포트를 띄운다 — 맡겨 놓고 또 맡기는 일이
          제일 흔한 실수다. 리포트가 들어오는 자리는 매물 줄 위쪽의 "검차 리포트"
          칩이지만, 여기서도 보여야 이 줄만 보고 판단할 수 있다.
        */}
        {isAdmin &&
          (item.reportUrl ? (
            <a
              href={item.reportUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              리포트 보기
            </a>
          ) : (
            <button
              onClick={() => setOrderOpen(true)}
              title="카비어 평가사가 대신 가서 진단 리포트를 올려 줍니다 (진단비 발생)"
              className="ml-auto rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              평가사에게 맡기기
            </button>
          ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* 센 개수가 그대로 상품화 비용이 된다 — 차 앞에서 세는 값이라 여기 둔다 */}
        {numberField('판', 'panelCount')}
        {numberField('덴트', 'dentCount')}
        {numberField('큰 덴트', 'dentLargeCount')}
        {numberField('휠', 'wheelCount')}

        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          판금집
          <select
            value={draft.prepVendor}
            onChange={e => void save({ prepVendor: e.target.value })}
            className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400"
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
            checked={draft.imported}
            onChange={e => void save({ imported: e.target.checked })}
            className="size-3.5 accent-indigo-600"
          />
          수입차
        </label>

        {cost.total > 0 && (
          <span className="ml-auto text-[11px] text-slate-500">
            예상 상품화 <b className="text-xs text-indigo-700">{cost.total.toLocaleString()}</b>원
            <span className="ml-1 text-slate-400">
              (판 {counts.panelCount}곳 × {panelUnit(counts).toLocaleString() || '–'} · 덴트{' '}
              {DENT_PRICE.small.toLocaleString()}/{DENT_PRICE.large.toLocaleString()} · 휠{' '}
              {WHEEL_PRICE.mid.toLocaleString()})
            </span>
          </span>
        )}
      </div>

      {error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
      </div>

      {orderOpen && (
        <InspectionOrderModal
          item={item}
          onClose={() => setOrderOpen(false)}
          onOrdered={() => onReload?.()}
        />
      )}
    </div>
  );
}

/** 서버가 준 값 중 이 칸에서 다루는 것만 — 없으면 빈 값으로 */
function pick(item: PurchaseIntake) {
  return {
    checkedItems: item.checkedItems ?? '',
    panelCount: item.panelCount ?? 0,
    dentCount: item.dentCount ?? 0,
    dentLargeCount: item.dentLargeCount ?? 0,
    wheelCount: item.wheelCount ?? 0,
    fuelLevel: item.fuelLevel ?? '',
    prepVendor: item.prepVendor ?? '',
    imported: item.imported ?? false,
  };
}
