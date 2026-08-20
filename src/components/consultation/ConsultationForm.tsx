import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import type { ConsultationRecord, ConsultationStatus } from '../../types';

interface Props {
  editing: ConsultationRecord | null;
  defaultEmployeeId: string;
  onClose: () => void;
}

export default function ConsultationForm({ editing, defaultEmployeeId, onClose }: Props) {
  const { state, upsertConsultation } = useStore();
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [customerName, setCustomerName] = useState(editing?.customerName ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [status, setStatus] = useState<ConsultationStatus>(editing?.status ?? 'inProgress');
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [time, setTime] = useState(editing?.time ?? dayjs().format('HH:mm'));
  const [content, setContent] = useState(editing?.content ?? '');
  const [nextContactDate, setNextContactDate] = useState(editing?.nextContactDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!vehicleNumber.trim() || !customerName.trim() || !content.trim()) {
      setError('차량번호, 고객명, 상담내용은 필수 입력입니다.');
      return;
    }
    upsertConsultation({
      id: editing?.id,
      vehicleNumber: vehicleNumber.trim(),
      customerName: customerName.trim(),
      employeeId,
      status,
      date,
      time,
      content: content.trim(),
      nextContactDate: nextContactDate || null,
      fileNames: editing?.fileNames ?? [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '상담 내역 수정' : '상담 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량번호 *</label>
            <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="12가3456"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">고객명 *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">담당자</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담 상태</label>
            <select value={status} onChange={e => setStatus(e.target.value as ConsultationStatus)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="inProgress">진행중</option>
              <option value="contracted">계약</option>
              <option value="onHold">보류</option>
              <option value="closed">종결</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담일</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담시각</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">다음 연락 예정일</label>
            <input type="date" value={nextContactDate ?? ''} onChange={e => setNextContactDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담내용 *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
