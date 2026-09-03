import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useStore } from '../../store';
import { ApiError } from '../../lib/api';
import type { ParkingStatus, ParkingVehicle } from '../../types';
import { PARKING_LOTS, PARKING_SLOTS } from '../../lib/parkingLayout';
import { confirmDanger } from '../../lib/alert';

interface Props {
  editing: ParkingVehicle | null;
  defaultEmployeeId: string;
  // 그리드 셀을 클릭해서 연 경우 — 위치(주차장/구역/위치)가 이미 정해져 있으므로 고정 표시
  presetPosition?: { lot: string; zone: string; slot: string };
  onClose: () => void;
}

export default function ParkingForm({ editing, defaultEmployeeId, presetPosition, onClose }: Props) {
  const { state, upsertParkingVehicle, deleteParkingVehicle } = useStore();
  const positionLocked = !!presetPosition;
  const [lot, setLot] = useState(editing?.lot ?? presetPosition?.lot ?? PARKING_LOTS[0].lot);
  const [zone, setZone] = useState(editing?.zone ?? presetPosition?.zone ?? PARKING_LOTS[0].zones[0]);
  const [slot, setSlot] = useState(editing?.slot ?? presetPosition?.slot ?? PARKING_SLOTS[0]);
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [vehicleModel, setVehicleModel] = useState(editing?.vehicleModel ?? '');
  const [status, setStatus] = useState<ParkingStatus>(editing?.status ?? 'DISPLAY');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const zoneOptions = PARKING_LOTS.find(l => l.lot === lot)?.zones ?? [];


  /**
   * 저장이 끝난 뒤에 닫는다.
   *
   * 예전에는 저장을 기다리지 않고 바로 닫아서, 서버가 거부해도(예: 차량명 누락)
   * 등록된 것처럼 보이고 구역도에는 아무것도 안 뜨는 상태가 됐다.
   */
  const handleSubmit = async () => {
    if (!lot.trim() || !zone.trim() || !vehicleNumber.trim() || !vehicleModel.trim()) {
      setError('주차장, 구역, 차량번호, 차량명은 필수 입력입니다.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertParkingVehicle({
        id: editing?.id,
        lot: lot.trim(),
        zone: zone.trim(),
        slot: slot.trim() || '-',
        vehicleNumber: vehicleNumber.trim(),
        vehicleModel: vehicleModel.trim(),
        status,
        employeeId,
        memo,
      });
      onClose();
    } catch (e) {
      // 중복 차량번호 같은 서버 판단은 여기서만 알 수 있다 — 그대로 보여준다.
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (await confirmDanger('이 위치의 차량 기록을 비울까요?', undefined, '비우기')) {
      deleteParkingVehicle(editing.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '차량 위치 수정' : '차량 위치 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {positionLocked ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="font-semibold">{lot}</span> · {zone} · {slot}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">주차장 *</label>
              <select value={lot} onChange={e => { setLot(e.target.value); setZone(PARKING_LOTS.find(l => l.lot === e.target.value)?.zones[0] ?? ''); }}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                {PARKING_LOTS.map(l => <option key={l.lot} value={l.lot}>{l.lot}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">구역 *</label>
              <select value={zone} onChange={e => setZone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">위치</label>
              <select value={slot} onChange={e => setSlot(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                {PARKING_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량번호 *</label>
            <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="12가3456"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상태</label>
            <select value={status} onChange={e => setStatus(e.target.value as ParkingStatus)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="DISPLAY">전시중</option>
              <option value="RESERVED">예약중</option>
              <option value="SOLD">판매완료</option>
              <option value="MOVING">이동중</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량명 *</label>
            <input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">담당자</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">메모</label>
            <input value={memo} onChange={e => setMemo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          {editing ? (
            <button onClick={() => void handleDelete()} className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 hover:bg-red-50">
              <Trash2 size={13} /> 이 위치 비우기
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
