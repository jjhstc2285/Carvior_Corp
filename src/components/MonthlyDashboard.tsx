import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarDays, List } from 'lucide-react';
import { useStore } from '../store';
import { approvedRequestKind, computeStatus, isWorkday } from '../lib/attendance';
import type { AttendanceStatus } from '../types';
import StatusBadge from './StatusBadge';
import StatsCards from './StatsCards';
import CalendarView from './CalendarView';
import AllCalendarView from './AllCalendarView';
import AttendanceRankBadge from './AttendanceRankBadge';
import EmployeeAvatar from './EmployeeAvatar';
import { attendanceRanking, hoursLabel } from '../lib/attendanceRank';

const STATUS_OPTIONS: { value: AttendanceStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체 상태' },
  { value: 'normal', label: '정상' },
  { value: 'late', label: '지각' },
  { value: 'earlyLeave', label: '조퇴' },
  { value: 'lateAndEarly', label: '지각+조퇴' },
  { value: 'missing', label: '누락' },
  { value: 'annualLeave', label: '연차' },
  { value: 'halfDay', label: '반차' },
  { value: 'fieldWork', label: '외근/출장' },
];

export default function MonthlyDashboard() {
  const { state } = useStore();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [department, setDepartment] = useState('all');
  const [employeeId, setEmployeeId] = useState('all');
  const [status, setStatus] = useState<AttendanceStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  // 부서는 아직 비어 있는 직원이 있어 null을 걸러낸다.
  const departments = useMemo(
    () => Array.from(new Set(state.employees.map(e => e.department).filter((d): d is string => !!d))),
    [state.employees],
  );

  const monthDayjs = dayjs(`${month}-01`);
  const days = useMemo(() => {
    const today = dayjs();
    const start = monthDayjs.startOf('month');
    const end = monthDayjs.isSame(today, 'month') ? today : monthDayjs.endOf('month');
    const list: string[] = [];
    for (let d = start; d.isBefore(end, 'day') || d.isSame(end, 'day'); d = d.add(1, 'day')) {
      const dateStr = d.format('YYYY-MM-DD');
      if (isWorkday(dateStr)) list.push(dateStr);
    }
    return list;
  }, [month]);

  /*
    그 달 출퇴근 성실도 순위.

    부서를 걸어도 순위는 회사 전체로 낸다 — 세 명짜리 부서에서 1등한 것과 스무 명 중
    1등한 것이 같은 왕관이면 표가 뜻을 잃는다.
  */
  const ranking = useMemo(
    () => attendanceRanking(state.employees, state.records, state.attendanceRequests, month, state.requests),
    [state.employees, state.records, state.attendanceRequests, month, state.requests],
  );
  const rankOf = (id: string) => ranking.find(r => r.employeeId === id) ?? null;
  /*
    순위 줄에는 다 띄운다.

    표를 받은 셋만 띄우면 나머지는 자기가 몇 시간 일했는지 볼 데가 없다 — 순위를 붙인
    까닭이 서로 보이게 하려는 것인데 셋만 보이면 그게 안 된다.
  */
  // 한 번도 안 찍은 사람은 뺀다 — 날마다 하루치가 깎여 꼴찌에 붙박이로 서는데 견줄 값이 없다
  const honored = ranking.filter(r => r.punched > 0);

  const scopedEmployees = state.employees.filter(e =>
    (department === 'all' || e.department === department) &&
    (employeeId === 'all' || e.id === employeeId)
  );

  const allRows = useMemo(() => {
    const out: { date: string; employeeId: string; status: AttendanceStatus }[] = [];
    for (const emp of scopedEmployees) {
      for (const date of days) {
        const record = state.records.find(r => r.employeeId === emp.id && r.date === date);
        const kind = approvedRequestKind(state.attendanceRequests, emp.id, date);
        const status = computeStatus(record, date, kind);
        // 아직 안 찍은 날은 일어난 일이 없다 — 목록에도 통계에도 넣지 않는다.
        // 오늘 출근 전인 사람이 '정상'으로 세어지던 걸 여기서 걸러낸다.
        if (status === 'pending') continue;
        out.push({ date, employeeId: emp.id, status });
      }
    }
    return out;
  }, [scopedEmployees, days, state.records, state.attendanceRequests]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { normal: 0, late: 0, earlyLeave: 0, lateAndEarly: 0, missing: 0, pending: 0, dayOff: 0, annualLeave: 0, halfDay: 0, fieldWork: 0 };
    allRows.forEach(r => { c[r.status]++; });
    return c;
  }, [allRows]);

  const filteredRows = status === 'all' ? allRows : allRows.filter(r => r.status === status);
  const sortedRows = [...filteredRows].sort((a, b) => b.date.localeCompare(a.date));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id)!;
  const recordOf = (empId: string, date: string) => state.records.find(r => r.employeeId === empId && r.date === date);

  const singleEmployee = employeeId !== 'all' ? state.employees.find(e => e.id === employeeId) : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select
          value={department}
          onChange={e => { setDepartment(e.target.value); setEmployeeId('all'); }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="all">전체 부서</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="all">전체 직원</option>
          {state.employees.filter(e => department === 'all' || e.department === department).map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as AttendanceStatus | 'all')}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-sm">
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

      <StatsCards counts={counts} total={allRows.length} />

      {/*
        이 달 출퇴근 순위.

        표를 펴 보는 사람만 알던 값이다. 이름을 누르면 그 사람만 걸러 본다 —
        왕관을 보고 "얼마나 잘 찍었나" 궁금해진 자리에서 바로 열리는 게 맞다.
      */}
      {honored.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="flex items-baseline justify-between border-b border-amber-200/70 px-3 py-1.5">
            <span className="text-xs font-bold text-amber-800">{dayjs(month).format('M월')} 출퇴근</span>
            <span className="text-[11px] text-amber-700/80">
              평일만 보고 20일로 환산합니다 · 9:30 보다 일찍 온 만큼 쌓고 18시 전에 간 만큼
              깎습니다(18시 넘겨 퇴근하면 0점) · 안 찍은 날은 하루치, 한쪽만 찍었거나
              정정한 날은 30분 · 연차·반차·외근과 휴일·주말은 세지 않습니다
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5 p-2.5">
            {honored.map(r => (
              <li key={r.employeeId}>
                <button
                  onClick={() => setEmployeeId(r.employeeId)}
                  title={`20일 기준 ${hoursLabel(r.minutes)} · 센 날 ${r.days}일 · 정상 ${r.normal} · 지각 ${r.late} · 조퇴 ${r.earlyLeave} · 누락 ${r.missing} · 정정 ${r.fixed} · 찍은 날 ${r.punched}${r.holidayMinutes > 0 ? ` · 휴일 ${hoursLabel(r.holidayMinutes)}(점수 밖)` : ''} — 눌러서 이 사람만 봅니다`}
                  className={`flex items-center gap-1.5 rounded-full border bg-white py-1 pl-1 pr-2.5 text-xs hover:bg-amber-50 ${
                    employeeId === r.employeeId ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'
                  }`}
                >
                  <EmployeeAvatar name={r.name} size={20} />
                  <AttendanceRankBadge row={r} />
                  <span className="font-semibold text-slate-800">{r.name}</span>
                  <span className="font-medium text-slate-600">{hoursLabel(r.minutes)}</span>
                  <span className="text-slate-400">{r.days}일</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white">
        {view === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-5 py-2.5 font-medium">날짜</th>
                  <th className="px-5 py-2.5 font-medium">부서</th>
                  <th className="px-5 py-2.5 font-medium">직원</th>
                  <th className="px-5 py-2.5 font-medium">출근</th>
                  <th className="px-5 py-2.5 font-medium">퇴근</th>
                  <th className="px-5 py-2.5 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">조건에 맞는 기록이 없습니다.</td></tr>
                )}
                {sortedRows.map((row, i) => {
                  const emp = employeeOf(row.employeeId);
                  const record = recordOf(row.employeeId, row.date);
                  return (
                    <tr key={`${row.employeeId}-${row.date}-${i}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-2.5 text-slate-600">{dayjs(row.date).format('M월 D일 (ddd)')}</td>
                      <td className="px-5 py-2.5 text-slate-500">{emp.department}</td>
                      {/* 이름을 누르면 그 사람만 본다 — 위에서 고르러 올라가지 않는다 */}
                      <td className="px-5 py-2.5">
                        <button
                          onClick={() => setEmployeeId(row.employeeId)}
                          title="눌러서 이 사람만 봅니다"
                          className="flex items-center gap-1.5 font-medium text-slate-700 hover:text-indigo-600"
                        >
                          <AttendanceRankBadge row={rankOf(row.employeeId)} />
                          {emp.name}
                        </button>
                      </td>
                      <td className="px-5 py-2.5 text-slate-500">{record?.clockIn ?? '-'}</td>
                      <td className="px-5 py-2.5 text-slate-500">{record?.clockOut ?? '-'}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : singleEmployee ? (
          <div className="p-5">
            <p className="mb-3 text-sm font-semibold text-slate-700">{singleEmployee.name} · {monthDayjs.format('YYYY년 M월')}</p>
            <CalendarView
              month={monthDayjs}
              records={state.records.filter(r => r.employeeId === singleEmployee.id)}
              requests={state.attendanceRequests.filter(r => r.employeeId === singleEmployee.id)}
            />
          </div>
        ) : (
          /*
            직원을 안 고르면 전체를 한 판에 본다.

            한 사람씩 골라야 캘린더가 나왔다 — "그날 누가 늦었나"를 보려고 스무 명을 한 명씩
            누를 사람은 없다. 날마다 세어 띄우고, 누구인지는 칸에 올리면 나온다.
          */
          <div className="p-5">
            <p className="mb-3 text-sm font-semibold text-slate-700">
              전체 직원 · {monthDayjs.format('YYYY년 M월')}
              {department !== 'all' && <span className="ml-1 font-medium text-slate-400">· {department}</span>}
            </p>
            <AllCalendarView
              month={monthDayjs}
              employees={scopedEmployees}
              records={state.records}
              requests={state.attendanceRequests}
            />
          </div>
        )}
      </div>
    </section>
  );
}
