import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Image } from 'antd';
import { Camera, ImagePlus, Loader2, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { alertError } from '../../lib/alert';
import { confirmDanger } from '../../lib/alert';

/**
 * 상품화 차량 사진.
 *
 * 상품화가 끝나면 여섯 방향을 찍어 둔다. 지금은 각자 휴대폰에 남아서, 손님이 사진을
 * 달라고 하면 찍은 사람을 찾아 다녀야 하고 그 사람이 쉬는 날이면 못 준다.
 *
 * 나중에 흠집을 두고 다툴 때도 이 여섯 장이 기준이 된다 — 그래서 언제 찍은 것인지가
 * 사진만큼 중요하다. 차와 날을 먼저 정하고 그 아래에 사진을 붙이는 차례로 둔다.
 *
 * 차는 주차장에 있는 것 중에서 고른다. 번호를 옮겨 치면 한 글자 틀린 묶음이 생기고,
 * 그건 나중에 아무도 못 찾는다.
 */

/** 여섯 방향 — 이 차례로 찍고 이 차례로 본다 */
const SLOTS = [
  { key: 'FRONT', label: '전면' },
  { key: 'REAR', label: '후면' },
  { key: 'LEFT', label: '좌측' },
  { key: 'RIGHT', label: '우측' },
  { key: 'DASH', label: '계기판' },
  { key: 'INTERIOR', label: '실내' },
] as const;

type SlotKey = (typeof SLOTS)[number]['key'];

interface PhotoSet {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  shotOn: string;
  memo: string;
  recordedBy: string;
  photos: Partial<Record<SlotKey, string>>;
}

export default function PhotoTab() {
  const { state } = useStore();
  const [sets, setSets] = useState<PhotoSet[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 새로 찍은 묶음을 만들 때 쓰는 값 */
  const [pickOpen, setPickOpen] = useState(false);
  /* 고른 차 — 번호만 들고 있으면 차명·주차장을 다시 찾아야 한다 */
  const [picked, setPicked] = useState<{ vehicleNumber: string; vehicleModel: string; lot: string } | null>(null);
  const [newDate, setNewDate] = useState(() => dayjs().format('YYYY-MM-DD'));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSets(await api<PhotoSet[]>('/vehicle-photos'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 주차장에 서 있는 차 — 여기서 골라야 번호가 틀리지 않는다 */
  const parked = useMemo(
    () =>
      state.parkingVehicles
        .filter(v => !v.soldDate)
        .sort((a, b) => a.lot.localeCompare(b.lot) || a.vehicleNumber.localeCompare(b.vehicleNumber)),
    [state.parkingVehicles],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return sets;
    return sets.filter(s => s.vehicleNumber.includes(q) || s.vehicleName.includes(q));
  }, [sets, query]);

  const createSet = async () => {
    if (!picked) {
      void alertError('차를 골라 주세요', '주차장에 있는 차 중에서 고릅니다.');
      return;
    }
    try {
      await api('/vehicle-photos/sets', {
        method: 'POST',
        body: { vehicleNumber: picked.vehicleNumber, vehicleName: picked.vehicleModel, shotOn: newDate },
      });
      setPickOpen(false);
      setPicked(null);
      await load();
    } catch (e) {
      void alertError('묶음을 만들지 못했습니다', e instanceof Error ? e.message : '');
    }
  };

  const removeSet = async (set: PhotoSet) => {
    const ok = await confirmDanger(
      `${set.vehicleNumber} ${dayjs(set.shotOn).format('M/D')} 사진을 지울까요?`,
      '올린 사진이 함께 지워집니다.',
    );
    if (!ok) return;
    try {
      await api(`/vehicle-photos/sets/${set.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof Error ? e.message : '');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPickOpen(v => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Camera size={14} /> 사진 등록
        </button>

        <span className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="차량번호 · 차량명"
            className="w-48 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2.5 text-sm outline-none focus:border-indigo-400"
          />
        </span>

        <span className="ml-auto text-xs text-slate-400">{filtered.length}대</span>
      </div>

      {/* 차와 날을 먼저 정한다 — 사진은 그 아래에 붙는다 */}
      {pickOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2.5">
          <VehiclePicker parked={parked} picked={picked} onPick={setPicked} />
          <label className="text-xs text-slate-500">
            찍은 날
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button
            onClick={() => void createSet()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            만들기
          </button>
          <button
            onClick={() => setPickOpen(false)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {loading && <p className="text-xs text-slate-400">불러오는 중…</p>}
      {!loading && filtered.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          {query ? '찾는 차가 없습니다.' : '아직 올린 사진이 없습니다. [사진 등록]으로 시작하세요.'}
        </p>
      )}

      {filtered.map(set => (
        <SetCard key={set.id} set={set} onChanged={load} onRemove={() => void removeSet(set)} />
      ))}
    </div>
  );
}

/** 한 차·한 날의 여섯 칸 */
function SetCard({ set, onChanged, onRemove }: { set: PhotoSet; onChanged: () => Promise<void>; onRemove: () => void }) {
  const filled = SLOTS.filter(s => set.photos[s.key]).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-slate-800">{set.vehicleNumber}</span>
        <span className="text-sm text-slate-600">{set.vehicleName}</span>
        <span className="text-xs text-slate-400">{dayjs(set.shotOn).format('YYYY-MM-DD (ddd)')}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            filled === SLOTS.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {filled}/{SLOTS.length}
        </span>
        {set.recordedBy && <span className="text-[11px] text-slate-400">{set.recordedBy}</span>}

        <button
          onClick={onRemove}
          title="이 묶음을 지웁니다"
          className="ml-auto rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SLOTS.map(slot => (
          <PhotoSlot key={slot.key} set={set} slot={slot.key} label={slot.label} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

/**
 * 한 방향 한 칸.
 *
 * 올리면 그 자리에서 바로 보인다. 눌러서 크게 볼 수 있어야 한다 — 흠집을 두고 다툴 때
 * 보는 사진이라 작은 그림으로는 쓸모가 없다.
 */
function PhotoSlot({
  set,
  slot,
  label,
  onChanged,
}: {
  set: PhotoSet;
  slot: SlotKey;
  label: string;
  onChanged: () => Promise<void>;
}) {
  const url = set.photos[slot];
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { url: uploaded } = await api<{ url: string }>('/vehicle-photos/upload', {
        method: 'POST',
        formData: form,
      });
      await api('/vehicle-photos/photos', {
        method: 'POST',
        body: {
          vehicleNumber: set.vehicleNumber,
          vehicleName: set.vehicleName,
          shotOn: set.shotOn,
          slot,
          url: uploaded,
        },
      });
      await onChanged();
    } catch (e) {
      void alertError('사진을 올리지 못했습니다', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
      // 같은 파일을 다시 고를 수 있게 비운다
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/vehicle-photos/sets/${set.id}/photos/${slot}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      void alertError('사진을 지우지 못했습니다', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-500">{label}</p>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {url ? (
          <>
            <Image
              src={url}
              alt={label}
              width="100%"
              height="100%"
              style={{ objectFit: 'cover' }}
              // 미리보기에서 원본 크기로 본다 — 흠집은 작은 그림으로 안 보인다
              preview={{ src: url }}
            />
            <button
              onClick={() => void remove()}
              disabled={busy}
              title="이 사진을 지웁니다"
              className="absolute right-1 top-1 rounded-full bg-slate-900/50 p-1 text-white hover:bg-red-500"
            >
              <X size={11} />
            </button>
          </>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300 hover:bg-slate-100 hover:text-slate-400"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[11px]">{busy ? '올리는 중' : '사진 올리기'}</span>
          </button>
        )}
      </div>
      {/*
        휴대폰에서는 카메라가 바로 열린다 — 차 앞에 서서 찍는 일이라
        갤러리를 거치게 하면 한 단계가 늘어난다.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => void upload(e.target.files)}
        className="hidden"
      />
    </div>
  );
}

/**
 * 찍을 차 고르기 — 쳐서 찾는다.
 *
 * 처음에는 목록 상자였는데, 주차장에 선 차가 백 대가 넘으면 그 안에서 눈으로 찾는 게
 * 번호를 옮겨 치는 것보다 오래 걸린다. 그렇다고 번호를 직접 치게 두면 한 글자 틀린
 * 묶음이 생기고 그건 나중에 아무도 못 찾는다.
 *
 * 그래서 치되 고르게 한다. 번호 뒤 네 자리든 차명이든 쳐서 좁히고, 뜬 것 중에 누른다.
 * 실제로 부르는 이름이 사람마다 달라서(번호로 부르는 사람, 차명으로 부르는 사람) 둘 다
 * 받는다.
 */
function VehiclePicker({
  parked,
  picked,
  onPick,
}: {
  parked: { id: string; vehicleNumber: string; vehicleModel: string; lot: string }[];
  picked: { vehicleNumber: string; vehicleModel: string; lot: string } | null;
  onPick: (v: { vehicleNumber: string; vehicleModel: string; lot: string } | null) => void;
}) {
  const [q, setQ] = useState('');

  const hits = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    return parked
      .filter(
        v =>
          v.vehicleNumber.toLowerCase().includes(key) ||
          v.vehicleModel.toLowerCase().includes(key) ||
          v.lot.toLowerCase().includes(key),
      )
      // 한 화면에 담기는 만큼만. 더 뜨면 더 치라는 뜻이다
      .slice(0, 8);
  }, [parked, q]);

  /* 이미 골랐으면 고른 것만 보여준다 — 목록이 계속 떠 있으면 무엇을 골랐는지 흐려진다 */
  if (picked) {
    return (
      <div className="text-xs text-slate-500">
        차량
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5">
          <span className="font-mono text-sm font-bold text-slate-800">{picked.vehicleNumber}</span>
          <span className="text-sm text-slate-600">{picked.vehicleModel}</span>
          <span className="text-[11px] text-slate-400">{picked.lot}</span>
          <button
            onClick={() => {
              onPick(null);
              setQ('');
            }}
            title="다시 고릅니다"
            className="ml-1 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative text-xs text-slate-500">
      차량 <span className="text-slate-400">(번호 뒤 4자리 또는 차명)</span>
      <span className="relative mt-1 block">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
          placeholder="2530 · 카니발 · 배양동"
          className="w-72 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2.5 text-sm outline-none focus:border-indigo-400"
        />
      </span>

      {q.trim() && (
        <ul className="absolute z-10 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">
              주차장에 그런 차가 없습니다. 주차장 관리에 먼저 등록해 주세요.
            </li>
          )}
          {hits.map(v => (
            <li key={v.id}>
              <button
                onClick={() => onPick({ vehicleNumber: v.vehicleNumber, vehicleModel: v.vehicleModel, lot: v.lot })}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-indigo-50"
              >
                <span className="font-mono text-sm font-semibold text-slate-700">{v.vehicleNumber}</span>
                <span className="text-sm text-slate-600">{v.vehicleModel}</span>
                <span className="ml-auto text-[11px] text-slate-400">{v.lot}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
