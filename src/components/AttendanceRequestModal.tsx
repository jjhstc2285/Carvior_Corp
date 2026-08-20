import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { ATTENDANCE_REQUEST_KIND_LABEL, type AttendanceRequestKind } from '../types';

interface Props {
  employeeId: string;
  onClose: () => void;
}

export default function AttendanceRequestModal({ employeeId, onClose }: Props) {
  const { submitAttendanceRequest } = useStore();
  const [kind, setKind] = useState<AttendanceRequestKind>('annualLeave');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [reason, setReason] = useState('');

  const canSubmit = reason.trim().length >= 3;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitAttendanceRequest({ employeeId, date, kind, reason: reason.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">근태 신청</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">연차(휴가) 또는 외근·출장으로 정상 출퇴근이 어려운 날을 미리 신청하세요.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.entries(ATTENDANCE_REQUEST_KIND_LABEL) as [AttendanceRequestKind, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${kind === k ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-slate-500">날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-slate-500">사유</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="사유를 입력해주세요 (3자 이상)"
            className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            신청하기
          </button>
        </div>
      </div>
    </div>
  );
}
