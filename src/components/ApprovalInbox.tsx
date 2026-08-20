import { useState } from 'react';
import dayjs from 'dayjs';
import { Check, X } from 'lucide-react';
import { useStore } from '../store';

export default function ApprovalInbox() {
  const { state, approveRequest, rejectRequest } = useStore();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const pending = state.requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const confirmReject = (id: string) => {
    if (!rejectNote.trim()) return;
    rejectRequest(id, rejectNote.trim());
    setRejectingId(null);
    setRejectNote('');
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">수정요청 승인함</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
            대기 {pending.length}건
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">처리할 수정요청이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {pending.map(r => {
            const emp = employeeOf(r.employeeId);
            return (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{emp?.name}</span>
                      <span className="text-xs text-slate-400">{emp?.department}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-500">{dayjs(r.date).format('M월 D일 (ddd)')}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      요청 시각 — 출근 {r.requestedClockIn ?? '-'} / 퇴근 {r.requestedClockOut ?? '-'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => approveRequest(r.id)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Check size={13} /> 승인
                    </button>
                    <button
                      onClick={() => setRejectingId(rejectingId === r.id ? null : r.id)}
                      className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      <X size={13} /> 반려
                    </button>
                  </div>
                </div>

                {rejectingId === r.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      placeholder="반려 사유를 입력해주세요"
                      className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-red-300"
                    />
                    <button
                      onClick={() => confirmReject(r.id)}
                      disabled={!rejectNote.trim()}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      반려 확정
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
