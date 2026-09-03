import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fitPrice, niceScale, type Listing } from '../../lib/carPrice';
import { withCommas } from '../../lib/money';

interface CarSpec {
  manufacturer: string;
  model: string;
  badge: string;
  count: number;
}

/** 서버는 못 찾으면 이름을 줄여가며 다시 찾는다 — 무엇으로 찾았는지 같이 온다. */
interface SearchResult {
  query: string;
  specs: CarSpec[];
}

interface Props {
  /** 부르는 화면에 적힌 차명 — 열자마자 그걸로 찾아둔다 */
  defaultQuery: string;
  /** 대상 차의 주행거리(km). 모르면 화면에서 직접 넣는다 */
  mileage?: number | null;
  /** 대상 차의 연식 — 적혀 있으면 비슷한 연식만 놓고 비교한다 */
  modelYear?: string;
  /** 대상 차의 연료 — 적혀 있으면 같은 연료만 놓고 비교한다 */
  fuel?: string;
  /**
   * 시세를 어딘가에 넣는다(원). 안 주면 보기만 하는 창이 된다 —
   * 상담 중에는 손님에게 값을 말해줄 뿐 어디에 적지 않는다.
   */
  onPick?: (won: number) => void;
  /**
   * 고른 등급을 부른 화면에 돌려준다.
   *
   * 등급만이 아니라 제조사·모델까지 준다 — 우리가 적어둔 차명은 표기가 제각각이라
   * ("르노(삼성) SM6") 다음에 또 못 찾는다. 카비어 표기로 맞춰두면 그 뒤로는 그대로 찾힌다.
   */
  onPickSpec?: (spec: { manufacturer: string; model: string; badge: string }) => void;
  onClose: () => void;
}

const CHART = { width: 620, height: 290, left: 60, right: 16, top: 16, bottom: 46 };

/** 연식 허용 폭 — 같은 등급이라도 연식이 몇 해 벌어지면 값 차이가 크다. */
const YEAR_TOLERANCES = [0, 1, 2, null] as const;
type YearTolerance = (typeof YEAR_TOLERANCES)[number];

const TOLERANCE_LABEL = (t: YearTolerance) => (t == null ? '연식 전체' : t === 0 ? '같은 연식' : `±${t}년`);

/**
 * 대상 연식에 가장 가까운 세대를 고른다.
 *
 * 연식이 겹치는 매물이 제일 많은 세대를 쓴다. 세대 이름만으로는 언제부터 언제까지인지
 * 알 수 없어서(‘더 뉴 카니발’) 매물의 연식으로 가늠하는 수밖에 없다.
 */
function pickGeneration(listings: Listing[], targetYear: number | null): string | null {
  if (targetYear == null || listings.length === 0) return null;

  const score = new Map<string, number>();
  for (const l of listings) {
    const y = toYear(l.year);
    if (y == null || Math.abs(y - targetYear) > 2) continue;
    score.set(l.model, (score.get(l.model) ?? 0) + 1);
  }
  if (score.size === 0) return null;

  return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** "2016", "16", "2016년" 처럼 제각각 적혀 온다 — 숫자만 뽑아 네 자리로 맞춘다. */
function toYear(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) return 2000 + Number(digits);
  return null;
}

/**
 * 시세 조회 — 카비어에 올라온 같은 등급 매물로 값을 가늠한다.
 *
 * 매입가를 정할 때 다른 창을 열어 찾아보고 옮겨 적던 걸 여기서 끝낸다.
 * 곡선과 범위는 카비어의 '내 차 시세 조회'와 같은 계산이라 값이 어긋나지 않는다.
 *
 * 호가 기준이다 — 실제로 팔린 값이 아니라 지금 올라와 있는 값이라, 실거래는 대체로 이보다 낮다.
 */
