import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import { useStore } from '../../store';
import type { Role, WorkLog } from '../../types';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';
import { useWorkLogs } from './useWorkLogs';
import WorkLogDayCard from './WorkLogDayCard';

interface Props {
  role: Role;
}

/**
 * 노션 업무일지와 같은 세는 법 — 주는 일요일에 시작하고, 1일이 낀 주가 그 달의 1주차다.
 * (예: 2026-08-01이 토요일이면 8/23~8/29 주가 "8월 5주차")
 */
function weekLabel(weekStart: Dayjs): string {
  const nth = Math.ceil((weekStart.date() + weekStart.startOf('month').day()) / 7);
  return `${weekStart.format('YYYY년 M월')} ${nth}주차`;
}

export default function WorkLogModule({ role }: Props) {
  const { state } = useStore();
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [calMonth, setCalMonth] = useState(() => dayjs().startOf('month'));
  // 'self' = 내 일지, 'all' = 전 직원(관리자만), 그 외에는 직원 id
  const [view, setView] = useState<string>('self');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);
  const weekFrom = weekStart.format('YYYY-MM-DD');
  const weekTo = weekStart.add(6, 'day').format('YYYY-MM-DD');

  // 주간 보드와 월별 캘린더가 한 번에 받은 같은 목록을 나눠 쓴다.
  // 따로 받아오면 위에서 체크한 게 아래 캘린더에 안 비쳐서 서로 다른 화면처럼 보인다.
  const gridStart = calMonth.startOf('month').startOf('week');
  const gridEnd = calMonth.endOf('month').endOf('week');
  const from = (weekStart.isBefore(gridStart) ? weekStart : gridStart).format('YYYY-MM-DD');
  const to = (weekStart.add(6, 'day').isAfter(gridEnd) ? weekStart.add(6, 'day') : gridEnd).format('YYYY-MM-DD');

  const isAdmin = role === 'ADMIN';
  const isAllView = isAdmin && view === 'all';
  // 직원 계정은 서버가 본인 것으로 고정하므로 employeeId를 보내지 않는다.
  const scope = !isAdmin ? '' : isAllView ? '' : view === 'self' ? state.currentEmployeeId : view;

  const { logs, loading, error, add, toggle, edit, remove } = useWorkLogs(from, to, scope);

  // 날짜별로 한 번만 묶어두고 주간 칸·캘린더가 같이 꺼내 쓴다.
  const byDate = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const log of logs) {
      const bucket = map.get(log.date);
      if (bucket) bucket.push(log);
      else map.set(log.date, [log]);
    }
    return map;
  }, [logs]);

  // 상단 요약은 '보고 있는 주'만 센다(받아온 범위에는 캘린더용 다른 달도 섞여 있다).
  const weekLogs = useMemo(() => logs.filter(l => l.date >= weekFrom && l.date <= weekTo), [logs, weekFrom, weekTo]);
  const total = weekLogs.length;
  const doneCount = weekLogs.filter(l => l.done).length;
  const employeeName = (id: string) => state.employees.find(e => e.id === id)?.name ?? '알 수 없음';
  const ownerLabel = isAllView ? employeeName : undefined;

  // 캘린더 칸에 뿌릴 칩 — 완료된 건 초록, 남은 건 인디고.
  const eventsForDate = (dateStr: string): CalEvent[] =>
    (byDate.get(dateStr) ?? []).map(log => ({
      id: log.id,
      label: isAllView ? `${employeeName(log.employeeId)} · ${log.content}` : log.content,
      sublabel: log.done ? '완료' : '할 일',
      colorClass: log.done ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700',
      dotClass: log.done ? 'bg-emerald-400' : 'bg-indigo-400',
    }));

  // 직원은 같은 팀 일지를 함께 본다 — 화면 이름이 '내 작업일지'면 남의 것이 왜 보이나 싶다.
  const myTeam = state.employees.find(e => e.id === state.currentEmployeeId)?.department;

  const viewerName =
    !isAdmin || view === 'self'
      ? myTeam
        ? `${myTeam} 작업일지`
        : '내 작업일지'
      : isAllView
        ? '전 직원 작업일지'
        : `${employeeName(view)} 작업일지`;

  if (!state.currentEmployeeId) {
    return <p className="px-6 py-10 text-sm text-slate-400">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">작업일지</h1>
          <p className="mt-1 text-sm text-slate-500">
            요일별로 할 일을 적어두고 처리한 건 체크해 두세요.
            {!isAdmin &&
              (myTeam
                ? ` 같은 ${myTeam} 사람들의 일지가 함께 보입니다.`
                : ' 팀이 정해지면 같은 팀 일지가 함께 보입니다.')}
          </p>
        </div>

        {isAdmin && (
          <select
            value={view}
            onChange={e => setView(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="self">내 작업일지</option>
            <option value="all">전 직원 보기</option>
            {state.employees
              .filter(e => e.active && e.id !== state.currentEmployeeId)
              .map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.position}
                </option>
              ))}
          </select>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(w => w.subtract(1, 'week'))}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="이전 주"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekStart(dayjs().startOf('week'))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            이번 주
          </button>
          <button
            onClick={() => setWeekStart(w => w.add(1, 'week'))}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="다음 주"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="text-base font-bold text-slate-800">{weekLabel(weekStart)}</p>
        <p className="text-xs text-slate-400">
          {weekStart.format('M/D')} – {weekStart.add(6, 'day').format('M/D')} · {viewerName}
        </p>

        <span className="ml-auto text-xs text-slate-400">
          {loading ? '불러오는 중…' : total === 0 ? '등록된 일지 없음' : `완료 ${doneCount}/${total}`}
        </span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map(day => {
          const key = day.format('YYYY-MM-DD');
          return (
            <WorkLogDayCard
              key={key}
              day={day}
              logs={byDate.get(key) ?? []}
              canAdd={!isAllView}
              ownerName={ownerLabel}
              onAdd={content => add(key, content)}
              onToggle={toggle}
              onEdit={edit}
              onRemove={remove}
            />
          );
        })}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
        <NotebookPen size={12} />
        할 일을 입력하고 Enter를 누르면 저장됩니다. 적어둔 내용을 누르면 바로 고칠 수 있어요.
      </p>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-800">월별 보기</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            날짜를 누르면 그날 목록이 아래에 펼쳐지고, 위 주간 보드도 그 주로 이동합니다.
          </p>
        </div>

        <EventCalendar
          month={calMonth}
          onMonthChange={setCalMonth}
          eventsForDate={eventsForDate}
          onSelectDate={date => setWeekStart(dayjs(date).startOf('week'))}
        />
      </div>
    </div>
  );
}
