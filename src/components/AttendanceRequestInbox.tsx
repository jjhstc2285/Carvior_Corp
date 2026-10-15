import { useState } from 'react';
import dayjs from 'dayjs';
import { Check, X } from 'lucide-react';
import { useStore } from '../store';
import { ApiError } from '../lib/api';
import { alertError } from '../lib/alert';
import { ATTENDANCE_REQUEST_KIND_LABEL, type AttendanceRequestKind } from '../types';
import { ContractPhotoThumb } from './settlement/ContractPhotos';

/** 신청 종류별 뱃지 색. 키는 AttendanceRequestKind 그대로다. */
const KIND_COLOR: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: 'bg-violet-50 text-violet-600',
  HALF_DAY: 'bg-violet-50 text-violet-500',
  FIELD_WORK: 'bg-sky-50 text-sky-600',
  AWAY: 'bg-amber-50 text-amber-700',
  LATE_EXCUSE: 'bg-orange-50 text-orange-700',
};

export default function AttendanceRequestInbox() {
  const { state, approveAttendanceRequest, rejectAttendanceRequest } = useStore();
  /* 누르고 결과를 기다린다 — 거절당해도 조용하면 승인이 안 된 걸로 보인다 */
  const [busyId, setBusyId] = useState<string | null>(null);

  const review = async (id: string, run: () => Promise<void>) => {
    setBusyId(id);
    try {
      await run();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const pending = state.attendanceRequests
    .filter(r => r.status === 'PENDING')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const confirmReject = async (id: string) => {
    if (!rejectNote.trim()) return;
    await review(id, async () => {
      await rejectAttendanceRequest(id, rejectNote.trim());
      setRejectingId(null);
      setRejectNote('');
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">근태 신청(연차/외근) 승인함</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
            대기 {pending.length}건
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">처리할 근태 신청이 없습니다.</p>
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
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_COLOR[r.kind]}`}>
                        {ATTENDANCE_REQUEST_KIND_LABEL[r.kind]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                    {/* 눌러서 크게 본다 — 영수증은 작게 봐서는 못 읽는다 */}
                    {r.photos && (
                      <div className="mt-2">
                        <ContractPhotoThumb value={r.photos} size={56} alt="증빙" />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => void review(r.id, () => approveAttendanceRequest(r.id))}
                      disabled={busyId === r.id}
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
                      onClick={() => void confirmReject(r.id)}
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
