import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Check, ChevronLeft, ChevronRight, Droplets } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { PARKING_LOTS } from '../../lib/parkingLayout';
import { withCommas } from '../../lib/money';

/**
 * 외부주차장 세차 대장.
 *
 * 외부 주차장에 세워 둔 차를 한 대당 만 원에 닦아 주신다. 주 두 번 오시기로 했는데
 * 실제로 몇 번 왔는지는 아무도 안 세고 있었다 — 달이 끝나고 청구서를 받으면 그게
 * 맞는지 따질 근거가 없다.
 *
 * 달력에서 온 날을 눌러 찍는다. 대수는 그 주차장에 지금 서 있는 차를 세어 채운다 —
 * 매번 손으로 세게 하면 안 세고, 안 세면 청구서를 그대로 믿게 된다.
 *
 * 주차비와 섞지 않는다. 자리값과 닦는 값은 따로 흥정하는 돈이다.
 */

/** 한 대당 값 — 그 달에 적용한 값은 정산에 같이 남긴다(흥정으로 바뀔 수 있다) */
const DEFAULT_UNIT = 10_000;

/** 주 두 번 오시기로 했다 — 그 달에 몇 번쯤이어야 하는지 셈하는 데 쓴다 */
const PER_WEEK = 2;

interface Visit {
  id: string;
  date: string;
  lot: string;
  carCount: number;
  memo: string;
  recordedBy: string;
}

