import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useStore } from '../../store';
import { VEHICLE_POST_PHOTO_MAX, VEHICLE_POST_SITES, type VehiclePost } from '../../types';
import { fileToCompressedDataUrl } from '../../lib/image';

interface Props {
  editing: VehiclePost | null;
  defaultEmployeeId: string;
  onClose: () => void;
}

export default function VehiclePostForm({ editing, defaultEmployeeId, onClose }: Props) {
  const { state, upsertVehiclePost } = useStore();
  const [site, setSite] = useState(editing?.site ?? VEHICLE_POST_SITES[0]);
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [vehicleModel, setVehicleModel] = useState(editing?.vehicleModel ?? '');
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? '');
  const [content, setContent] = useState(editing?.content ?? '');
  const [photos, setPhotos] = useState<string[]>(editing?.photos ?? []);
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = VEHICLE_POST_PHOTO_MAX - photos.length;
    if (room <= 0) {
      setError(`사진은 최대 ${VEHICLE_POST_PHOTO_MAX}장까지 올릴 수 있습니다.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const picked = Array.from(files).slice(0, room);
      const added = await Promise.all(picked.map(fileToCompressedDataUrl));
      setPhotos(prev => [...prev, ...added].slice(0, VEHICLE_POST_PHOTO_MAX));
      if (files.length > room) setError(`사진은 최대 ${VEHICLE_POST_PHOTO_MAX}장까지라 앞의 ${room}장만 추가했습니다.`);
    } catch {
      setError('사진을 불러오지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!vehicleNumber.trim() || !vehicleModel.trim() || !customerPhone.trim() || !content.trim()) {
      setError('사이트, 차량번호, 차명, 손님번호, 내용은 필수 입력입니다.');
      return;
    }
    if (photos.length === 0) {
      setError('사진을 최소 1장 이상 올려주세요. (권장 4~5장)');
      return;
    }
    upsertVehiclePost({
      id: editing?.id,
      site,
      vehicleNumber: vehicleNumber.trim(),
      vehicleModel: vehicleModel.trim(),
      customerPhone: customerPhone.trim(),
      content: content.trim(),
      photos,
      employeeId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-900/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '매물 글 수정' : '매물 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">사이트 *</label>
            <select value={site} onChange={e => setSite(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {VEHICLE_POST_SITES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량번호 *</label>
            <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="12가3456"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차명 *</label>
            <input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} placeholder="그랜저 GN7"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">손님번호 *</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="010-1234-5678"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">등록자</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">내용 *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="차량 상태, 특이사항 등"
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>

          <div className="col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">사진 (권장 4~5장)</label>
              <span className="text-[11px] text-slate-400">{photos.length}/{VEHICLE_POST_PHOTO_MAX}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((src, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={src} alt={`사진 ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="사진 삭제"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < VEHICLE_POST_PHOTO_MAX && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                  <span className="text-[11px]">사진 추가</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => void handleFiles(e.target.files)}
            />
            <p className="mt-1.5 text-[11px] text-slate-400">올린 사진은 자동으로 용량을 줄여 저장되고, 전 직원이 볼 수 있습니다.</p>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} disabled={uploading}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">저장</button>
        </div>
      </div>
    </div>
  );
}
