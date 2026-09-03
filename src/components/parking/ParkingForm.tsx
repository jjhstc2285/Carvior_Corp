import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, X } from 'lucide-react';
import { useStore } from '../../store';
import { ApiError, uploadParkingPhoto } from '../../lib/api';
import type { ParkingStatus, ParkingVehicle } from '../../types';
import { PARKING_LOTS, PARKING_SLOTS } from '../../lib/parkingLayout';
import { confirmDanger } from '../../lib/alert';
import { shrinkForUpload } from '../../lib/image';

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
  const [photoUrl, setPhotoUrl] = useState(editing?.photoUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const zoneOptions = PARKING_LOTS.find(l => l.lot === lot)?.zones ?? [];

  /**
   * 주차된 모습을 한 장 올린다.
   *
   * 휴대폰으로 그 자리에서 찍어 올리는 흐름이라, 원본 그대로 보내면 몇 MB씩 된다.
   * 화면에서 줄여 보내고 서버에는 파일로 남긴다(사진은 DB에 넣지 않는다).
   */
  const handlePhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    // 끌어놓기·붙여넣기로는 아무 파일이나 들어올 수 있다.
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 올릴 수 있습니다.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const url = await uploadParkingPhoto(await shrinkForUpload(file));
      setPhotoUrl(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '사진을 올리지 못했습니다.');
    } finally {
      setUploading(false);
      // 같은 파일을 다시 골라도 onChange 가 오게 비워둔다.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
        photoUrl,
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

          {/* 어느 칸에 어떻게 세웠는지 글로 적기 어려운 걸 사진이 대신한다 */}
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">주차 사진 (전면 1장)</label>
            {photoUrl ? (
              <div className="relative w-fit">
                <img src={photoUrl} alt="주차된 모습" className="h-32 rounded-lg border border-slate-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl('')}
                  className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-slate-400 shadow ring-1 ring-slate-200 hover:text-red-500"
                  aria-label="사진 지우기"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              /*
               * PC에서는 끌어놓기·붙여넣기, 휴대폰에서는 눌러서 카메라·앨범.
               * 휴대폰은 파일을 끌어놓을 수 없어서 누르는 길을 없애면 아예 못 올린다 —
               * 끌어놓기는 더해지는 것이지 대신하는 게 아니다.
               */
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  void handlePhoto(e.dataTransfer.files);
                }}
                onPaste={e => void handlePhoto(e.clipboardData.files)}
                disabled={uploading}
                className={`flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm font-medium transition-colors disabled:opacity-50 ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  {uploading ? '올리는 중…' : dragOver ? '여기에 놓으세요' : '사진 찍기 · 고르기'}
                </span>
                {!uploading && !dragOver && (
                  <span className="text-[11px] font-normal text-slate-300">끌어놓거나 붙여넣어도 됩니다</span>
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              // capture 를 주면 휴대폰이 카메라만 열어서 이미 찍어둔 사진을 못 쓴다.
              // 안 주면 카메라와 앨범 중 고르게 물어본다.
              onChange={e => void handlePhoto(e.target.files)}
              className="hidden"
            />
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
