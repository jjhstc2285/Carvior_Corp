import { useState, type ReactNode } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalEvent {
  id: string;
  label: string;
  sublabel: string;
  colorClass: string; // 예: 'bg-indigo-50 text-indigo-700'
  dotClass: string; // 예: 'bg-indigo-400'
  /** 누르면 할 일 — 없으면 눌리지 않는다(달력 칸 선택만 된다) */
  onSelect?: () => void;
}

interface Props {
  month: Dayjs;
  onMonthChange: (d: Dayjs) => void;
  eventsForDate: (dateStr: string) => CalEvent[];
  /** 날짜를 눌렀을 때 바깥에서도 반응이 필요하면 넘긴다(작업일지: 그 주로 이동). */
  onSelectDate?: (dateStr: string) => void;
  /**
   * 날짜 옆에 붙일 한 줄 — 그날의 합계 같은 것.
   *
   * 칩은 한 건씩이라 "그날 통틀어 얼마"를 볼 수가 없다. 칸마다 세어 가며 더하게
   * 두지 않는다 — 날짜 옆에 바로 적는다. 안 넘기면 아무것도 안 그린다.
   */
  summaryForDate?: (dateStr: string) => ReactNode;
}

// 근태/상담 등 여러 모듈에서 재사용하는 월별 이벤트 캘린더 — 셀에 이벤트 칩(최대 3개+더보기)을
// 보여주고, 날짜를 클릭하면 아래에 그날 전체 목록을 펼쳐 보여준다.
export default function EventCalendar({ month, onMonthChange, eventsForDate, onSelectDate, summaryForDate }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const gridStart = month.startOf('week');
  const gridEnd = month.endOf('month').endOf('week');
  const cells: Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd, 'day'); d = d.add(1, 'day')) cells.push(d);

  const today = dayjs();
  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  return (
    <div>
      <div className="mb-3 flex items-center gap-1">
        <button onClick={() => onMonthChange(month.subtract(1, 'month'))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50">
          <ChevronLeft size={16} />
        </button>
        <span className="w-28 text-center text-sm font-semibold text-slate-700">{month.format('YYYY년 M월')}</span>
        <button onClick={() => onMonthChange(month.add(1, 'month'))} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => onMonthChange(dayjs().startOf('month'))} className="ml-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
          오늘
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400">
        {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {cells.map(d => {
          const inMonth = d.isSame(month, 'month');
          const dateStr = d.format('YYYY-MM-DD');
          const dayEvents = eventsForDate(dateStr);
          const shown = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - shown.length;
          return (
            /*
              칸 안에 누를 수 있는 칩이 들어가서 칸 자체는 div 로 둔다 —
              버튼 안에 버튼을 넣으면 브라우저가 제멋대로 처리한다.
            */
            <div
              key={dateStr}
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedDate(dateStr); onSelectDate?.(dateStr); }}
              onKeyDown={ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setSelectedDate(dateStr);
                  onSelectDate?.(dateStr);
                }
              }}
              className={`min-h-20 cursor-pointer rounded-lg border p-1.5 text-left text-xs transition-colors sm:min-h-24 ${
                inMonth ? 'border-slate-100 bg-white hover:bg-slate-50' : 'border-transparent bg-transparent text-slate-300'
              } ${d.isSame(today, 'day') ? 'ring-2 ring-indigo-400' : ''} ${selectedDate === dateStr ? 'border-indigo-300 bg-indigo-50/40' : ''}`}
            >
              <div className="flex items-baseline gap-1">
                <span className={inMonth ? 'text-slate-600' : 'text-slate-300'}>{d.date()}</span>
                {/* 그날 합계 — 넘겨준 달에만 그린다 */}
                {inMonth && <span className="ml-auto min-w-0 truncate">{summaryForDate?.(dateStr)}</span>}
              </div>
              <div className="mt-1 space-y-0.5">
                {shown.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!e.onSelect}
                    // 칩을 눌렀을 때 칸까지 같이 눌리면 아래 목록이 덩달아 열린다
                    onClick={ev => { ev.stopPropagation(); e.onSelect?.(); }}
                    title={`${e.label} · ${e.sublabel}`}
                    className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left ${e.colorClass} ${
                      e.onSelect ? 'hover:brightness-95' : ''
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.dotClass}`} />
                    <span className="truncate">{e.label}</span>
                  </button>
                ))}
                {overflow > 0 && <p className="px-1 text-[10px] text-slate-400">+{overflow} more</p>}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          <p className="mb-2 text-xs font-bold text-slate-500">{dayjs(selectedDate).format('YYYY년 M월 D일 (ddd)')} · {selectedEvents.length}건</p>
          {selectedEvents.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">일정이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {selectedEvents.map(e => (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!e.onSelect}
                    onClick={() => e.onSelect?.()}
                    className={`flex w-full items-center gap-2 py-2 text-left text-sm ${e.onSelect ? 'hover:bg-slate-100' : ''}`}
                  >
                    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${e.colorClass}`}>{e.sublabel}</span>
                    <span className="font-medium text-slate-700">{e.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
