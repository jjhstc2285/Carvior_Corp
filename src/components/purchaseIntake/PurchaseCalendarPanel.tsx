import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarDays, ChevronDown } from 'lucide-react';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';
import { api as callApi } from '../../lib/api';
import { BROKER_FEE_TYPE_LABEL, type PurchaseIntake } from '../../types';

/**
 * 어느 날 돈이 얼마나 나가나 — 매입을 날짜로 펼쳐 본다.
 *
 * 목록으로는 "이 달에 다 해서 얼마"까지만 보인다. 그런데 돈은 한 날에 몰려 나간다 —
 * 하루에 넉 대를 잡으면 그날 억이 넘어가는데, 그걸 미리 보려면 줄을 눈으로 세어 가며
 * 더해야 했다.
 *
 * 날짜는 매입일로 센다. 제시일자는 조합 전산에 올린 날이라 돈이 나간 날이 아니다 —
 * 목록의 달 가르는 기준(제시일자)과 다르지만, 여기서 보는 건 돈이다.
 *
 * 금액은 실매입금액에 구전을 더한 값이다. 구전도 그날 나가는 돈이라 따로 세면
 * 실제로 준비해야 할 돈보다 적게 잡힌다.
 */

/** 원 → "1,250만" — 칸이 좁아 만원으로 줄여 적는다 */
function manwon(won: number): string {
  if (!won) return '';
  const man = Math.round(won / 10000);
  return man >= 10000 ? `${(man / 10000).toFixed(1)}억` : `${man.toLocaleString()}만`;
}

interface Day {
  total: number;
  purchase: number;
  broker: number;
  rows: PurchaseIntake[];
}

