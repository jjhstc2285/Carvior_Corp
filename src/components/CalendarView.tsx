import dayjs, { type Dayjs } from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, AttendanceStatus } from '../types';
import { computeStatus, isWorkday, STATUS_LABEL } from '../lib/attendance';

interface Props {
  month: Dayjs;
  records: AttendanceRecord[];
  requests: AttendanceRequest[]; // 해당 직원의 근태신청(연차/외근)만 필터링해서 전달
}

const DOTS: Record<AttendanceStatus, string> = {
  normal: 'bg-emerald-400',
  late: 'bg-amber-400',
  earlyLeave: 'bg-orange-400',
  lateAndEarly: 'bg-red-400',
  missing: 'bg-slate-300',
  dayOff: 'bg-red-300',
  annualLeave: 'bg-violet-400',
  fieldWork: 'bg-sky-400',
};

export default function CalendarView({ month, records, requests }: Props) {
  const start = month.startOf('month');
  const end = month.endOf('month');
  const gridStart = start.startOf('week');
  const gridEnd = end.endOf('week');

  const cells: Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd, 'day'); d = d.add(1, 'day')) {
    cells.push(d);
  }

  const today = dayjs();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400">
        {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {cells.map(d => {
          const inMonth = d.isSame(month, 'month');
          const dateStr = d.format('YYYY-MM-DD');
          const record = records.find(r => r.date === dateStr);
          const future = d.isAfter(today, 'day');
          const workday = isWorkday(dateStr);
          const approvedKind = requests.find(r => r.date === dateStr && r.status === 'approved')?.kind ?? null;

          // 미래 근무일인데 연차/외근 신청이 없으면 아직 알 수 없으니 상태 표시 안 함.
          // 휴무·승인된 연차/외근은 미래여도 이미 확정된 사실이라 항상 표시.
          let status: AttendanceStatus | null = null;
          if (!workday) status = 'dayOff';
          else if (approvedKind === 'annualLeave') status = 'annualLeave';
          else if (approvedKind === 'fieldWork') status = 'fieldWork';
          else if (!future) status = computeStatus(record, dateStr);

          const showBigX = status === 'dayOff' || status === 'annualLeave';

          return (
            <div
              key={dateStr}
              className={`relative aspect-square overflow-hidden rounded-lg border p-1.5 text-xs ${inMonth ? 'border-slate-100 bg-white' : 'border-transparent bg-transparent text-slate-300'} ${d.isSame(today, 'day') ? 'ring-2 ring-indigo-400' : ''}`}
            >
              {inMonth && showBigX && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl font-black text-red-200 sm:text-5xl">
                  ×
                </span>
              )}
              <div className="relative flex items-center justify-between">
                <span className={inMonth ? 'text-slate-600' : 'text-slate-300'}>{d.date()}</span>
                {status && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} title={STATUS_LABEL[status]} />}
              </div>
              {inMonth && workday && !approvedKind && record?.clockIn && (
                <p className="relative mt-1 truncate text-[10px] text-slate-400">{record.clockIn}{record.clockOut ? `-${record.clockOut}` : ''}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${DOTS[s]}`} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
