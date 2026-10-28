import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Check, ChevronLeft, ChevronRight, Droplets } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { PARKING_LOTS, lotLabel } from '../../lib/parkingLayout';
import { withCommas } from '../../lib/money';

/**
 * 외부주차장 세차 대장.
 *
 * 외부 주차장에 세워 둔 차를 한 대당 1,250원에 닦아 주신다. 주 두 번 오시기로 했는데
 * 실제로 몇 번 왔는지는 아무도 안 세고 있었다 — 달이 끝나고 청구서를 받으면 그게
 * 맞는지 따질 근거가 없다.
 *
 * 달력에서 온 날을 눌러 찍는다. 대수는 그 주차장에 지금 서 있는 차를 세어 채운다 —
 * 매번 손으로 세게 하면 안 세고, 안 세면 청구서를 그대로 믿게 된다.
 *
 * 주차비와 섞지 않는다. 자리값과 닦는 값은 따로 흥정하는 돈이다.
 */

/** 한 대당 값 — 그 달에 적용한 값은 정산에 같이 남긴다(흥정으로 바뀔 수 있다) */
const DEFAULT_UNIT = 1_250;

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

  /** 지금 그 주차장에 서 있는 차 */
  const carsInLot = useMemo(
    () => state.parkingVehicles.filter(v => v.lot === lot && !v.soldDate).length,
    [state.parkingVehicles, lot],
  );

  /*
    그날 그 주차장에 있던 차.

    지금 서 있는 차로 채우면 지난 날을 찍어도 오늘 대수가 박힌다 — 8일을 찍든 20일을
    찍든 같은 숫자가 나온다. 그 사이 판 차는 그날엔 있었던 차다.

    판 날로 되돌린다: 그 날짜보다 나중에 팔린 차는 그날 있었던 것으로 센다. 언제 들어온
    차인지는 주차 배치에 안 남아서, 그날 이후 들어온 차까지 세어질 수 있다 — 그래서
    아래 목록에서 손으로 고칠 수 있게 뒀다. 현장이 아는 숫자가 맞는 숫자다.
  */
  const carsInLotOn = useCallback(
    (date: string) =>
      state.parkingVehicles.filter(v => v.lot === lot && (!v.soldDate || v.soldDate > date)).length,
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
        await api('/wash/visits', { method: 'POST', body: { date, lot, carCount: carsInLotOn(date) } });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /** 그날 대수를 고친다 — 같은 날·같은 주차장은 덮어쓴다 */
  const patchVisit = async (v: Visit, carCount: number) => {
    setBusy(true);
    setError(null);
    try {
      // 메모를 같이 보낸다 — 안 보내면 서버가 빈 값으로 덮어쓴다
      await api('/wash/visits', { method: 'POST', body: { date: v.date, lot: v.lot, carCount, memo: v.memo } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '대수를 고치지 못했습니다.');
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
    청구 대수는 온 날마다 닦은 대수를 모두 더한 값이다.

    한 대를 한 번 닦을 때마다 1,250원이다 — 9월에 여덟 번 오셔서 18·19·21·18·21·19…
    이면 그 합이 그 달 대수고, 거기에 1,250원을 곱한 값이 청구액이다. 그 달에 맡긴 차가
    몇 대인지가 아니라 몇 번 닦았는지로 센다.

    주차장이 여럿이면 다 더한다 — 청구서는 달마다 한 장으로 온다.
  */
  const countedCars = visits.reduce((sum, v) => sum + v.carCount, 0);
  /** 이 주차장만 — 아래 목록에 소계로 띄운다 */
  const lotCars = lotVisits.reduce((sum, v) => sum + v.carCount, 0);
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
              {lotLabel(l)}
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
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          날짜를 누르면 세차하러 온 날로 찍힙니다. 대수는 <b>그날 기준</b>으로 채웁니다 — 그 뒤에 판 차는 그날엔 있던
          차라 같이 셉니다. 들어온 날은 주차 배치에 안 남아서 실제와 다를 수 있으니, 아래에서 그날 대수를 고치세요.
        </p>
      </div>

      {/*
        찍은 날마다 대수를 고친다.

        그날 몇 대였는지는 현장이 안다. 고칠 자리가 없으면 자동으로 채운 숫자가 그대로
        청구 대수가 되고, 그 값으로 청구서와 맞춰 보게 된다.
      */}
      {lotVisits.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-bold text-slate-800">{month.format('M월')} 온 날 · 대수</h3>
            {/* 이 주차장 소계 — 청구는 달 전체로 하지만 어디서 나온 값인지는 여기서 본다 */}
            <span className="text-xs text-slate-500">
              {lotVisits.length}번 · {lotCars}대 ·{' '}
              <b className="text-slate-700">{withCommas(String(lotCars * unitPrice))}원</b>
            </span>
          </div>
          <ul className="mt-2 divide-y divide-slate-50">
            {[...lotVisits]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(v => (
                <li key={v.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-28 text-xs font-medium text-slate-600">
                    {dayjs(v.date).format('M월 D일 (ddd)')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={v.carCount}
                    onBlur={e => {
                      const next = Number(e.target.value) || 0;
                      if (next !== v.carCount) void patchVisit(v, next);
                    }}
                    disabled={busy}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-indigo-400"
                  />
                  <span className="text-xs text-slate-400">대</span>
                  {/* 그날 값 — 대수만 보면 얼마짜리 날인지 셈을 다시 해야 한다 */}
                  <span className="text-xs font-medium text-slate-500">
                    {withCommas(String(v.carCount * unitPrice))}원
                  </span>
                  {/* 자동으로 센 값과 다르면 손으로 고친 줄이다 */}
                  {v.carCount !== carsInLotOn(v.date) && (
                    <span className="text-[10px] text-slate-300">그날 기준 {carsInLotOn(v.date)}대</span>
                  )}
                  <span className="ml-auto text-[11px] text-slate-400">{v.recordedBy}</span>
                  <button
                    onClick={() => void toggle(v.date)}
                    disabled={busy}
                    className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-red-500"
                  >
                    지우기
                  </button>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            청구 대수는 온 날 대수를 <b>모두 더한 값</b>입니다 — 한 대를 한 번 닦을 때마다 값이 붙습니다.
          </p>
        </div>
      )}

      {/* 달마다 치르는 값 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Droplets size={15} className="text-cyan-500" />
          <h3 className="text-sm font-bold text-slate-800">{month.format('M월')} 정산</h3>
          <span className="text-[11px] text-slate-400">매달 30일 결제</span>
          {/* 그 달 전체 — 주차장이 여럿이면 다 더한 값이다 */}
          {visits.length > 0 && (
            <span className="text-[11px] text-slate-500">
              {visits.length}번 방문 · 더하면 {countedCars}대
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/*
            칸 밖을 눌렀을 때 저장한다.

            한 글자 칠 때마다 저장하면 저장이 끝나기 전에 값이 되돌아와 숫자가 튄다 —
            25를 적으려다 2가 적히는 식이다. 다른 화면과 같은 방식으로 맞춘다.
          */}
          <label className="text-xs text-slate-500">
            청구 대수
            <input
              key={`count-${ym}-${carCount}`}
              type="number"
              min={0}
              defaultValue={carCount || ''}
              onBlur={e => {
                const next = Number(e.target.value) || 0;
                if (next !== carCount) void patchSettlement({ carCount: next });
              }}
              disabled={busy}
              placeholder={String(countedCars)}
              className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <span className="pb-2 text-slate-400">×</span>
          <label className="text-xs text-slate-500">
            한 대당
            <input
              key={`unit-${ym}-${unitPrice}`}
              type="number"
              min={0}
              defaultValue={unitPrice}
              onBlur={e => {
                const next = Number(e.target.value) || 0;
                if (next !== unitPrice) void patchSettlement({ unitPrice: next });
              }}
              disabled={busy}
              className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <span className="pb-2 text-slate-400">=</span>
          <div className="pb-1">
            <p className="text-xs text-slate-400">청구액</p>
            <p className="text-xl font-bold text-cyan-700">{withCommas(String(amount))}원</p>
            <p className="text-[10px] text-slate-400">
              {carCount}대 × {withCommas(String(unitPrice))}원
              {!settlement?.carCount && countedCars > 0 && ` · ${visits.length}번 온 날 대수를 더한 값`}
            </p>
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
            찍힌 기록을 더하면 {countedCars}대({visits.length}번)인데 {settlement.carCount}대로 적혀 있습니다.
            청구서를 한 번 보세요.
          </p>
        )}
      </div>
    </div>
  );
}