export default function PriceCheckModal({
  defaultQuery,
  mileage: presetMileage = null,
  modelYear = '',
  fuel = '',
  onPick,
  onPickSpec,
  onClose,
}: Props) {
  const targetYear = useMemo(() => toYear(modelYear), [modelYear]);
  const targetFuel = fuel.trim();

  // 주행거리를 모르고 여는 경우가 있다(상담 중). 시세 범위는 주행거리가 있어야 나오니 여기서 받는다.
  const [mileageText, setMileageText] = useState(presetMileage ? withCommas(presetMileage) : '');
  const mileage = Number(mileageText.replace(/[^\d]/g, '')) || null;

  // 연식·연료를 아는 차면 처음부터 좁혀서 본다 — 같은 등급이어도 연식이 벌어지면 값이 크게 다르다.
  const [tolerance, setTolerance] = useState<YearTolerance>(targetYear != null ? 2 : null);
  const [sameFuelOnly, setSameFuelOnly] = useState(Boolean(targetFuel));
  /**
   * 세대(더 뉴 카니발 / 카니발 4세대 …). null 이면 전체.
   *
   * 카비어 등급 검색에는 엔카의 세대 구분이 없어서, 한 등급에 여러 세대가 섞여 온다.
   * 카니발 9인승 노블레스 하나에 690~2,650만원이 같이 들어 있는 식이라 그대로 곡선을
   * 맞추면 시세가 흐려진다. 매물 쪽에는 세대가 들어 있으니 받은 뒤에 가른다.
   */
  const [generation, setGeneration] = useState<string | null>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [specs, setSpecs] = useState<CarSpec[] | null>(null);
  /** 서버가 실제로 찾은 이름. 적어 넣은 것과 다르면 화면에 알린다 */
  const [usedQuery, setUsedQuery] = useState('');
  const [picked, setPicked] = useState<CarSpec | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const search = useCallback(async (term: string) => {
    const q = term.trim();
    if (!q) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setPicked(null);
    try {
      const res = await api<SearchResult>(`/carvior/car-spec/search?q=${encodeURIComponent(q)}`);
      if (myReq !== reqId.current) return;
      setSpecs(res.specs);
      setUsedQuery(res.query);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '시세를 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  // 차명이 적혀 있으면 열자마자 찾아둔다 — 이미 아는 걸 다시 치게 하지 않는다.
  useEffect(() => {
    if (defaultQuery.trim()) void search(defaultQuery);
  }, [defaultQuery, search]);

  const pick = async (spec: CarSpec) => {
    const myReq = ++reqId.current;
    setPicked(spec);
    // 등급을 고른 순간 세부모델이 정해진다 — 시세를 안 넣고 닫아도 이건 남는다.
    onPickSpec?.({ manufacturer: spec.manufacturer, model: spec.model, badge: spec.badge });
    setLoading(true);
    setListings([]);
    try {
      const params = new URLSearchParams({
        manufacturer: spec.manufacturer,
        model: spec.model,
        badge: spec.badge,
      });
      const rows = await api<Listing[]>(`/carvior/car-spec/listings?${params}`);
      if (myReq !== reqId.current) return;
      setListings(rows);

      /*
       * 대상 차의 연식을 알면 그 연식이 속한 세대를 골라둔다.
       * 세대가 섞인 채로 보여주면 처음 보이는 값이 이미 틀린 값이라, 사람이 조건을
       * 걸기 전에는 잘못된 시세를 믿게 된다. 연식을 모르면 전체로 둔다.
       */
      setGeneration(pickGeneration(rows, targetYear));
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '매물을 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  };

  /**
   * 비교 대상을 좁힌다.
   *
   * 조건을 걸면 매물이 줄어드는데, 넷보다 적어지면 시세를 낼 수 없다. 그때는 조용히
   * 조건을 푸는 대신 몇 건 남았는지 보여주고 사람이 넓히게 한다 — 무엇을 놓고 잰
   * 값인지 모르면 시세를 믿을 수 없다.
   */
  /** 이 등급으로 온 매물에 실제로 섞여 있는 세대 — 많은 순으로 */
  const generations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of listings) counts.set(l.model, (counts.get(l.model) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [listings]);

  const compared = useMemo(() => {
    return listings.filter(l => {
      if (generation && l.model !== generation) return false;
      if (sameFuelOnly && targetFuel && l.fuel && l.fuel !== targetFuel) return false;
      if (tolerance != null && targetYear != null) {
        const y = toYear(l.year);
        if (y == null || Math.abs(y - targetYear) > tolerance) return false;
      }
      return true;
    });
  }, [listings, generation, sameFuelOnly, targetFuel, tolerance, targetYear]);

  const fit = useMemo(() => fitPrice(compared, mileage), [compared, mileage]);

  const chart = useMemo(() => {
    if (!fit) return null;
    const plotW = CHART.width - CHART.left - CHART.right;
    const plotH = CHART.height - CHART.top - CHART.bottom;

    const targetX = mileage != null && mileage > 0 ? mileage / 10000 : 0;
    const xScale = niceScale(1.08 * Math.max(...fit.points.map(p => p.x), targetX) || 1, 3);
    const yScale = niceScale(1.08 * Math.max(...fit.points.map(p => p.y)), 4);

    const px = (x: number) => CHART.left + (x / xScale.max) * plotW;
    const py = (y: number) => CHART.top + plotH - (y / yScale.max) * plotH;

    const path = Array.from({ length: 41 }, (_, i) => {
      const x = (xScale.max * i) / 40;
      return `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${py(Math.max(0, fit.curve(x))).toFixed(1)}`;
    }).join(' ');

    return {
      px,
      py,
      path,
      xTicks: Array.from({ length: Math.round(xScale.max / xScale.step) + 1 }, (_, i) => xScale.step * i),
      yTicks: Array.from({ length: Math.round(yScale.max / yScale.step) + 1 }, (_, i) => yScale.step * i),
      targetX: mileage != null && mileage > 0 ? targetX : null,
    };
  }, [fit, mileage]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">시세 조회</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          카비어에 올라온 같은 등급 매물로 값을 가늠합니다. <b>호가 기준</b>이라 실거래는 대체로 이보다 낮습니다.
          등급 검색에는 세대 구분이 없어 한 등급에 여러 세대가 섞여 옵니다 — 아래에서 세대를 골라 보세요.
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            void search(query);
          }}
        >
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="차명으로 찾기 — K7, 그랜저, 쏘렌토"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Search size={15} /> 조회
          </button>
        </form>

        <div className="mt-2 flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">주행거리</label>
          <input
            value={mileageText}
            onChange={e => setMileageText(withCommas(e.target.value))}
            inputMode="numeric"
            placeholder="137,452"
            className="w-32 rounded-lg border border-slate-200 px-2.5 py-1 text-right text-sm outline-none focus:border-indigo-400"
          />
          <span className="text-xs text-slate-400">km — 넣으면 그 지점의 시세 범위가 나옵니다</span>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

        {/* 등급 고르기 */}
        {!picked && (
          <div className="mt-4">
            {loading && <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>}
            {!loading && specs?.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">
                “{query.trim()}”로 찾은 등급이 없습니다. 차명을 짧게 줄여 보세요 — SM6, K7, 그랜저.
              </p>
            )}

            {/* 이름을 바꿔 찾은 걸 모르면 엉뚱한 차 등급을 고르게 된다 */}
            {!loading && specs && specs.length > 0 && usedQuery !== query.trim() && (
              <p className="mb-2 rounded-lg bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                “{query.trim()}”로는 못 찾아서 <b>“{usedQuery}”</b>로 찾았습니다. 아래에서 맞는 등급을 골라 주세요.
              </p>
            )}
            {!loading && specs && specs.length > 0 && (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {specs.map(s => (
                  <button
                    key={`${s.manufacturer}|${s.model}|${s.badge}`}
                    onClick={() => void pick(s)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="text-sm text-slate-700">
                      <b className="text-slate-900">{s.manufacturer} {s.model}</b>
                      <span className="ml-1.5 text-slate-500">{s.badge}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">매물 {s.count.toLocaleString()}건</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 고른 등급의 시세 */}
        {picked && (
          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800">
                {picked.manufacturer} {picked.model} · {picked.badge}
              </p>
              <button
                onClick={() => setPicked(null)}
                className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft size={13} /> 다시 선택
              </button>
            </div>

            {/*
              세대는 등급보다 값 차이가 크다(같은 9인승 노블레스가 690~2,650만원).
              그래서 연식·연료보다 위에, 이름을 그대로 눌러 고르게 둔다.
            */}
            {!loading && generations.length > 1 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400">세대</span>
                <button
                  onClick={() => setGeneration(null)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    generation === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  전체
                </button>
                {generations.map(([name, count]) => (
                  <button
                    key={name}
                    onClick={() => setGeneration(name)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                      generation === name ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {name} {count}
                  </button>
                ))}
              </div>
            )}

            {/* 무엇을 놓고 잰 값인지 보이게 — 조건이 숨어 있으면 시세를 믿을 수 없다 */}
            {!loading && listings.length > 0 && (targetYear != null || targetFuel) && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {targetYear != null && (
                  <>
                    <span className="text-[11px] font-semibold text-slate-400">연식 {targetYear}년</span>
                    {YEAR_TOLERANCES.map(t => (
                      <button
                        key={String(t)}
                        onClick={() => setTolerance(t)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                          tolerance === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {TOLERANCE_LABEL(t)}
                      </button>
                    ))}
                  </>
                )}
                {targetFuel && (
                  <button
                    onClick={() => setSameFuelOnly(v => !v)}
                    className={`ml-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                      sameFuelOnly ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {targetFuel}만
                  </button>
                )}
              </div>
            )}

            {loading && <p className="py-10 text-center text-sm text-slate-400">매물을 불러오는 중…</p>}

            {!loading && !fit && (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">
                조건에 맞는 매물이 모자랍니다({compared.length}건 / 전체 {listings.length}건).
                시세를 내려면 네 건 이상 있어야 합니다 — 위에서 연식·연료 조건을 넓혀 보세요.
              </p>
            )}

            {!loading && fit && chart && (
              <>
                <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="w-full">
                  {chart.yTicks.map(t => (
                    <g key={`y${t}`}>
                      <line
                        x1={CHART.left}
                        x2={CHART.width - CHART.right}
                        y1={chart.py(t)}
                        y2={chart.py(t)}
                        stroke="#f1f5f9"
                      />
                      <text x={CHART.left - 8} y={chart.py(t) + 3.5} textAnchor="end" className="fill-slate-400 text-[10px]">
                        {t.toLocaleString()}만원
                      </text>
                    </g>
                  ))}
                  {chart.xTicks.map(t => (
                    <text
                      key={`x${t}`}
                      x={chart.px(t)}
                      y={CHART.height - 26}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      {t}만km
                    </text>
                  ))}

                  <path d={chart.path} fill="none" stroke="#6366f1" strokeWidth={2.5} />

                  {fit.points.map((p, i) => (
                    <circle key={i} cx={chart.px(p.x)} cy={chart.py(p.y)} r={3} className="fill-indigo-300" />
                  ))}

                  {chart.targetX != null && fit.center != null && (
                    <g>
                      <line
                        x1={chart.px(chart.targetX)}
                        x2={chart.px(chart.targetX)}
                        y1={chart.py(fit.center)}
                        y2={CHART.height - CHART.bottom}
                        stroke="#6366f1"
                        strokeWidth={1}
                        strokeDasharray="3,3"
                      />
                      <circle cx={chart.px(chart.targetX)} cy={chart.py(fit.center)} r={5.5} className="fill-indigo-600" />
                      <text
                        x={chart.px(chart.targetX)}
                        y={CHART.height - 26}
                        textAnchor="middle"
                        className="fill-indigo-600 text-[10px] font-bold"
                      >
                        대상차 {chart.targetX.toFixed(1)}만km
                      </text>
                    </g>
                  )}
                </svg>

                {fit.low != null && fit.high != null ? (
                  <div className="mt-2 rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">실거래 판매시세</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        호가 기준
                      </span>
                    </div>
                    <p className="mt-0.5 text-2xl font-black text-slate-900">
                      {fit.low.toLocaleString()} ~ {fit.high.toLocaleString()}
                      <span className="ml-1 text-sm font-bold text-slate-400">만원</span>
                    </p>
                    {onPick && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {[fit.low, Math.round((fit.low + fit.high) / 2 / 10) * 10, fit.high].map((v, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            onPick(v * 10000);
                            onClose();
                          }}
                          className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          {withCommas(v * 10000)}원으로 넣기
                        </button>
                      ))}
                    </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 rounded-xl bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
                    주행거리를 넣으면 그 지점의 시세 범위가 나옵니다.
                  </p>
                )}

                <p className="mt-3 mb-1.5 text-xs font-bold text-slate-500">
                  비교한 매물 {compared.length}건
                  {compared.length !== listings.length && (
                    <span className="ml-1 font-medium text-slate-400">(전체 {listings.length}건 중)</span>
                  )}
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
                  {compared.map(l => (
                    <div key={l.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                      {l.thumbnailUrl ? (
                        <img src={l.thumbnailUrl} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-9 w-12 shrink-0 rounded bg-slate-100" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                        <b className="font-semibold text-slate-600">{l.model}</b> · {l.year}년식 ·{' '}
                        {l.mileage.toLocaleString()}km · {l.fuel}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-800">
                        {l.priceManwon.toLocaleString()}만원
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
