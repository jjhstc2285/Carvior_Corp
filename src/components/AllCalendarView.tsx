import dayjs, { type Dayjs } from 'dayjs';
import type { AttendanceRecord, AttendanceRequest, AttendanceStatus, Employee } from '../types';
import { approvedRequestKind, computeStatus, isWorkday, STATUS_LABEL } from '../lib/attendance';

/**
 * 전체 직원 출퇴근 캘린더.
 *
 * 한 사람씩 골라 봐야 캘린더가 나왔다. 그러면 "그날 누가 늦었나"를 보려고 스무 명을
 * 한 명씩 눌러야 한다 — 아무도 그렇게 보지 않는다.
 *
 * 날마다 사람을 세어 띄운다. 지각·누락처럼 봐야 하는 것만 색으로 크게 두고, 정상은
 * 숫자로만 둔다 — 정상인 날이 대부분이라 그것까지 색이면 색이 의미를 잃는다.
 *
 * 누가 그랬는지는 칸에 마우스를 올리면 이름으로 나온다. 한 칸에 스무 명 이름을 늘어
 * 놓으면 달력이 아니라 표가 된다.
 */

interface Props {
  month: Dayjs;
  employees: Employee[];
  records: AttendanceRecord[];
  requests: AttendanceRequest[];
}

/** 세어 보여줄 것들. 왼쪽부터 눈에 걸려야 하는 차례다 */
const SHOWN: { status: AttendanceStatus; dot: string; text: string }[] = [
  { status: 'missing', dot: 'bg-slate-400', text: 'text-slate-600' },
  { status: 'late', dot: 'bg-amber-400', text: 'text-amber-700' },
  { status: 'earlyLeave', dot: 'bg-orange-400', text: 'text-orange-700' },
  { status: 'lateAndEarly', dot: 'bg-red-400', text: 'text-red-700' },
  { status: 'annualLeave', dot: 'bg-violet-400', text: 'text-violet-700' },
  { status: 'halfDay', dot: 'bg-violet-300', text: 'text-violet-600' },
  { status: 'fieldWork', dot: 'bg-sky-400', text: 'text-sky-700' },
];

export default function AllCalendarView({ month, employees, records, requests }: Props) {
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
        {['일', '월', '화', '수', '목', '금', '토'].map(d => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {cells.map(d => {
          const inMonth = d.isSame(month, 'month');
          const dateStr = d.format('YYYY-MM-DD');
          const workday = isWorkday(dateStr);
          const future = d.isAfter(today, 'day');

          /*
            그날 사람마다 상태를 낸다.

            아직 오지 않은 날은 세지 않는다 — 안 찍힌 게 아니라 아직 안 온 날이다.
            숫자로 세어 두면 '내일 누락 20명'처럼 보인다.
          */
          const byStatus = new Map<AttendanceStatus, string[]>();
          if (inMonth && workday && !future) {
            for (const emp of employees) {
              const record = records.find(r => r.employeeId === emp.id && r.date === dateStr);
              const kind = approvedRequestKind(requests, emp.id, dateStr);
              const status = computeStatus(record, dateStr, kind);
              byStatus.set(status, [...(byStatus.get(status) ?? []), emp.name]);
            }
          }

          const normal = byStatus.get('normal')?.length ?? 0;
          const marks = SHOWN.map(s => ({ ...s, names: byStatus.get(s.status) ?? [] })).filter(s => s.names.length > 0);

          return (
            <div
              key={dateStr}
              className={`min-h-[84px] rounded-lg border p-1.5 ${
                !inMonth
                  ? 'border-transparent bg-transparent'
                  : !workday
                    ? 'border-slate-100 bg-slate-50/60'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-xs font-semibold ${
                    !inMonth
                      ? 'text-transparent'
                      : d.isSame(today, 'day')
                        ? 'rounded bg-indigo-600 px-1.5 text-white'
                        : !workday
                          ? 'text-slate-300'
                          : 'text-slate-500'
                  }`}
                >
                  {d.date()}
                </span>
                {/* 정상은 숫자로만 — 대부분이 정상이라 색까지 주면 색이 뜻을 잃는다 */}
                {normal > 0 && (
                  <span className="text-[10px] font-medium text-emerald-600" title={`정상 ${byStatus.get('normal')?.join(', ')}`}>
                    정상 {normal}
                  </span>
                )}
              </div>

              <div className="mt-1 space-y-0.5">
                {marks.map(m => (
                  <p
                    key={m.status}
                    className={`flex items-center gap-1 text-[10px] font-medium ${m.text}`}
                    title={`${STATUS_LABEL[m.status]} — ${m.names.join(', ')}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                    {STATUS_LABEL[m.status]} {m.names.length}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className="font-medium text-slate-500">{employees.length}명 기준</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 정상
        </span>
        {SHOWN.map(s => (
          <span key={s.status} className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {STATUS_LABEL[s.status]}
          </span>
        ))}
        <span>칸에 마우스를 올리면 누구인지 나옵니다</span>
      </div>
    </div>
  );
}
