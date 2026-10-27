import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { useEscClose } from '../../lib/useEscClose';
import { PARKING_SLOTS, slotsOf, type ParkingLotConfig } from '../../lib/parkingLayout';

/**
 * 주차장 구조 고치기 — 줄을 늘리고, 구역을 더하고, 이름을 바꾼다.
 *
 * 코드에 박혀 있던 값이다. 줄 하나를 늘리려면 개발자가 고쳐 올려야 했는데, 실제로 줄을
 * 긋고 차를 대는 건 차량관리팀이다 — 그 팀이 여기서 고친다.
 *
 * 번지는 안 바꾼다. 세워 둔 차와 지난 세차 기록이 전부 그 값으로 묶여 있어서, 바꾸면
 * 그 기록이 엉뚱한 주차장을 가리킨다 — 부르는 이름만 따로 바꾼다.
 *
 * 구역 이름은 손으로 적는다. 본관은 '9구역'·'가로주차'·'계단실'처럼 제각각이라 번호로
 * 자동으로 붙일 수가 없다. 대신 줄줄이 번호인 외부 주차장을 위해 '다음 번호로 추가'를
 * 같이 둔다 — 열한 번을 치게 하지 않는다.
 */

const INPUT = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

/** '3번' 다음은 '4번' — 끝 숫자만 올린다. 숫자가 없으면 못 센다 */
function nextName(names: string[], fallback: string): string {
  const last = names[names.length - 1] ?? '';
  const m = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${names.length + 1}${fallback}`;
  return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
}

export default function ParkingLayoutEditor({
  lot,
  onClose,
  onSaved,
}: {
  /** 고칠 주차장. 없으면 새로 만든다 */
  lot: ParkingLotConfig | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  useEscClose(onClose);

  const isNew = !lot;
  const [plot, setPlot] = useState(lot?.lot ?? '');
  const [label, setLabel] = useState(lot?.label ?? '');
  const [area, setArea] = useState<'본관' | '외부'>(lot?.group ?? '외부');
  const [bandColor, setBandColor] = useState(lot?.bandColor ?? '#e2e8f0');
  const [zones, setZones] = useState<string[]>(lot?.zones ?? ['1번']);
  const [slots, setSlots] = useState<string[]>(lot ? [...slotsOf(lot)] : [...PARKING_SLOTS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!plot.trim()) {
      setError('주차장 번지를 적어 주세요.');
      return;
    }
    if (zones.filter(z => z.trim()).length === 0) {
      setError('구역을 하나 이상 두어야 합니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/parking-layout', {
        method: 'POST',
        body: {
          lot: plot.trim(),
          label: label.trim(),
          area,
          bandColor,
          zones: zones.map(z => z.trim()).filter(Boolean),
          slots: slots.map(s => s.trim()).filter(Boolean),
        },
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  /** 구역·줄을 적는 자리 — 둘이 하는 일이 같아서 한 틀로 그린다 */
  const nameList = (
    title: string,
    hint: string,
    names: string[],
    set: (next: string[]) => void,
    fallback: string,
  ) => (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <label className="text-xs font-bold text-slate-600">
          {title} <span className="font-normal text-slate-400">{names.length}칸</span>
        </label>
        <span className="text-[11px] text-slate-400">{hint}</span>
        <button
          type="button"
          onClick={() => set([...names, nextName(names, fallback)])}
          className="ml-auto flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          <Plus size={11} /> 다음 번호로 추가
        </button>
      </div>
      <div className="space-y-1">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-right text-[11px] text-slate-300">{i + 1}</span>
            <input
              value={n}
              onChange={e => set(names.map((v, j) => (j === i ? e.target.value : v)))}
              className={INPUT}
            />
            {/*
              마지막 한 칸은 못 지운다 — 구역이 하나도 없는 주차장은 그릴 수가 없다.
            */}
            <button
              type="button"
              disabled={names.length <= 1}
              onClick={() => set(names.filter((_, j) => j !== i))}
              className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
              aria-label="이 칸 빼기"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{isNew ? '주차장 추가' : '주차장 고치기'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">번지 *</label>
              <input
                value={plot}
                onChange={e => setPlot(e.target.value)}
                disabled={!isNew}
                placeholder="고색동 205-1"
                className={`${INPUT} ${isNew ? '' : 'bg-slate-50 text-slate-500'}`}
              />
              {/*
                번지는 저장된 값이다 — 세워 둔 차와 세차 기록이 전부 이 값으로 묶여 있다.
                바꾸면 지난 기록이 어느 주차장 것인지 알 수 없게 된다.
              */}
              <p className="mt-1 text-[11px] text-slate-400">
                {isNew ? '세워 둔 차가 이 값으로 묶입니다 — 나중에 못 바꿉니다' : '지난 기록이 묶여 있어 못 바꿉니다'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">부르는 이름</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="고색동 205-1/B주차장"
                className={INPUT}
              />
              <p className="mt-1 text-[11px] text-slate-400">화면에 이 이름이 뜹니다. 비우면 번지 그대로</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">묶음</label>
              <select value={area} onChange={e => setArea(e.target.value as '본관' | '외부')} className={INPUT}>
                <option value="본관">본관</option>
                <option value="외부">외부</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">띠 색</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bandColor}
                  onChange={e => setBandColor(e.target.value)}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded border border-slate-200"
                />
                <input value={bandColor} onChange={e => setBandColor(e.target.value)} className={INPUT} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {nameList('구역 (열)', '왼쪽부터 차례로', zones, setZones, '번')}
            {nameList('줄 (행)', '위에서부터 차례로', slots, setSlots, '행')}
          </div>

          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500">
            칸은 <b>구역 × 줄</b> 만큼 생깁니다 — 지금 {zones.length} × {slots.length} ={' '}
            <b>{zones.length * slots.length}대</b>.
            {/* 칸을 줄이면 그 자리에 세워 둔 차가 배치도에서 사라진다 — 줄이기 전에 알려 준다 */}
            {!isNew && ' 칸을 줄이면 거기 세워 둔 차가 배치도에서 안 보입니다 — 먼저 옮겨 주세요.'}
          </p>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 주차장을 목록에서 내린다 — 줄은 남긴다(지난 기록이 그 번지로 묶여 있다) */
export async function dropLot(lot: ParkingLotConfig, onDone: () => Promise<void>): Promise<void> {
  const ok = await confirmDanger(
    `${lot.label || lot.lot} 를 목록에서 내릴까요?`,
    '배치도와 등록 창에서 안 보이게 됩니다. 세워 둔 차가 있으면 내려가지 않습니다 — 지난 주차·세차 기록은 그대로 남습니다.',
    '내리기',
  );
  if (!ok) return;
  try {
    await api(`/parking-layout/${encodeURIComponent(lot.lot)}`, { method: 'DELETE' });
    await onDone();
  } catch (e) {
    void alertError('내리지 못했습니다', e instanceof ApiError ? e.message : '');
  }
}

/** 고칠 수 있는 사람에게만 뜨는 단추 — 배치도 머리에 붙인다 */
export function LayoutEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="주차장 구조를 고칩니다 — 줄·구역·이름"
      className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-indigo-600"
    >
      <Pencil size={13} />
    </button>
  );
}

/**
 * 주차장을 내리는 단추 — 고치는 단추 옆에 붙인다.
 *
 * 누르면 한 번 더 묻는다. 주차장 하나가 사라지면 그 안의 자리가 통째로 없어지는데,
 * 잘못 눌러 놓고 무엇이 사라졌는지 모르면 되돌릴 수도 없다.
 *
 * 세워 둔 차가 있으면 서버가 막는다 — 차를 먼저 옮기라고 알려 준다.
 */
export function LayoutDropButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="이 주차장을 목록에서 내립니다 — 지난 기록은 남습니다"
      className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
    >
      <Trash2 size={13} />
    </button>
  );
}
