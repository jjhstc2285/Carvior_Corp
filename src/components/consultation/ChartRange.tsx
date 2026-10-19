import dayjs from 'dayjs';
import { CalendarRange } from 'lucide-react';

/**
 * 두 그래프가 같이 쓰는 기간.
 *
 * '2026년 9월부터'로 박아 두었다. 분류를 넷으로 나눈 달이 그때라 그 앞은 뜻이 없어서인데,
 * 보는 쪽은 "이번 달만", "지난달이랑 견줘서"를 묻는다 — 박아 두면 그걸 못 한다.
 *
 * 두 그래프가 따로 기간을 들면 안 된다. 나간 쪽과 들어온 쪽을 나란히 놓은 까닭이 서로
 * 견주려는 것인데, 기간이 다르면 견줄 수가 없다 — 그래서 바깥에서 하나로 들고 내려준다.
 */

/**
 * 분류를 넷으로 나눈 달.
 *
 * 그 전 상담은 전부 알선 하나로 쌓여 있어서 같이 그리면 '알선만 있던 회사'처럼 보인다.
 * 처음 열 때는 여기서 시작한다.
 */
export const CHART_START = '2026-09-01';

export interface Range {
  from: string;
  to: string;
}

export const defaultRange = (): Range => ({ from: CHART_START, to: dayjs().format('YYYY-MM-DD') });

/** 빠른 단추 — 손으로 날짜를 두 번 고르는 일이 제일 잦은 쪽부터 */
function presets(): { label: string; range: Range }[] {
  const today = dayjs();
  const lastMonth = today.subtract(1, 'month');
  return [
    { label: '이번 달', range: { from: today.startOf('month').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') } },
    {
      label: '지난달',
      range: {
        from: lastMonth.startOf('month').format('YYYY-MM-DD'),
        to: lastMonth.endOf('month').format('YYYY-MM-DD'),
      },
    },
    { label: '최근 3개월', range: { from: today.subtract(2, 'month').startOf('month').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') } },
    { label: '전체', range: defaultRange() },
  ];
}

const INPUT =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400';

export default function ChartRange({ value, onChange }: { value: Range; onChange: (next: Range) => void }) {
  const same = (r: Range) => r.from === value.from && r.to === value.to;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
      <CalendarRange size={15} className="text-slate-400" />
      <span className="text-xs font-bold text-slate-600">보는 기간</span>

      <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} className={INPUT} />
      <span className="text-xs text-slate-400">~</span>
      <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} className={INPUT} />

      <div className="flex flex-wrap items-center gap-1">
        {presets().map(p => (
          <button
            key={p.label}
            onClick={() => onChange(p.range)}
            className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              same(p.range) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/*
        언제부터 있는 값인지 적어 둔다.

        그 앞으로 끌어 봐야 알선만 나온다 — 숫자가 이상한 게 아니라 그렇게 쌓여 있는
        것이라고 알려 주지 않으면 "9월 전에는 왜 다 알선이냐"가 된다.
      */}
      {value.from < CHART_START && (
        <span className="text-[11px] text-amber-600">
          {dayjs(CHART_START).format('YYYY년 M월')} 전 상담은 종류를 안 나눠 적어서 전부 알선으로 잡힙니다
        </span>
      )}
    </div>
  );
}
