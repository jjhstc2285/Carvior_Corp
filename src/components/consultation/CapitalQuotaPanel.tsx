import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { api } from '../../lib/api';
import { capitalQuotas, QUOTA_MONTHS, QUOTA_RATE, type CapitalQuota } from '../../lib/capitalQuota';

/**
 * 재고금융 할부 의무.
 *
 * 캐피탈사가 재고금융을 내주는 대신 그 회사 할부를 얼마 이상 깔아 달라고 한다.
 * 파는 사람이 손님 앞에서 어느 할부를 밀지 정해야 하므로 상담 화면 맨 위에 둔다 —
 * 재고금융 화면까지 들어가서 확인할 겨를이 없다.
 *
 * 어느 캐피탈로 팔았는지는 알선·수출 상담 내용에 적는다. 전산에 칸을 따로 두지 않는다 —
 * 아무도 안 채우는 빈 칸이 되기 쉽고, 지금은 적을 실적도 없다.
 * 여기서는 이번 달에 얼마를 깔아야 하는지만 보여준다.
 */

interface Usage {
  from: string;
  to: string;
  months: number;
  usage: { capital: string; used: number; count: number }[];
}

/** 1억 2,300만원 — 원 단위로 다 적으면 자릿수를 세게 된다 */
function moneyLabel(won: number): string {
  if (won === 0) return '0';
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  return `${man.toLocaleString()}만`;
}

export default function CapitalQuotaPanel() {
  const [data, setData] = useState<Usage | null>(null);

  useEffect(() => {
    // 못 불러와도 상담 화면은 그대로 써야 한다 — 조용히 넘긴다.
    void api<Usage>(`/vehicles/capital-usage?months=${QUOTA_MONTHS}`)
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;
  const rows: CapitalQuota[] = capitalQuotas(data.usage);
  const active = rows.filter(r => r.quota > 0);
  if (active.length === 0) return null;

  const total = active.reduce((sum, r) => sum + r.quota, 0);

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <Landmark size={15} className="self-center text-slate-500" />
        <h2 className="text-sm font-bold text-slate-800">재고금융 할부 의무</h2>
        <span className="text-[11px] text-slate-400">
          {data.from.slice(0, 7).replace('-', '.')} 제시 기준 · BMW·우리캐피탈은 고정, 나머지는 그 달 재고 총액의{' '}
          {Math.round(QUOTA_RATE * 100)}% · 어느 캐피탈로 팔았는지는 상담 내용에 적어 주세요
        </span>
        <span className="ml-auto text-sm font-bold text-slate-800">
          합계 {moneyLabel(total)}
          <span className="ml-0.5 text-xs font-normal text-slate-400">원 깔아야 함</span>
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {active.map(r => (
          <div key={r.capital} className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1">
              <p className="truncate text-xs font-semibold text-slate-600">{r.capital}</p>
              {r.fixed && (
                <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-600">고정</span>
              )}
            </div>
            <p className="mt-0.5 text-base font-bold text-indigo-700">
              {moneyLabel(r.quota)}
              <span className="ml-0.5 text-[11px] font-normal text-slate-400">원</span>
            </p>
            <p className="text-[11px] text-slate-400">
              {r.used > 0 ? `${r.count}대 · ${moneyLabel(r.used)}원 씀` : '이번 달 안 씀'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
