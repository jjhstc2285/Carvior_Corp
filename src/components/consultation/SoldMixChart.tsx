import { useMemo } from 'react';
import dayjs from 'dayjs';
import { CONSULTATION_KIND_COLOR, CONSULTATION_KIND_LABEL, type ConsultationKind } from '../../types';
import { useStore } from '../../store';

/**
 * 판매완료 — 달마다 어디서 팔렸나.
 *
 * 넷 중 어느 쪽으로 나갔는지를 달별로 쌓아 본다. 한 덩어리 비율로만 보면 '이번 달에
 * 흐름이 바뀌었는지'를 못 본다 — 지난달까지 판매가 늘고 있었는지, 알선으로 돌아섰는지가
 * 다음 달에 무엇을 할지를 가른다.
 *
 * 건수만 센다. 금액은 정산에서 본다 — 두 가지를 한 그래프에 섞으면 둘 다 안 읽힌다.
 * 날짜는 상담일 기준이다(판 날을 따로 적는 칸이 없다).
 */

const ORDER: ConsultationKind[] = ['SALE', 'BROKERAGE', 'EXPORT', 'OTHER'];

/**
 * 어느 달부터 세는가.
 *
 * 분류를 넷으로 나눈 게 2026년 9월이다. 그 전 상담은 전부 알선 하나로 쌓여 있어서
 * 같이 그리면 '알선만 있던 회사'처럼 보인다 — 나눠 적기 시작한 달부터 센다.
 */
const START_MONTH = '2026-09';

/** 그보다 길어지면 막대가 얇아져 못 읽는다 — 열두 달까지만 */
const MAX_MONTHS = 12;

export default function SoldMixChart() {
  const { state } = useStore();

  const { months, total, byKind, max } = useMemo(() => {
    // 나눠 적기 전 것은 세지 않는다 — 전부 알선으로 쌓여 있어 뜻이 없다
    const sold = state.consultations.filter(c => c.status === 'SOLD' && (c.date ?? '') >= `${START_MONTH}-01`);

    // 시작 달부터 이번 달까지
    const start = dayjs(`${START_MONTH}-01`);
    const span = Math.min(Math.max(dayjs().diff(start, 'month') + 1, 1), MAX_MONTHS);
    const first = dayjs().subtract(span - 1, 'month');
    const keys = Array.from({ length: span }, (_, i) => first.add(i, 'month').format('YYYY-MM'));

    const rows = keys.map(key => {
      const inMonth = sold.filter(c => (c.date ?? '').startsWith(key));
      const counts = ORDER.map(kind => ({ kind, count: inMonth.filter(c => c.kind === kind).length }));
      return { key, label: dayjs(`${key}-01`).format('M월'), counts, total: inMonth.length };
    });

    return {
      months: rows,
      total: sold.length,
      byKind: ORDER.map(kind => ({ kind, count: sold.filter(c => c.kind === kind).length })),
      max: Math.max(1, ...rows.map(r => r.total)),
    };
  }, [state.consultations]);

  if (total === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-800">판매완료 — 달마다 어디서 팔렸나</h2>
        <span className="text-xs text-slate-400">{dayjs(`${START_MONTH}-01`).format('YYYY년 M월')}부터 · 상담일 기준</span>
        <span className="ml-auto text-xs text-slate-500">
          전체 <b className="text-slate-800">{total}</b>건
        </span>
      </div>

      {/* 달마다 한 막대, 위로 쌓아 넷을 갈라 본다 */}
      <div className="flex h-36 items-end gap-2 sm:gap-4">
        {months.map(m => (
          <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
            <span className={`text-[11px] font-bold ${m.total > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
              {m.total || ''}
            </span>
            <div
              className="flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-md bg-slate-100"
              style={{ height: `${Math.max(4, (m.total / max) * 100)}%` }}
              title={m.counts
                .filter(c => c.count > 0)
                .map(c => `${CONSULTATION_KIND_LABEL[c.kind]} ${c.count}`)
                .join(' · ')}
            >
              {m.counts.map(({ kind, count }) =>
                count > 0 ? (
                  <div
                    key={kind}
                    className={CONSULTATION_KIND_COLOR[kind].bar}
                    style={{ height: `${(count / m.total) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <span className="text-[11px] text-slate-400">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
        {byKind.map(({ kind, count }) => (
          <span key={kind} className="flex items-baseline gap-1.5 text-xs">
            <i className={`inline-block size-2.5 rounded-sm ${CONSULTATION_KIND_COLOR[kind].bar}`} />
            <span className="text-slate-500">{CONSULTATION_KIND_LABEL[kind]}</span>
            <b className="text-slate-800">{count}</b>
            <span className="text-slate-400">({Math.round((count / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </section>
  );
}
