import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { SlidersHorizontal } from 'lucide-react';
import { useStore } from '../../store';
import { effectiveKind, isContracted } from '../../lib/consultationStats';
import { BLANK_TONE, canonPlatform, platformTone } from '../../lib/platformTone';
import { CONSULTATION_KIND_LABEL, CONSULTATION_PLATFORMS_BY_KIND, type ConsultationKind } from '../../types';
import PlatformFixPanel, { isUnsorted } from './PlatformFixPanel';
import ChartDrillPanel from './ChartDrillPanel';
import type { Range } from './ChartRange';

/**
 * 어디서 전화가 들어오나 — 유입 경로 비율.
 *
 * 옆의 '어디서 팔렸나'는 나간 쪽을 센다. 이건 들어온 쪽이다. 엔카에 돈을 얼마나 쓸지,
 * 114를 계속 둘지 같은 판단이 이 숫자에서 나오는데 세어 둔 데가 없었다.
 *
 * 건수만 세지 않고 그중 몇 건이 팔렸는지(전환)를 같이 적는다. 많이 들어오는 곳과 잘
 * 팔리는 곳이 다를 수 있다 — 들어온 수만 보면 전화만 많고 안 팔리는 데에 계속 돈을 쓴다.
 *
 * 종류를 가려서 본다. 판매는 엔카·차차차로 들어오고, 타사는 카모두·카매니저 같은
 * 딜러끼리 쓰는 데서, 수출은 기존 거래처에서 온다 — 길이 아예 다르다. 한 덩어리로
 * 세면 큰 쪽(판매)이 전부를 덮어서 작은 쪽은 들어온 길이 보이지도 않는다.
 * 아래 탭을 누르면 그 종류의 길만 뜬다.
 */

/* 보는 기간은 바깥에서 내려준다 — 둘이 다른 기간을 세면 서로 못 견준다 */

/* 도넛 — 옆 그래프와 같은 크기로 맞춘다 */
const R = 52;
const C = 2 * Math.PI * R;

/** 안 적은 건 — 한 덩어리로 모아 맨 뒤에 둔다 */
const BLANK = '안 적음';

/** 아직 안 나눈 값 — 경로가 아니라 '모름'이다 */
const UNSORTED = '기타';

/** 빛깔은 lib/platformTone 한 곳에서 온다 — 정산 표와 같은 색을 써야 뜻이 산다 */
const toneOf = (name: string) => (name === BLANK ? BLANK_TONE : platformTone(name));

