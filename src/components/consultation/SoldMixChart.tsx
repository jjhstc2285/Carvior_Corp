import { useMemo } from 'react';
import dayjs from 'dayjs';
import { CONSULTATION_KIND_COLOR, CONSULTATION_KIND_LABEL, type ConsultationKind } from '../../types';
import { useStore } from '../../store';
import { effectiveKind } from '../../lib/consultationStats';
import type { Range } from './ChartRange';

/**
 * 판매완료 — 어디서 팔렸나.
 *
 * 넷 중 어느 쪽으로 나갔는지 비율을 본다. 건수만 센다 — 금액은 정산에서 보고,
 * 두 가지를 한 그래프에 섞으면 둘 다 안 읽힌다.
 */

const ORDER: ConsultationKind[] = ['SALE', 'PARTNER', 'BROKERAGE', 'EXPORT', 'OTHER'];

/* 보는 기간은 바깥에서 내려준다 — 옆 그래프와 같은 자를 써야 견줄 수 있다 */

/* 도넛 — 반지름과 둘레. 둘레를 알아야 몫만큼 선을 끊어 그릴 수 있다 */
const R = 52;
const C = 2 * Math.PI * R;

export default function SoldMixChart({ range }: { range: Range }) {
  const { state } = useStore();

  const { rows, total } = useMemo(() => {
    const sold = state.consultations.filter(
      c => c.status === 'SOLD' && (c.date ?? '') >= range.from && (c.date ?? '') <= range.to,
    );
    /*
      탭과 같은 규칙으로 센다.

      저장된 분류로 세면 '알선으로 골라놓고 내용에 수출이라 적은' 건이 수출 탭에는
      뜨는데 그래프에서는 판매로 잡힌다 — 같은 화면에서 숫자가 어긋나면 둘 다 안 믿는다.
      규칙은 lib/consultationStats 한 곳에 있다.
    */
    return {
      rows: ORDER.map(kind => ({ kind, count: sold.filter(c => effectiveKind(c) === kind).length })),
      total: sold.length,
    };
  }, [state.consultations, range.from, range.to]);

  if (total === 0) return null;

  /*
    조각을 이어 붙인다.

    각 조각은 '칠할 길이 + 나머지 빈 길이'로 그리고, 앞 조각들이 차지한 만큼 뒤로 민다.
    시작을 12시로 돌려 놓아야 사람이 읽는 방향과 맞는다.
  */
  let drawn = 0;
  const arcs = rows
    .filter(r => r.count > 0)
    .map(({ kind, count }) => {
      const len = (count / total) * C;
      const arc = { kind, count, len, offset: -drawn };
      drawn += len;
      return arc;
    });

  const top = [...rows].sort((a, b) => b.count - a.count)[0];

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-800">판매완료 — 어디서 팔렸나</h2>
        <span className="text-xs text-slate-400">
          {dayjs(range.from).format('YY.MM.DD')} ~ {dayjs(range.to).format('YY.MM.DD')} · 상담일 기준
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="relative shrink-0">
          <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
            <circle cx="66" cy="66" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
            {arcs.map(({ kind, count, len, offset }) => (
              <circle
                key={kind}
                cx="66"
                cy="66"
                r={R}
                fill="none"
                stroke={CONSULTATION_KIND_COLOR[kind].hex}
                strokeWidth="18"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={offset}
              >
                <title>{`${CONSULTATION_KIND_LABEL[kind]} ${count}건 (${Math.round((count / total) * 100)}%)`}</title>
              </circle>
            ))}
          </svg>
          {/* 가운데는 전체 건수 — 비율만 보면 모수가 몇인지 몰라 크기를 못 가늠한다 */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-slate-800">{total}</span>
            <span className="text-[11px] text-slate-400">건</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {rows.map(({ kind, count }) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={kind} className="flex items-center gap-2">
                <i className={`size-2.5 shrink-0 rounded-sm ${CONSULTATION_KIND_COLOR[kind].bar}`} />
                <span className="w-10 shrink-0 text-xs text-slate-600">{CONSULTATION_KIND_LABEL[kind]}</span>
                {/* 도넛만으로는 작은 조각끼리 견주기 어렵다 — 막대를 같이 둔다 */}
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${CONSULTATION_KIND_COLOR[kind].bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs">
                  <b className="text-slate-800">{count}</b>
                  <span className="ml-1 text-slate-400">{pct}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {top && top.count > 0 && (
        <p className="mt-auto border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          {CONSULTATION_KIND_LABEL[top.kind]}가 {Math.round((top.count / total) * 100)}%로 가장 많습니다.
        </p>
      )}
    </section>
  );
}
