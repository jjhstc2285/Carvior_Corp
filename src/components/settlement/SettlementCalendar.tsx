import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarDays, List } from 'lucide-react';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';

/**
 * 정산을 달력으로 보기.
 *
 * 표는 '무엇이 남았나'를 보기 좋고, 달력은 '언제 몰렸나'를 보기 좋다. 월말에 정산이
 * 한꺼번에 몰리는지, 비어 있는 주가 있는지는 표를 훑어서는 안 보인다.
 *
 * 기본은 표다 — 매일 쓰는 건 표고, 달력은 가끔 펼쳐 보는 쪽이다.
 * 달력에서 한 건을 누르면 표에서 연필을 누른 것과 같이 고치는 창이 열린다.
 * 승인이 끝나 잠긴 건은 눌리지 않는다(표에서도 못 고친다).
 */

export type SettlementView = 'list' | 'calendar';

export interface SettlementCalItem {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 달력 칸에 들어갈 한 줄 — 차명이 제일 알아보기 쉽다 */
  label: string;
  /** 그날 목록을 펼쳤을 때 앞에 붙는 말 — 상태·금액 */
  sublabel: string;
  tone: 'done' | 'progress' | 'locked';
  onSelect?: () => void;
}

const TONE: Record<SettlementCalItem['tone'], { chip: string; dot: string }> = {
  done: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
  progress: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  locked: { chip: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

/** 리스트 · 캘린더 전환 단추 */
export function SettlementViewToggle({
  view,
  onChange,
}: {
  view: SettlementView;
  onChange: (next: SettlementView) => void;
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
      {(
        [
          ['list', '리스트', List],
          ['calendar', '캘린더', CalendarDays],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
            view === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

export default function SettlementCalendar({
  items,
  month: controlledMonth,
  onMonthChange,
}: {
  items: SettlementCalItem[];
  /** 표와 같은 달을 보게 하려면 넘긴다(매입 정산은 달로 거른다). 안 주면 달력이 따로 든다 */
  month?: Dayjs;
  onMonthChange?: (next: Dayjs) => void;
}) {
  const [ownMonth, setOwnMonth] = useState(() => dayjs().startOf('month'));
  const month = controlledMonth ?? ownMonth;
  const setMonth = onMonthChange ?? setOwnMonth;

  /** 날짜별로 미리 묶어둔다 — 칸 42개를 그릴 때마다 전체를 훑지 않게 */
  const index = useMemo(() => {
    const by = new Map<string, CalEvent[]>();
    for (const it of items) {
      const tone = TONE[it.tone];
      const list = by.get(it.date) ?? [];
      list.push({
        id: it.id,
        label: it.label,
        sublabel: it.sublabel,
        colorClass: tone.chip,
        dotClass: tone.dot,
        onSelect: it.onSelect,
      });
      by.set(it.date, list);
    }
    return by;
  }, [items]);

  const inMonth = items.filter(it => it.date.startsWith(month.format('YYYY-MM')));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          이 달 <b className="text-slate-700">{inMonth.length}건</b>
        </span>
        <span className="flex items-center gap-1">
          <span className={`size-1.5 rounded-full ${TONE.done.dot}`} /> 완료
        </span>
        <span className="flex items-center gap-1">
          <span className={`size-1.5 rounded-full ${TONE.progress.dot}`} /> 진행중
        </span>
        <span className="flex items-center gap-1">
          <span className={`size-1.5 rounded-full ${TONE.locked.dot}`} /> 승인 잠김(못 고침)
        </span>
        <span className="ml-auto text-slate-400">건을 누르면 고치는 창이 열립니다</span>
      </p>
      <EventCalendar month={month} onMonthChange={setMonth} eventsForDate={d => index.get(d) ?? []} />
    </div>
  );
}
