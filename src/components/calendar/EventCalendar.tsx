import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalEvent {
  id: string;
  label: string;
  sublabel: string;
  colorClass: string; // 예: 'bg-indigo-50 text-indigo-700'
  dotClass: string; // 예: 'bg-indigo-400'
}

interface Props {
  month: Dayjs;
  onMonthChange: (d: Dayjs) => void;
  eventsForDate: (dateStr: string) => CalEvent[];
  /** 날짜를 눌렀을 때 바깥에서도 반응이 필요하면 넘긴다(작업일지: 그 주로 이동). */
  onSelectDate?: (dateStr: string) => void;
}

// 근태/상담 등 여러 모듈에서 재사용하는 월별 이벤트 캘린더 — 셀에 이벤트 칩(최대 3개+더보기)을
// 보여주고, 날짜를 클릭하면 아래에 그날 전체 목록을 펼쳐 보여준다.
export default function EventCalendar({ month, onMonthChange, eventsForDate, onSelectDate }: Props) {
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
            <button
              key={dateStr}
              onClick={() => { setSelectedDate(dateStr); onSelectDate?.(dateStr); }}
              className={`min-h-20 rounded-lg border p-1.5 text-left text-xs transition-colors sm:min-h-24 ${
                inMonth ? 'border-slate-100 bg-white hover:bg-slate-50' : 'border-transparent bg-transparent text-slate-300'
              } ${d.isSame(today, 'day') ? 'ring-2 ring-indigo-400' : ''} ${selectedDate === dateStr ? 'border-indigo-300 bg-indigo-50/40' : ''}`}
            >
              <span className={inMonth ? 'text-slate-600' : 'text-slate-300'}>{d.date()}</span>
              <div className="mt-1 space-y-0.5">
                {shown.map(e => (
                  <div key={e.id} className={`flex items-center gap-1 truncate rounded px-1 py-0.5 ${e.colorClass}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.dotClass}`} />
                    <span className="truncate">{e.label}</span>
                  </div>
                ))}
                {overflow > 0 && <p className="px-1 text-[10px] text-slate-400">+{overflow} more</p>}
              </div>
            </button>
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
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${e.colorClass}`}>{e.sublabel}</span>
                  <span className="font-medium text-slate-700">{e.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
