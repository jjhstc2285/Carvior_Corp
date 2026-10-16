import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../../store';
import { isContracted } from '../../lib/consultationStats';
import { BLANK_TONE, platformTone } from '../../lib/platformTone';

/**
 * 어디서 전화가 들어오나 — 유입 경로 비율.
 *
 * 옆의 '어디서 팔렸나'는 나간 쪽을 센다. 이건 들어온 쪽이다. 엔카에 돈을 얼마나 쓸지,
 * 114를 계속 둘지 같은 판단이 이 숫자에서 나오는데 세어 둔 데가 없었다.
 *
 * 건수만 세지 않고 그중 몇 건이 팔렸는지(전환)를 같이 적는다. 많이 들어오는 곳과 잘
 * 팔리는 곳이 다를 수 있다 — 들어온 수만 보면 전화만 많고 안 팔리는 데에 계속 돈을 쓴다.
 */

/**
 * 어느 달부터 세는가 — 옆 그래프와 같은 달이다.
 *
 * 둘이 다른 기간을 세면 "판매완료 61건인데 유입은 왜 300건이야"가 된다.
 */
const START_MONTH = '2026-09';

/* 도넛 — 옆 그래프와 같은 크기로 맞춘다 */
const R = 52;
const C = 2 * Math.PI * R;

/** 안 적은 건 — 한 덩어리로 모아 맨 뒤에 둔다 */
const BLANK = '안 적음';

/** 빛깔은 lib/platformTone 한 곳에서 온다 — 정산 표와 같은 색을 써야 뜻이 산다 */
const toneOf = (name: string) => (name === BLANK ? BLANK_TONE : platformTone(name));

export default function PlatformMixChart() {
  const { state } = useStore();

  const { rows, total, blank } = useMemo(() => {
    /*
      들어온 상담을 다 센다.

      판매완료만 세면 '팔린 차가 어디서 왔나'가 되는데, 그건 옆 그래프가 이미 한다.
      여기서 보고 싶은 건 전화가 어디서 오느냐라서 상태를 안 가린다.
    */
    const rows = state.consultations.filter(c => (c.date ?? '') >= `${START_MONTH}-01`);

    const counted = new Map<string, { count: number; sold: number }>();
    for (const c of rows) {
      const key = (c.platform ?? '').trim() || BLANK;
      const prev = counted.get(key) ?? { count: 0, sold: 0 };
      counted.set(key, {
        count: prev.count + 1,
        // 계약까지 간 건 — 판매완료만 세면 아직 출고 전인 계약이 빠진다
        sold: prev.sold + (isContracted(c.status) ? 1 : 0),
      });
    }

    const made = [...counted]
      .map(([name, v]) => ({ name, ...v }))
      // 많이 들어온 데부터. 안 적음은 경로가 아니라 빈칸이라 늘 맨 뒤다
      .sort((a, b) => (a.name === BLANK ? 1 : b.name === BLANK ? -1 : 0) || b.count - a.count);

    return {
      rows: made,
      total: rows.length,
      blank: counted.get(BLANK)?.count ?? 0,
    };
  }, [state.consultations]);

  if (total === 0) return null;

  /* 조각을 이어 붙인다 — 옆 그래프와 같은 방식이다 */
  let drawn = 0;
  const arcs = rows
    .filter(r => r.count > 0)
    .map(r => {
      const len = (r.count / total) * C;
      const arc = { ...r, len, offset: -drawn };
      drawn += len;
      return arc;
    });

  const top = rows.find(r => r.name !== BLANK);
  /** 가장 잘 팔리는 곳 — 열 건은 들어와야 견줄 만하다. 두 건 중 한 건은 50%가 아니다 */
  const best = [...rows]
    .filter(r => r.name !== BLANK && r.count >= 10)
    .sort((a, b) => b.sold / b.count - a.sold / a.count)[0];

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-800">유입 경로 — 어디서 전화가 오나</h2>
        <span className="text-xs text-slate-400">
          {dayjs(`${START_MONTH}-01`).format('YYYY년 M월')}부터 · 상담일 기준
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="relative shrink-0">
          <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
            <circle cx="66" cy="66" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
            {arcs.map(a => (
              <circle
                key={a.name}
                cx="66"
                cy="66"
                r={R}
                fill="none"
                stroke={toneOf(a.name).hex}
                strokeWidth="18"
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={a.offset}
              >
                <title>{`${a.name} ${a.count}건 (${Math.round((a.count / total) * 100)}%) · 계약 ${a.sold}건`}</title>
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
          {rows.map(r => {
            const pct = Math.round((r.count / total) * 100);
            const tone = toneOf(r.name);
            return (
              <div key={r.name} className="flex items-center gap-2">
                <i className={`size-2.5 shrink-0 rounded-sm ${tone.bar}`} />
                <span className="w-12 shrink-0 truncate text-xs text-slate-600" title={r.name}>
                  {r.name}
                </span>
                {/* 도넛만으로는 작은 조각끼리 견주기 어렵다 — 막대를 같이 둔다 */}
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs">
                  <b className="text-slate-800">{r.count}</b>
                  <span className="ml-1 text-slate-400">{pct}%</span>
                </span>
                {/*
                  그중 몇 건이 계약까지 갔나.

                  들어온 수만 보면 전화만 많고 안 팔리는 데에 계속 돈을 쓴다.
                */}
                <span
                  className="w-16 shrink-0 text-right text-[11px] text-slate-400"
                  title={`${r.name} 로 들어온 ${r.count}건 중 ${r.sold}건이 계약까지 갔습니다`}
                >
                  계약 <b className="font-bold text-slate-600">{r.sold}</b>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-auto border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        {top && `${top.name}가 ${Math.round((top.count / total) * 100)}%로 가장 많이 들어옵니다.`}
        {best && ` 계약까지 가는 비율은 ${best.name}가 ${Math.round((best.sold / best.count) * 100)}%로 가장 높습니다.`}
        {/* 안 적은 건이 많으면 이 분포 자체를 믿으면 안 된다 */}
        {blank > 0 && (
          <>
            {' '}
            <b className="font-bold text-amber-600">
              경로를 안 적은 건이 {blank}건({Math.round((blank / total) * 100)}%)입니다.
            </b>
          </>
        )}
      </p>
    </section>
  );
}
