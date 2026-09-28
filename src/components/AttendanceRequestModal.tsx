import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { ApiError } from '../lib/api';
import { ATTENDANCE_REQUEST_KIND_HINT, ATTENDANCE_REQUEST_KIND_LABEL, type AttendanceRequestKind } from '../types';

interface Props {

  onClose: () => void;
}

export default function AttendanceRequestModal({ onClose }: Props) {
  const { submitAttendanceRequest } = useStore();
  const [kind, setKind] = useState<AttendanceRequestKind>('ANNUAL_LEAVE');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [reason, setReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reason.trim().length >= 3 && !saving;

  /*
    보내고 결과를 기다린다 — 보내자마자 닫으면 서버가 거절해도 아무 말이 없다.
    누른 사람은 신청이 간 줄 알고 기다린다.
  */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await submitAttendanceRequest({ date, kind, reason: reason.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '보내지 못했습니다. 잠시 후 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">근태 신청</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          연차·반차·외근은 미리 신청하고, 지각·조퇴는 지난 날짜를 골라 소명하세요.
          자리비움은 그날 바로 올리면 됩니다.
        </p>

        {/* 종류가 다섯이라 세 칸으로는 마지막 줄이 한 칸만 남는다 */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
        <p className="mt-2 text-[11px] text-slate-400">{ATTENDANCE_REQUEST_KIND_HINT[kind]}</p>

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

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {saving ? '보내는 중…' : '신청하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
