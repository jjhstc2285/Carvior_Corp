import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { withCommas } from '../../lib/money';
import ReferralTitleBadge from '../ReferralTitleBadge';

/**
 * 알선 딜러 인센티브.
 *
 * 기본급을 깔고, 월 알선 총액이 기본급을 넘은 만큼에 구간 요율을 곱해 인센티브를 낸다.
 * 요율은 초과분이 아니라 월 알선 총액이 어느 구간인지로 고른다 — 800만을 한 사람과
 * 1,000만을 한 사람은 같은 초과분에도 다른 요율을 받는다.
 *
 * 셈은 서버에서만 한다. 화면에서도 같은 식을 쓰면 요율표를 고쳤을 때 둘이 어긋나고,
 * 어긋난 쪽이 급여라 사람이 먼저 안다. 그래서 고칠 때마다 서버가 다시 낸 값을 받아온다.
 */

interface Row {
  employeeId: string;
  name: string;
  position: string;
  title: string;
  sales: number;
  /** 알선 정산에서 더한 값 — 손으로 고쳤을 때 원래 값이 무엇이었는지 */
  autoSales: number;
  edited: boolean;
  years: number;
  baseSalaryOverride: number;
  targetAchieved: boolean;
  memo: string;
  baseSalary: number;
  excess: number;
  tier: string;
  rate: number;
  incentive: number;
  overriding: number;
  overridingRate: number;
  overridingBlocked: boolean;
  payout: number;
  /** 회사에 남는 돈 — 관리자만 받는다. 아니면 아예 안 담겨 온다 */
  companyProfit?: number;
}

interface Sheet {
  month: string;
  teamSales: number;
  /** 회사에 남는 돈을 받아 왔는가 — 관리자가 아니면 false 이고 값도 안 온다 */
  withProfit: boolean;
  rows: Row[];
  totals: { sales: number; payout: number; companyProfit?: number };
  rules: {
    effectiveFrom: string;
    baseSalaryDefault: number;
    tiers: { tier: string; from: number; rate: number }[];
    tenure: number[];
    leader: { baseSalary: number; defaultRate: number; targetRate: number; minPersonalSales: number };
  };
}

const MAN = (won: number) => `${Math.round(won / 10_000).toLocaleString()}만`;

/**
 * 그 구간이 어디부터 어디까지인가.
 *
 * 안내표에 적힌 달성액에 닿으면 그 요율이 되고, 다음 달성액 전까지 그대로다 —
 * 800만을 하면 45%이고 944만을 해도 45%다. 1,000만에 닿아야 50%가 된다.
 */
function tierRange(tiers: { tier: string; from: number }[], tier: string): string {
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  const i = sorted.findIndex(t => t.tier === tier);
  if (i < 0) return '';
  const next = sorted[i + 1];
  return next ? `${MAN(sorted[i].from)}~${MAN(next.from)}` : `${MAN(sorted[i].from)}~`;
}

