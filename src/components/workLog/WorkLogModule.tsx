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

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

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
  // 여러 사람 것이 한 칸에 섞여 나오는 보기 — 관리자의 '전 직원', 직원의 '팀 전체'
  const isAllView = view === 'all';
  const isSelfView = view === 'self';

  const scope = isAllView || isSelfView ? (isSelfView ? state.currentEmployeeId : '') : view;
  // 직원의 '팀 전체'는 team 플래그로 부른다 — 그냥 비워 보내면 서버가 본인 것만 준다.
  const { logs, loading, error, add, toggle, edit, remove } = useWorkLogs(
    from,
    to,
    isAllView ? '' : scope,
    !isAdmin && isAllView,
  );

  // 남의 일지는 보기만 한다. 서버도 막지만 화면에 버튼이 있으면 눌러보고 거절당한다.
  const readOnly = !isSelfView && (!isAdmin || isAllView);

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
  /*
    빈 날은 접어 둔다.

    연차·주말처럼 아무도 안 적은 날이 한 주에 두세 칸씩 있는데, 일곱 칸을 똑같이 나눠
    두면 정작 스무 줄씩 적힌 날이 좁아져서 읽을 수가 없다. 적힌 게 없는 날은 띠 하나로
    접고, 그만큼 적힌 날을 넓게 쓴다. 눌러서 펼치면 그 날도 다시 쓸 수 있다.

    사람이 직접 누른 것만 기억한다 — 기본은 '비었으면 접힘'이라 주가 바뀌면 다시 셈한다.
  */
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const toggleDay = (key: string, isOpen: boolean) =>
    setOpenOverride(prev => ({ ...prev, [key]: !isOpen }));

  /** 완료한 줄을 감춘다 — 남은 일만 보고 싶을 때 */
  const [hideDone, setHideDone] = useState(false);

  const total = weekLogs.length;
  const doneCount = weekLogs.filter(l => l.done).length;
  const employeeName = (id: string) => state.employees.find(e => e.id === id)?.name ?? '알 수 없음';
  const ownerLabel = isAllView ? employeeName : undefined;

  // 직원은 같은 팀 사람만 고를 수 있다.
  const myTeam = state.employees.find(e => e.id === state.currentEmployeeId)?.department;
  const pickable = state.employees.filter(
    e => e.active && e.id !== state.currentEmployeeId && (isAdmin || (myTeam != null && e.department === myTeam)),
  );

  // 캘린더 칸에 뿌릴 칩 — 완료된 건 초록, 남은 건 인디고.
  const eventsForDate = (dateStr: string): CalEvent[] =>
    (byDate.get(dateStr) ?? []).map(log => ({
      id: log.id,
      label: isAllView ? `${employeeName(log.employeeId)} · ${log.content}` : log.content,
      sublabel: log.done ? '완료' : '할 일',
      colorClass: log.done ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700',
      dotClass: log.done ? 'bg-emerald-400' : 'bg-indigo-400',
    }));

  const viewerName = isSelfView
    ? '내 작업일지'
    : isAllView
      ? isAdmin
        ? '전 직원 작업일지'
        : `${myTeam ?? '팀'} 전체 작업일지`
      : `${employeeName(view)} 작업일지`;

  if (!state.currentEmployeeId) {
    return <p className="px-6 py-10 text-sm text-slate-400">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">업무 일지<span className="ml-1.5 text-sm font-medium text-slate-400">(작업 일지)</span></h1>
          <p className="mt-1 text-sm text-slate-500">
            요일별로 할 일을 적어두고 처리한 건 체크해 두세요.
            {!isAdmin &&
              (myTeam
                ? ` 오른쪽에서 ${myTeam} 팀원을 골라 그 사람 일지를 볼 수 있습니다(보기만 됩니다).`
                : ' 팀이 정해지면 팀원 일지도 볼 수 있습니다.')}
          </p>
        </div>

        {/* 직원도 같은 팀 사람을 골라 볼 수 있다. 팀이 없으면 고를 게 없어 상자를 안 띄운다. */}
        {(isAdmin || pickable.length > 0) && (
          <select
            value={view}
            onChange={e => setView(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="self">내 작업일지</option>
            <option value="all">{isAdmin ? '전 직원 보기' : `${myTeam} 전체 보기`}</option>
            {pickable.map(e => (
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

        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={e => setHideDone(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          완료한 일 감추기
        </label>
        <span className="text-xs text-slate-400">
          {loading ? '불러오는 중…' : total === 0 ? '등록된 일지 없음' : `완료 ${doneCount}/${total}`}
        </span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      {/* 넓은 화면에서는 칸을 나눠 갖는다 — 접힌 날은 띠만 남고 그만큼 적힌 날이 넓어진다 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:items-start">
        {days.map(day => {
          const key = day.format('YYYY-MM-DD');
          const dayLogs = byDate.get(key) ?? [];
          const open = openOverride[key] ?? dayLogs.length > 0;
          const shown = hideDone ? dayLogs.filter(l => !l.done) : dayLogs;

          if (!open) {
            return (
              <button
                key={key}
                onClick={() => toggleDay(key, open)}
                title="눌러서 펼치기"
                className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-400 hover:bg-slate-100 xl:w-11 xl:shrink-0 xl:flex-col xl:justify-start xl:px-0 xl:py-3"
              >
                <span className="font-semibold text-slate-500 xl:[writing-mode:vertical-rl]">
                  {day.format('M/D')} {WEEKDAY[day.day()]}
                </span>
                <span className="xl:[writing-mode:vertical-rl]">
                  {dayLogs.length > 0 ? `${dayLogs.length}건` : '기록 없음'}
                </span>
              </button>
            );
          }

          return (
            <div key={key} className="xl:min-w-0 xl:flex-1">
              <WorkLogDayCard
                day={day}
                logs={shown}
                hiddenCount={dayLogs.length - shown.length}
                onCollapse={() => toggleDay(key, open)}
                canAdd={!readOnly}
                readOnly={readOnly}
                ownerName={ownerLabel}
                onAdd={content => add(key, content)}
                onToggle={toggle}
                onEdit={edit}
                onRemove={remove}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
        <NotebookPen size={12} />
        할 일을 입력하고 Enter를 누르면 저장됩니다. 적어둔 내용을 누르면 바로 고칠 수 있어요.
        <br className="sm:hidden" />
        <span className="hidden sm:inline">· </span>
        적은 게 없는 날(연차·주말)은 <b>띠로 접힙니다</b> — 띠를 누르면 펼쳐지고, 날짜 옆 접기 표를
        누르면 다시 접힙니다.
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
