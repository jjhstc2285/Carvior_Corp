import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarDays, List, Plus } from 'lucide-react';
import { useStore } from '../store';
import { approvedRequestKind, computeStatus, formatMinutes, isWorkday, workedMinutes } from '../lib/attendance';
import { ANNUAL_LEAVE_QUOTA, ATTENDANCE_REQUEST_KIND_LABEL } from '../types';
import StatusBadge from './StatusBadge';
import CorrectionRequestModal from './CorrectionRequestModal';
import AttendanceRequestModal from './AttendanceRequestModal';
import ClockCard from './ClockCard';
import CalendarView from './CalendarView';

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '반려됨',
};
const REQUEST_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-red-50 text-red-700 ring-red-600/20',
};

export default function EmployeeView() {
  const { state } = useStore();
  const [requestDate, setRequestDate] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [attReqOpen, setAttReqOpen] = useState(false);

  const employee = state.employees.find(e => e.id === state.currentEmployeeId)!;

  const days = useMemo(() => {
    const today = dayjs();
    const start = today.startOf('month');
    const list: string[] = [];
    for (let d = start; d.isBefore(today, 'day') || d.isSame(today, 'day'); d = d.add(1, 'day')) {
      const dateStr = d.format('YYYY-MM-DD');
      if (isWorkday(dateStr)) list.push(dateStr);
    }
    return list.reverse();
  }, []);

  const rows = days.map(date => {
    const record = state.records.find(r => r.employeeId === employee.id && r.date === date);
    const kind = approvedRequestKind(state.attendanceRequests, employee.id, date);
    const status = computeStatus(record, date, kind);
    const request = state.requests
      .filter(r => r.employeeId === employee.id && r.date === date)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { date, record, status, request };
  });

  const myRequests = [...state.requests]
    .filter(r => r.employeeId === employee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myAttendanceRequests = [...state.attendanceRequests]
    .filter(r => r.employeeId === employee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const usedAnnualLeave = state.attendanceRequests.filter(
    r => r.employeeId === employee.id && r.kind === 'annualLeave' && r.status === 'approved' && dayjs(r.date).isSame(dayjs(), 'year'),
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{employee.name}님의 근태</h1>
          <p className="mt-1 text-sm text-slate-500">{employee.department} · {employee.position} · {dayjs().format('YYYY년 M월')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
            <span className="text-slate-400">연차 사용</span>{' '}
            <span className="font-bold text-violet-600">{usedAnnualLeave}</span>
            <span className="text-slate-400"> / {ANNUAL_LEAVE_QUOTA}</span>
          </div>
          <button
            onClick={() => setAttReqOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 근태 신청
          </button>
        </div>
      </div>

      <div className="mb-6">
        <ClockCard />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-slate-800">이번 달 출퇴근 기록</h2>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              <List size={14} /> 리스트
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              <CalendarDays size={14} /> 캘린더
            </button>
          </div>
        </div>

        {view === 'calendar' ? (
          <div className="p-4">
            <CalendarView
              month={dayjs()}
              records={state.records.filter(r => r.employeeId === employee.id)}
              requests={state.attendanceRequests.filter(r => r.employeeId === employee.id)}
            />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">날짜</th>
                <th className="px-5 py-2.5 font-medium">출근</th>
                <th className="px-5 py-2.5 font-medium">퇴근</th>
                <th className="px-5 py-2.5 font-medium">근무시간</th>
                <th className="px-5 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ date, record, status, request }) => (
                <tr key={date} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-2.5 text-slate-700">{dayjs(date).format('M월 D일 (ddd)')}</td>
                  <td className="px-5 py-2.5 text-slate-600">{record?.clockIn ?? '-'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{record?.clockOut ?? '-'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{formatMinutes(workedMinutes(record))}</td>
                  <td className="px-5 py-2.5"><StatusBadge status={status} /></td>
                  <td className="px-5 py-2.5 text-right">
                    {status === 'missing' ? (
                      request && request.status !== 'rejected' ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${REQUEST_STATUS_COLOR[request.status]}`}>
                          {REQUEST_STATUS_LABEL[request.status]}
                        </span>
                      ) : (
                        <button
                          onClick={() => setRequestDate(date)}
                          className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                        >
                          {request?.status === 'rejected' ? '다시 요청' : '수정 요청'}
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-slate-800">내 근태 신청(연차/외근) 현황</h2>
        </div>
        {myAttendanceRequests.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">제출한 근태 신청이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {myAttendanceRequests.map(r => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{dayjs(r.date).format('M월 D일 (ddd)')}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${r.kind === 'annualLeave' ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'}`}>
                      {ATTENDANCE_REQUEST_KIND_LABEL[r.kind]}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${REQUEST_STATUS_COLOR[r.status]}`}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.reason}</p>
                  {r.reviewNote && <p className="mt-1 text-xs text-slate-400">관리자 메모: {r.reviewNote}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{dayjs(r.createdAt).format('M/D HH:mm')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-slate-800">내 수정요청 현황</h2>
        </div>
        {myRequests.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">제출한 수정요청이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {myRequests.map(r => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{dayjs(r.date).format('M월 D일 (ddd)')}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${REQUEST_STATUS_COLOR[r.status]}`}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.reason}</p>
                  {r.reviewNote && <p className="mt-1 text-xs text-slate-400">관리자 메모: {r.reviewNote}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{dayjs(r.createdAt).format('M/D HH:mm')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requestDate && (
        <CorrectionRequestModal
          employeeId={employee.id}
          date={requestDate}
          onClose={() => setRequestDate(null)}
        />
      )}
      {attReqOpen && (
        <AttendanceRequestModal employeeId={employee.id} onClose={() => setAttReqOpen(false)} />
      )}
    </div>
  );
}
