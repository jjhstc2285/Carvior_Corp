import { useMemo } from 'react';
import { CONSULTATION_KIND_COLOR, CONSULTATION_KIND_LABEL, type ConsultationKind } from '../../types';
import { useStore } from '../../store';

/**
 * 판매완료 비율.
 *
 * 넷 중 어디서 팔리고 있는지를 본다 — 우리 물건을 우리가 파는 것(판매)과 남이 파는 것
 * (기타), 남의 물건을 우리가 파는 것(알선), 수출이 각각 얼마인지.
 *
 * 건수만 센다. 금액은 정산에서 보고, 여기서는 '어느 쪽으로 몇 대가 나갔나'를 본다 —
 * 두 가지를 한 그래프에 섞으면 둘 다 안 읽힌다.
 */

const ORDER: ConsultationKind[] = ['SALE', 'BROKERAGE', 'EXPORT', 'OTHER'];

export default function SoldMixChart() {
  const { state } = useStore();

  const { rows, total } = useMemo(() => {
    const sold = state.consultations.filter(c => c.status === 'SOLD');
    const counts = ORDER.map(kind => ({ kind, count: sold.filter(c => c.kind === kind).length }));
    return { rows: counts, total: sold.length };
  }, [state.consultations]);

  if (total === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-800">판매완료 비율</h2>
        <span className="text-xs text-slate-400">총 {total}건</span>
      </div>

      {/* 한 줄로 이어 붙인다 — 넷을 나란히 두면 어느 쪽이 큰지 한눈에 안 들어온다 */}
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {rows.map(({ kind, count }) =>
          count > 0 ? (
            <div
              key={kind}
              className={CONSULTATION_KIND_COLOR[kind].bar}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${CONSULTATION_KIND_LABEL[kind]} ${count}건`}
            />
          ) : null,
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map(({ kind, count }) => (
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