interface Settlement {
  month: string;
  carCount: number;
  unitPrice: number;
  paid: boolean;
  paidOn: string | null;
  memo: string;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export default function WashTab() {
  const { state } = useStore();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [lot, setLot] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 세차가 도는 곳은 외부 주차장뿐이다 — 본관은 우리가 닦는다 */
  const outsideLots = useMemo(() => PARKING_LOTS.filter(l => l.group === '외부').map(l => l.lot), []);

  useEffect(() => {
    if (!lot && outsideLots.length > 0) setLot(outsideLots[0]);
  }, [lot, outsideLots]);

  const ym = month.format('YYYY-MM');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ visits: Visit[]; settlement: Settlement | null }>(`/wash?month=${ym}`);
      setVisits(res.visits);
      setSettlement(res.settlement);
    } catch (e) {
      setError(e instanceof Error ? e.message : '세차 기록을 불러오지 못했습니다.');
    }
  }, [ym]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 지금 그 주차장에 서 있는 차 — 찍을 때 대수로 채운다 */
  const carsInLot = useMemo(
    () => state.parkingVehicles.filter(v => v.lot === lot && !v.soldDate).length,
    [state.parkingVehicles, lot],
  );

  const visitOf = (date: string) => visits.find(v => v.date === date && v.lot === lot);

  /** 누르면 찍히고 다시 누르면 지워진다 */
  const toggle = async (date: string) => {
    const found = visitOf(date);
    setBusy(true);
    setError(null);
    try {
      if (found) {
        await api(`/wash/visits/${found.id}`, { method: 'DELETE' });
      } else {
        await api('/wash/visits', { method: 'POST', body: { date, lot, carCount: carsInLot } });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const patchSettlement = async (patch: Partial<Settlement>) => {
    setBusy(true);
    setError(null);
    try {
      await api('/wash/settlement', { method: 'POST', body: { month: ym, ...patch } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '정산을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /* 달력 — 그 달 1일이 낀 주부터 마지막 날이 낀 주까지 */
  const gridStart = month.startOf('month').startOf('week');
  const gridEnd = month.endOf('month').endOf('week');
  const days = useMemo(() => {
    const out: dayjs.Dayjs[] = [];
    for (let d = gridStart; !d.isAfter(gridEnd, 'day'); d = d.add(1, 'day')) out.push(d);
    return out;
  }, [gridStart, gridEnd]);

  const lotVisits = visits.filter(v => v.lot === lot);
  /** 그 달에 몇 번쯤 와야 하는지 — 주 두 번 기준 */
  const expected = Math.round((month.daysInMonth() / 7) * PER_WEEK);

  /*
    청구 대수는 방문마다 센 대수 중 제일 큰 값으로 잡는다.

    더하면 안 된다 — 같은 차를 여덟 번 닦았다고 여덟 대가 되지 않는다. 한 달에 한 번
    대당 만 원이니, 그 달에 맡긴 차가 몇 대였는지가 값이다.
  */
  const countedCars = Math.max(0, ...visits.map(v => v.carCount));
  const carCount = settlement?.carCount || countedCars;
  const unitPrice = settlement?.unitPrice || DEFAULT_UNIT;
  const amount = carCount * unitPrice;

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

        <select
          value={lot}
          onChange={e => setLot(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          {outsideLots.map(l => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <span className="text-xs text-slate-500">
          지금 이 주차장에 <b className="text-slate-700">{carsInLot}대</b>
        </span>

        <span className="ml-auto text-xs text-slate-500">
          이번 달 <b className={lotVisits.length >= expected ? 'text-emerald-700' : 'text-amber-700'}>{lotVisits.length}회</b>
          <span className="text-slate-400"> / 예정 {expected}회</span>
        </span>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* 달력 — 온 날을 눌러 찍는다 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAY.map((w, i) => (
            <div key={w} className={`py-1 text-center text-[11px] font-medium ${i === 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(d => {
            const key = d.format('YYYY-MM-DD');
            const inMonth = d.isSame(month, 'month');
            const v = visitOf(key);
            const future = d.isAfter(dayjs(), 'day');
            return (
              <button
                key={key}
                disabled={!inMonth || busy || future}
                onClick={() => void toggle(key)}
                title={v ? `${v.carCount}대 · ${v.recordedBy || ''} — 눌러서 지웁니다` : '눌러서 왔다고 찍습니다'}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                  !inMonth
                    ? 'border-transparent text-slate-200'
                    : v
                      ? 'border-cyan-300 bg-cyan-50 font-bold text-cyan-800 hover:bg-cyan-100'
                      : future
                        ? 'border-slate-100 text-slate-300'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span>{d.date()}</span>
                {v && (
                  <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium">
                    <Droplets size={9} /> {v.carCount}대
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          날짜를 누르면 세차하러 온 날로 찍힙니다. 대수는 그때 이 주차장에 서 있던 차로 채워지고, 다르면 아래에서 고칩니다.
        </p>
      </div>

      {/* 달마다 치르는 값 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Droplets size={15} className="text-cyan-500" />
          <h3 className="text-sm font-bold text-slate-800">{month.format('M월')} 정산</h3>
          <span className="text-[11px] text-slate-400">매달 30일 결제</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">
            청구 대수
            <input
              type="number"
              value={carCount || ''}
              onChange={e => void patchSettlement({ carCount: Number(e.target.value) || 0 })}
              placeholder={String(countedCars)}
              className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <span className="pb-2 text-slate-400">×</span>
          <label className="text-xs text-slate-500">
            한 대당
            <input
              type="number"
              value={unitPrice}
              onChange={e => void patchSettlement({ unitPrice: Number(e.target.value) || 0 })}
              className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <span className="pb-2 text-slate-400">=</span>
          <div className="pb-1">
            <p className="text-xs text-slate-400">청구액</p>
            <p className="text-xl font-bold text-cyan-700">{withCommas(String(amount))}원</p>
          </div>

          <button
            onClick={() => void patchSettlement({ paid: !settlement?.paid })}
            disabled={busy}
            className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
              settlement?.paid
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Check size={14} /> {settlement?.paid ? `결제 완료 ${settlement.paidOn ?? ''}` : '결제 완료로 표시'}
          </button>
        </div>

        {/*
          센 대수와 적은 대수가 다르면 알린다. 청구서와 우리 장부가 갈릴 때 어느 쪽이
          맞는지는 사람이 봐야 알지만, 갈렸다는 사실은 화면이 알려줘야 한다.
        */}
        {!!settlement?.carCount && countedCars > 0 && settlement.carCount !== countedCars && (
          <p className="mt-2 text-[11px] text-amber-700">
            찍힌 기록으로는 {countedCars}대인데 {settlement.carCount}대로 적혀 있습니다. 청구서를 한 번 보세요.
          </p>
        )}
      </div>
    </div>
  );
}