export default function PlatformMixChart({ range, kind }: { range: Range; kind: ConsultationKind }) {
  const { state } = useStore();

  /*
    탭을 따라간다. 전체로 보고 싶을 때가 있어서 빠져나갈 자리를 하나 둔다 —
    "엔카로 전부 몇 건 들어왔나"는 종류를 안 가리고 보는 값이다.
  */
  const [whole, setWhole] = useState(false);
  const [fixing, setFixing] = useState(false);
  /** 눌러서 펼쳐 본 줄 — 그 경로로 들어온 건을 목록으로 띄운다 */
  const [drill, setDrill] = useState<string | null>(null);
  const scope: ConsultationKind | null = whole ? null : kind;

  const { rows, total, unsorted, counting } = useMemo(() => {
    /*
      들어온 상담을 다 센다.

      판매완료만 세면 '팔린 차가 어디서 왔나'가 되는데, 그건 옆 그래프가 이미 한다.
      여기서 보고 싶은 건 전화가 어디서 오느냐라서 상태를 안 가린다.

      종류는 적힌 값이 아니라 effectiveKind 로 본다 — 알선으로 골라놓고 내용에
      "수출"이라고 적은 건이 많아서, 목록이 나누는 기준과 같아야 숫자가 맞는다.
    */
    const rows = state.consultations.filter(
      c =>
        (c.date ?? '') >= range.from &&
        (c.date ?? '') <= range.to &&
        (!scope || effectiveKind(c) === scope),
    );

    const counted = new Map<string, { count: number; sold: number }>();
    /*
      그 종류에서 고를 수 있는 경로를 0건이라도 먼저 깔아 둔다.
      "수출에 엔카는 0건"이 그래프에 안 보이면, 안 들어온 건지 아직 안 나눈 건지 모른다.
    */
    if (scope) for (const p of CONSULTATION_PLATFORMS_BY_KIND[scope]) counted.set(p, { count: 0, sold: 0 });

    for (const c of rows) {
      const key = canonPlatform(c.platform) || BLANK;
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
      // 목록에 그대로 넘긴다 — 여기서 거른 줄과 목록이 어긋나면 어느 쪽이 맞는지 알 수 없다
      counting: rows,
      // 아직 안 나눈 건 — 빈칸과 '기타'를 합친다. 둘 다 '어디서 왔는지 모름'이다
      unsorted: rows.filter(c => isUnsorted(c.platform)).length,
    };
  }, [state.consultations, range.from, range.to, scope]);

  /* 종류를 가려 볼 수 있게 — 탭을 따라가되 전체로 빠져나갈 자리를 둔다 */
  const scopeTab = (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-[11px]">
      {[
        { on: true, label: '전체' },
        { on: false, label: `${CONSULTATION_KIND_LABEL[kind]} 상담` },
      ].map(t => (
        <button
          key={t.label}
          onClick={() => setWhole(t.on)}
          className={`px-2 py-0.5 font-semibold transition-colors ${
            whole === t.on ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const head = (
    <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className="text-sm font-bold text-slate-800">
        유입 경로 — {scope ? `${CONSULTATION_KIND_LABEL[scope]} 상담은 ` : ''}어디서 전화가 오나
      </h2>
      <span className="text-xs text-slate-400">
        {dayjs(range.from).format('YY.MM.DD')} ~ {dayjs(range.to).format('YY.MM.DD')} · 상담일 기준
      </span>
      {scopeTab}
    </div>
  );

  /*
    그 종류에 상담이 아예 없을 수 있다(타사는 이제 막 생긴 탭이다).
    그래도 칸은 남긴다 — 그래프가 통째로 사라지면 옆 그래프와 줄이 안 맞고,
    0건인 건지 고장인 건지 알 수 없다.
  */
  if (total === 0) {
    return (
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        {head}
        <p className="flex flex-1 items-center justify-center py-8 text-sm text-slate-400">
          이 기간에 {scope ? `${CONSULTATION_KIND_LABEL[scope]} ` : ''}상담이 없습니다.
        </p>
      </section>
    );
  }

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

  /** 셈에 쓰는 줄 — 안 적음과 기타는 경로가 아니라 '모름'이라 뺀다 */
  const known = rows.filter(r => r.name !== BLANK && r.name !== UNSORTED && r.count > 0);
  const top = known[0];
  /** 가장 잘 팔리는 곳 — 열 건은 들어와야 견줄 만하다. 두 건 중 한 건은 50%가 아니다 */
  const best = [...known].filter(r => r.count >= 10).sort((a, b) => b.sold / b.count - a.sold / a.count)[0];

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      {head}

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
            /* 0건인 줄은 '그 길로는 안 들어온다'는 뜻이라 흐리게 둔다 — 없애면 그 사실이 안 보인다 */
            const empty = r.count === 0;
            return (
              /* 누르면 그 경로로 들어온 건이 뜬다. 0건인 줄은 띄울 게 없어서 안 눌린다 */
              <button
                key={r.name}
                type="button"
                disabled={empty}
                onClick={() => setDrill(r.name)}
                title={empty ? undefined : `${r.name} 로 들어온 ${r.count}건 보기`}
                className={`flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors enabled:hover:bg-slate-50 disabled:cursor-default ${
                  empty ? 'opacity-40' : ''
                }`}
              >
                <i className={`size-2.5 shrink-0 rounded-sm ${tone.bar}`} />
                <span className="w-14 shrink-0 truncate text-xs text-slate-600" title={r.name}>
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
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto border-t border-slate-100 pt-2">
        <p className="text-[11px] text-slate-400">
          {top && `${top.name}가 ${Math.round((top.count / total) * 100)}%로 가장 많이 들어옵니다.`}
          {best && ` 계약까지 가는 비율은 ${best.name}가 ${Math.round((best.sold / best.count) * 100)}%로 가장 높습니다.`}
          {!top && '나눠 적은 건이 아직 없습니다.'}
        </p>

        {/*
          안 나눈 건이 많으면 이 분포 자체를 믿으면 안 된다.

          알려만 주고 끝내면 아무도 못 고친다 — 시트에서 옮겨온 건이라 적은 사람도 없다.
          전화를 받은 TM 이 여기서 바로 나눈다.
        */}
        {unsorted > 0 && (
          <button
            onClick={() => setFixing(true)}
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            <SlidersHorizontal size={12} className="shrink-0" />
            어디서 왔는지 안 나눈 건이 {unsorted}건({Math.round((unsorted / total) * 100)}%)입니다 — 눌러서 나누기
          </button>
        )}
      </div>

      {fixing && <PlatformFixPanel from={range.from} to={range.to} kind={scope} onClose={() => setFixing(false)} />}

      {/*
        그 경로로 들어온 건을 띄운다. '안 적음'은 빈칸이라 경로 이름으로 못 찾는다 —
        비었는지로 가른다.
      */}
      {drill && (
        <ChartDrillPanel
          title={`유입 경로 — ${drill}${scope ? ` · ${CONSULTATION_KIND_LABEL[scope]} 상담` : ''}`}
          hint={`${dayjs(range.from).format('YY.MM.DD')} ~ ${dayjs(range.to).format('YY.MM.DD')} · 상담일 기준 · 상태를 안 가립니다`}
          rows={counting.filter(c =>
            drill === BLANK ? !canonPlatform(c.platform) : canonPlatform(c.platform) === drill,
          )}
          onClose={() => setDrill(null)}
        />
      )}
    </section>
  );
}