export default function PurchaseCalendarPanel() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [rows, setRows] = useState<PurchaseIntake[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PurchaseIntake | null>(null);

  /*
    펼칠 때 한 번만 받아 온다.

    달을 넘길 때마다 다시 받지 않는다 — 매입 기록이 사백 줄 남짓이라 통째로 들고 있어도
    가볍고, 무엇보다 목록 쪽은 제시일자로 달을 가르기 때문에 그 달 것만 받아오면
    '제시는 7월인데 돈은 8월에 나간' 건이 통째로 빠진다.
  */
  useEffect(() => {
    if (!open || rows.length > 0) return;
    setLoading(true);
    void callApi<PurchaseIntake[]>('/purchase-intake')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, rows.length]);

  const byDate = useMemo(() => {
    const index = new Map<string, Day>();
    for (const r of rows) {
      const key = (r.date ?? '').slice(0, 10);
      if (!key) continue;
      const day = index.get(key) ?? { total: 0, purchase: 0, broker: 0, rows: [] };
      day.purchase += r.purchaseAmount;
      day.broker += r.brokerFee;
      day.total += r.purchaseAmount + r.brokerFee;
      day.rows.push(r);
      index.set(key, day);
    }
    return index;
  }, [rows]);

  /** 이 달 합계 — 달력 위에 적는다 */
  const monthly = useMemo(() => {
    const key = month.format('YYYY-MM');
    let total = 0;
    let purchase = 0;
    let broker = 0;
    let count = 0;
    for (const [date, day] of byDate) {
      if (!date.startsWith(key)) continue;
      total += day.total;
      purchase += day.purchase;
      broker += day.broker;
      count += day.rows.length;
    }
    /** 돈이 나간 날이 며칠인가 — 스무 날에 나눠 나가는 것과 닷새에 몰리는 건 다르다 */
    const days = [...byDate.keys()].filter(d => d.startsWith(key) && (byDate.get(d)?.total ?? 0) > 0).length;
    return { total, purchase, broker, count, days };
  }, [byDate, month]);

  const eventsForDate = (dateStr: string): CalEvent[] => {
    const day = byDate.get(dateStr);
    if (!day) return [];
    // 비싼 차부터 — 칸에 셋만 보이므로 큰 돈이 먼저 보여야 한다
    return [...day.rows]
      .sort((a, b) => b.purchaseAmount + b.brokerFee - (a.purchaseAmount + a.brokerFee))
      .map(r => ({
        id: r.id,
        label: `${r.vehicleName || r.vehicleNumber} ${manwon(r.purchaseAmount + r.brokerFee)}`,
        sublabel: `${r.vehicleNumber} · ${(r.purchaseAmount + r.brokerFee).toLocaleString()}원`,
        colorClass: 'bg-red-50 text-red-700',
        dotClass: 'bg-red-400',
        onSelect: () => setDetail(r),
      }));
  };

  const summaryForDate = (dateStr: string) => {
    const total = byDate.get(dateStr)?.total ?? 0;
    if (total <= 0) return null;
    /* 나가는 돈이라 빨갛게 — 달력에서 제일 먼저 보여야 하는 숫자다 */
    return <span className="text-[10px] font-bold text-red-600">{manwon(total)}</span>;
  };

  return (
    <section className="mb-3 rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-left"
      >
        <CalendarDays size={16} className="text-indigo-500" />
        <p className="text-sm font-bold text-slate-800">날짜별 매입 대금</p>
        <span className="text-[11px] text-slate-400">어느 날 얼마가 나가는지 달력으로 봅니다</span>
        <ChevronDown size={15} className={`ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-bold text-slate-600">{month.format('M월')} 나가는 돈</p>
                <p className="text-lg font-bold text-red-600">
                  {monthly.total.toLocaleString()}
                  <span className="ml-1 text-xs font-medium text-slate-400">원</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {monthly.count}대 · {monthly.days}일에 나눠 나갑니다
                </p>
                {/*
                  차값과 구전을 갈라 적는다.

                  구전은 차값이 아니라 사람에게 주는 돈이고 지급 방식에 따라 원천징수가
                  붙는다 — 한 덩어리로 두면 얼마를 누구에게 줬는지 세어볼 자리가 없다.
                */}
                <p className="ml-auto text-[11px] text-slate-500">
                  차값 <b className="font-bold text-red-600">{monthly.purchase.toLocaleString()}</b>
                  {monthly.broker > 0 && (
                    <>
                      {' · 구전 '}
                      <b className="font-bold text-red-600">{monthly.broker.toLocaleString()}</b>
                    </>
                  )}
                </p>
              </div>

              <p className="mb-2 text-[11px] text-slate-400">
                매입일 기준입니다(제시일자가 아닙니다) · 금액은 실매입금액 + 구전 · 날짜를 누르면 그날 차가 펼쳐집니다
              </p>

              <EventCalendar
                month={month}
                onMonthChange={setMonth}
                eventsForDate={eventsForDate}
                summaryForDate={summaryForDate}
              />
            </>
          )}
        </div>
      )}

      {/* 칩을 누르면 그 차 한 대만 — 목록을 뒤지지 않고 바로 본다 */}
      {detail && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800">{detail.vehicleName || '차명 없음'}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {detail.vehicleNumber} · 매입일 {detail.date}
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">실매입금액</dt>
                <dd className="font-medium text-slate-800">{detail.purchaseAmount.toLocaleString()}원</dd>
              </div>
              {detail.brokerFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">구전 · {BROKER_FEE_TYPE_LABEL[detail.brokerFeeType]}</dt>
                  <dd className="font-medium text-slate-800">{detail.brokerFee.toLocaleString()}원</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-1.5">
                <dt className="font-bold text-slate-600">합계</dt>
                <dd className="font-bold text-red-600">
                  {(detail.purchaseAmount + detail.brokerFee).toLocaleString()}원
                </dd>
              </div>
              {detail.source && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">매입처</dt>
                  <dd className="text-slate-700">{detail.source}</dd>
                </div>
              )}
            </dl>
            <button
              onClick={() => setDetail(null)}
              className="mt-4 w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
