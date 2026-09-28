import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { ApiError } from '../lib/api';
import { WORK_START, WORK_END } from '../lib/attendance';

interface Props {

  date: string;
  onClose: () => void;
}

export default function CorrectionRequestModal({ date, onClose }: Props) {
  const { submitCorrectionRequest } = useStore();
  const [reason, setReason] = useState('');
  const [clockIn, setClockIn] = useState(WORK_START);
  const [clockOut, setClockOut] = useState(WORK_END);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reason.trim().length >= 5 && !saving;

  /*
    보내고 결과를 기다린다.

    예전에는 보내자마자 창을 닫았다. 서버가 거절해도 화면에는 아무 일도 안 일어나서,
    누른 사람은 신청이 간 줄 알고 기다렸다 — 실패한 줄은 아무도 몰랐다.
  */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await submitCorrectionRequest({
        date,
        reason: reason.trim(),
        requestedClockIn: clockIn,
        requestedClockOut: clockOut,
      });
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
          <h3 className="text-base font-bold text-slate-800">출퇴근 수정 요청</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">{dayjs(date).format('YYYY년 M월 D일 (ddd)')} 기록을 정정 요청합니다.</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">요청 출근시각</label>
            <input
              type="time"
              value={clockIn}
              onChange={e => setClockIn(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">요청 퇴근시각</label>
            <input
              type="time"
              value={clockOut}
              onChange={e => setClockOut(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-slate-500">사유</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="누락 사유를 입력해주세요 (5자 이상)"
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
            {saving ? '보내는 중…' : '요청 보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