export default function DealerIncentiveTab() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const ym = month.format('YYYY-MM');

  const load = useCallback(async () => {
    setError(null);
    try {
      setSheet(await api<Sheet>(`/referral/incentive?month=${ym}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '정산을 불러오지 못했습니다.');
      setSheet(null);
    }
  }, [ym]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 한 칸 고치면 서버가 그 달 전체를 다시 내준다 — 팀장 수당이 팀원 매출을 따라 움직인다 */
  const save = async (employeeId: string, patch: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setSheet(await api<Sheet>('/referral/incentive', { method: 'POST', body: { month: ym, employeeId, ...patch } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const rows = sheet?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
          <button onClick={() => setMonth(m => m.subtract(1, 'month'))} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-24 text-center text-sm font-bold text-slate-700">{month.format('YYYY년 M월')}</span>
          <button onClick={() => setMonth(m => m.add(1, 'month'))} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setShowRules(v => !v)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          요율표 {showRules ? '접기' : '보기'}
        </button>
        {sheet && (
          <span className="ml-auto text-xs text-slate-400">
            {sheet.rules.effectiveFrom}부터 적용 · 알선팀 {rows.length}명
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {/* 요율표 — 무엇을 보고 낸 값인지 같은 화면에서 확인한다 */}
      {showRules && sheet && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
          <p className="font-bold text-slate-700">달성 구간 (월 알선 총액 기준)</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[...sheet.rules.tiers].reverse().map(t => (
              <li key={t.tier} className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600 ring-1 ring-inset ring-slate-200">
                {t.tier} · {tierRange(sheet.rules.tiers, t.tier)} ·{' '}
                <b className="text-slate-800">{Math.round(t.rate * 100)}%</b>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-bold text-slate-700">근속 기본급</p>
          <p className="mt-1 text-slate-500">
            {sheet.rules.tenure.map((v, i) => `${i}년 ${MAN(v)}`).join(' · ')} (5년부터는 그대로)
          </p>
          <p className="mt-3 font-bold text-slate-700">팀장</p>
          <p className="mt-1 leading-relaxed text-slate-500">
            기본급 {MAN(sheet.rules.leader.baseSalary)} · 팀원 알선 합계의{' '}
            {Math.round(sheet.rules.leader.defaultRate * 100)}%(목표 달성 시{' '}
            {Math.round(sheet.rules.leader.targetRate * 100)}%)를 관리 수당으로 받습니다. 팀원 수수료는 안 깎이고 회사
            마진에서 나갑니다. 팀장 본인이 {MAN(sheet.rules.leader.minPersonalSales)} 미만이면 그 달은 못 받습니다.
          </p>
        </div>
      )}

      {/* 그 달 합계 */}
      {sheet && (
        <div className={`grid grid-cols-2 gap-2 ${sheet.withProfit ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-xs font-medium text-slate-400">월 알선 총액</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{withCommas(String(sheet.totals.sales))}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-3.5 py-2.5">
            <p className="text-xs font-medium text-indigo-700/80">딜러 실수령 합계</p>
            <p className="mt-1 text-xl font-bold text-indigo-700">{withCommas(String(sheet.totals.payout))}</p>
          </div>
          {/* 회사에 얼마가 남는지는 경영 숫자다 — 관리자에게만 온다 */}
          {sheet.withProfit && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 px-3.5 py-2.5">
              <p className="text-xs font-medium text-emerald-700/80">회사 순수익</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {withCommas(String(sheet.totals.companyProfit ?? 0))}
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-xs font-medium text-slate-400">팀원 알선 합계</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{withCommas(String(sheet.teamSales))}</p>
            <p className="text-[10px] text-slate-400">팀장 관리 수당의 바탕</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">딜러</th>
              <th className="px-3 py-2.5 text-right font-medium">월 알선 총액</th>
              <th className="px-3 py-2.5 text-center font-medium">근속</th>
              <th className="px-3 py-2.5 text-right font-medium">기본급</th>
              <th className="px-3 py-2.5 text-center font-medium">구간</th>
              <th className="px-3 py-2.5 text-right font-medium">인센티브</th>
              <th className="px-3 py-2.5 text-right font-medium">관리 수당</th>
              <th className="px-3 py-2.5 text-right font-medium">실수령액</th>
              {sheet?.withProfit && <th className="px-3 py-2.5 text-right font-medium">회사 순수익</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={sheet?.withProfit ? 9 : 8} className="px-3 py-12 text-center text-sm text-slate-400">
                  알선팀이 없습니다. 직원 설정에서 <b>알선 타이틀</b>을 달아 주세요.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.employeeId} className={r.title === 'LEADER' ? 'bg-indigo-50/30' : ''}>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <ReferralTitleBadge title={r.title} />
                    <span className="font-semibold text-slate-800">{r.name}</span>
                    <span className="text-[11px] text-slate-400">{r.position}</span>
                  </span>
                </td>

                {/* 알선 정산에서 더해 채우고, 안 올라온 건이 있어 손으로 고친다 */}
                <td className="px-3 py-2 text-right">
                  <input
                    key={`sales-${ym}-${r.employeeId}-${r.sales}`}
                    type="number"
                    min={0}
                    defaultValue={r.sales || ''}
                    onBlur={e => {
                      const next = Number(e.target.value) || 0;
                      if (next !== r.sales) void save(r.employeeId, { sales: next });
                    }}
                    disabled={busy}
                    placeholder={String(r.autoSales)}
                    className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
                  />
                  {r.edited && r.autoSales !== r.sales && (
                    <p className="text-[10px] text-slate-400" title="알선 정산에서 더한 값입니다">
                      정산 합계 {withCommas(String(r.autoSales))}
                    </p>
                  )}
                </td>

                <td className="px-3 py-2 text-center">
                  <input
                    key={`years-${ym}-${r.employeeId}-${r.years}`}
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={r.years}
                    onBlur={e => {
                      const next = Number(e.target.value) || 0;
                      if (next !== r.years) void save(r.employeeId, { years: next });
                    }}
                    disabled={busy}
                    className="w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-center text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
                  />
                  <span className="ml-0.5 text-[11px] text-slate-400">년</span>
                </td>

                {/* 따로 정한 기본급이 있으면 그 값. 비우면 근속표대로 */}
                <td className="px-3 py-2 text-right">
                  <input
                    key={`base-${ym}-${r.employeeId}-${r.baseSalaryOverride}`}
                    type="number"
                    min={0}
                    defaultValue={r.baseSalaryOverride || ''}
                    onBlur={e => {
                      const next = Number(e.target.value) || 0;
                      if (next !== r.baseSalaryOverride) void save(r.employeeId, { baseSalary: next });
                    }}
                    disabled={busy}
                    placeholder={String(r.baseSalary)}
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
                  />
                  <p className="text-[10px] text-slate-400">
                    {r.baseSalaryOverride > 0 ? '직접 적음' : r.title === 'LEADER' ? '팀장 기본급' : `근속 ${r.years}년`}
                  </p>
                </td>

                <td className="whitespace-nowrap px-3 py-2 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      r.rate > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {r.tier}
                  </span>
                  <p className="text-[10px] text-slate-400">
                    {Math.round(r.rate * 100)}%
                    {sheet && <span className="ml-1 text-slate-300">{tierRange(sheet.rules.tiers, r.tier)}</span>}
                  </p>
                </td>

                {/* 셈을 그대로 적는다 — 금액만 있으면 왜 저 값인지 물어볼 데가 없다 */}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span className="font-semibold text-slate-800">{withCommas(String(r.incentive))}</span>
                  <p className="text-[10px] text-slate-400">
                    ({withCommas(String(r.sales))} − {withCommas(String(r.baseSalary))})
                  </p>
                  <p className="text-[10px] text-slate-400">
                    = {withCommas(String(r.excess))} × {Math.round(r.rate * 100)}%
                  </p>
                </td>

                {/* 팀장만 받는다 — 본인 실적이 모자란 달은 못 받는다 */}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {r.title === 'LEADER' ? (
                    <>
                      <span className="font-semibold text-slate-800">{withCommas(String(r.overriding))}</span>
                      <p className="text-[10px] text-slate-400">
                        {r.overridingBlocked ? '본인 실적 미달' : `팀원 합계의 ${Math.round(r.overridingRate * 100)}%`}
                      </p>
                      <label className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={r.targetAchieved}
                          onChange={e => void save(r.employeeId, { targetAchieved: e.target.checked })}
                          disabled={busy}
                        />
                        목표 달성
                      </label>
                    </>
                  ) : (
                    <span className="text-slate-300">–</span>
                  )}
                </td>

                <td className="whitespace-nowrap px-3 py-2 text-right text-base font-bold text-indigo-700">
                  {withCommas(String(r.payout))}
                </td>
                {sheet?.withProfit && (
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${
                      (r.companyProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {withCommas(String(r.companyProfit ?? 0))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
        <Trophy size={13} className="mt-0.5 shrink-0 text-amber-400" />
        <span>
          월 알선 총액은 그 달 <b>알선 정산의 수익금</b>(현금 수수료 + 할부 피 + 보험 피 + 차대금업)을 더해
          채웁니다. <b>수출은 안 더합니다</b> — 정산에 안 올라온 건이 있으면 칸에 직접
          적으세요(적으면 그 값이 이깁니다). 요율은 <b>월 알선 총액</b>이 어느 구간인지로 고르고, 그 요율을 기본급을 넘은 만큼에 먹입니다.
          <br />
          인센티브·실수령액은 저장하지 않고 볼 때마다 다시 냅니다 — 저장해 두면 요율표를 고쳤을 때 지난 달 숫자와
          어긋납니다.
        </span>
      </p>
    </div>
  );
}
