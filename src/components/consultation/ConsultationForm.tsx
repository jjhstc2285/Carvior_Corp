import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { CONSULTATION_PLATFORMS, CONSULTATION_STATUS_LABEL, type ConsultationRecord, type ConsultationStatus } from '../../types';

interface Props {
  editing: ConsultationRecord | null;
  defaultEmployeeId: string;
  /** 차량관리에서 고른 차로 열 때 — 차량번호·차명을 미리 채운다 */
  preset?: { vehicleNumber: string; vehicleName: string };
  onClose: () => void;
}

export default function ConsultationForm({ editing, defaultEmployeeId, preset, onClose }: Props) {
  const { state, upsertConsultation } = useStore();
  const [platform, setPlatform] = useState(editing?.platform ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? preset?.vehicleNumber ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? preset?.vehicleName ?? '');
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [status, setStatus] = useState<ConsultationStatus>(editing?.status ?? 'IN_PROGRESS');
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [time, setTime] = useState(editing?.time ?? dayjs().format('HH:mm'));
  const [content, setContent] = useState(editing?.content ?? '');
  const [depositAmount, setDepositAmount] = useState(editing ? String(editing.depositAmount || '') : '');
  const [visitDate, setVisitDate] = useState(editing?.visitDate ?? '');
  const [visitTime, setVisitTime] = useState(editing?.visitTime ?? '');
  const [nextContactDate, setNextContactDate] = useState(editing?.nextContactDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!vehicleNumber.trim() || !customerPhone.trim() || !content.trim()) {
      setError('차량번호, 손님번호, 내용은 필수 입력입니다.');
      return;
    }
    upsertConsultation({
      id: editing?.id,
      platform: platform.trim(),
      vehicleNumber: vehicleNumber.trim(),
      vehicleName: vehicleName.trim(),
      customerPhone: customerPhone.trim(),
      // 예전 양식으로 적힌 고객명은 건드리지 않고 그대로 넘긴다.
      customerName: editing?.customerName ?? '',
      employeeId,
      status,
      date,
      time,
      content: content.trim(),
      depositAmount: Number(depositAmount.replace(/[^\d]/g, '')) || 0,
      visitDate: visitDate || null,
      visitTime: visitTime.trim(),
      nextContactDate: nextContactDate || null,
      
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

        {/* 카톡으로 주고받던 양식 순서 그대로 — 플랫폼 / 차량번호 / 차명 / 손님번호 / 내용 */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-slate-500">플랫폼</label>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {CONSULTATION_PLATFORMS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  platform === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="위에서 고르거나 직접 입력"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량번호 *</label>
            <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="42더8955"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차명</label>
            <input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="QM5"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">손님번호 *</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="010-0000-0000"
              inputMode="tel"
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
              {(Object.entries(CONSULTATION_STATUS_LABEL) as [ConsultationStatus, string][]).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
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
          {/* 출고 카톡("입금1000만원")에 들어가는 금액. 판매완료로 바꿀 때만 묻는다. */}
          {status === 'SOLD' && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">입금액 (만원)</label>
              <input
                value={depositAmount ? Number(depositAmount).toLocaleString() : ''}
                onChange={e => setDepositAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="1000"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
              />
            </div>
          )}

          {/* 카톡 양식에 "오후 3시~4시 방문"처럼 적혀 온다. 시각은 적힌 그대로 받는다. */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">방문 예정일</label>
            <input type="date" value={visitDate ?? ''} onChange={e => setVisitDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">방문 시각</label>
            <input value={visitTime} onChange={e => setVisitTime(e.target.value)} placeholder="오후 3시~4시"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">다음 연락 예정일</label>
            <input type="date" value={nextContactDate ?? ''} onChange={e => setNextContactDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">내용 *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
              placeholder="예) 다른 차량도 있으면 보고 싶음 / 예산 300-400 / 오후 3시~4시 방문"
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
