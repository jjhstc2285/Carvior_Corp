/**
 * 매물 호가로 시세 곡선을 그리고, 주행거리에 맞는 시세 범위를 낸다.
 *
 * 카비어의 '내 차 시세 조회'(carvior.store/price)가 쓰는 계산을 그대로 옮겼다.
 * 같은 차를 두 화면에서 봤을 때 값이 다르면 어느 쪽을 믿어야 할지 알 수 없어서,
 * 우리가 더 나은 식을 쓰기보다 저쪽과 똑같이 맞추는 쪽을 골랐다.
 *
 * 중고차 값은 주행거리가 늘수록 떨어지지만 곧게 떨어지지 않는다 — 초반에 많이 빠지고
 * 뒤로 갈수록 완만해진다. 그래서 직선이 아니라 2차식으로 맞춘다.
 */

export interface Listing {
  id: string;
  model: string;
  badge: string;
  year: string;
  /** km */
  mileage: number;
  fuel: string;
  /** 호가(만원) */
  priceManwon: number;
  thumbnailUrl: string | null;
}

export interface PricePoint {
  /** 만km */
  x: number;
  /** 만원 */
  y: number;
}

export interface PriceFit {
  points: PricePoint[];
  /** 주행거리(만km)를 넣으면 그 지점의 시세(만원)를 준다 */
  curve: (x: number) => number;
  /** 대상 주행거리에서의 시세(만원). 대상을 안 줬으면 null */
  center: number | null;
  /** 시세 범위(만원) — 10만원 단위로 끊는다 */
  low: number | null;
  high: number | null;
}

/**
 * 최소제곱법으로 y = a + bx + cx² 를 맞춘다.
 *
 * 3×3 정규방정식을 크라메르 공식으로 푼다. 점이 한 줄로 늘어서 있으면 행렬식이 0에 가까워져
 * 답이 안 나오는데, 그때는 null 을 주고 화면에서 곡선을 안 그린다.
 */
function fitQuadratic(points: PricePoint[]): ((x: number) => number) | null {
  let n = 0;
  let sx = 0;
  let sx2 = 0;
  let sx3 = 0;
  let sx4 = 0;
  let sy = 0;
  let sxy = 0;
  let sx2y = 0;

  for (const { x, y } of points) {
    const x2 = x * x;
    n += 1;
    sx += x;
    sx2 += x2;
    sx3 += x2 * x;
    sx4 += x2 * x2;
    sy += y;
    sxy += x * y;
    sx2y += x2 * y;
  }

  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const d = det3([
    [n, sx, sx2],
    [sx, sx2, sx3],
    [sx2, sx3, sx4],
  ]);
  if (Math.abs(d) < 1e-9) return null;

  const a = det3([
    [sy, sx, sx2],
    [sxy, sx2, sx3],
    [sx2y, sx3, sx4],
  ]) / d;
  const b = det3([
    [n, sy, sx2],
    [sx, sxy, sx3],
    [sx2, sx2y, sx4],
  ]) / d;
  const c = det3([
    [n, sx, sy],
    [sx, sx2, sxy],
    [sx2, sx3, sx2y],
  ]) / d;

  return (x: number) => a + b * x + c * x * x;
}

/**
 * 매물 목록에서 시세를 낸다.
 *
 * 점이 넷보다 적으면 곡선을 안 그린다 — 2차식은 계수가 셋이라 그보다 적으면
 * 점을 그대로 잇는 것과 같아서 시세라고 부를 수 없다.
 *
 * @param mileage 대상 차의 주행거리(km). 없으면 곡선만 그리고 범위는 안 낸다.
 */
export function fitPrice(listings: Listing[], mileage: number | null): PriceFit | null {
  const points = listings
    .filter(l => l.priceManwon > 0)
    .map(l => ({ x: l.mileage / 10000, y: l.priceManwon }));
  if (points.length < 4) return null;

  const curve = fitQuadratic(points);
  if (!curve) return null;

  let center: number | null = null;
  let low: number | null = null;
  let high: number | null = null;

  if (mileage != null && mileage > 0) {
    center = Math.max(0, curve(mileage / 10000));

    // 폭은 두 가지 중 큰 쪽으로 잡는다.
    //  - 매물이 곡선에서 벗어난 정도(제곱평균)의 절반 — 값이 들쭉날쭉하면 범위도 넓어야 한다
    //  - 시세의 3% — 매물이 고르게 모여 있어도 범위가 0이 되면 안 된다
    const mse = points.reduce((sum, p) => sum + (p.y - curve(p.x)) ** 2, 0) / points.length;
    const spread = Math.max(0.5 * Math.sqrt(mse), 0.03 * center);

    low = 10 * Math.round((center - spread) / 10);
    high = 10 * Math.round((center + spread) / 10);
  }

  return { points, curve, center, low, high };
}

/** 축 눈금 — 최댓값을 넘는 가장 가까운 '보기 좋은' 값과 그 간격 */
export function niceScale(maxValue: number, targetTicks: number): { max: number; step: number } {
  const raw = maxValue / targetTicks || 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return { max: Math.ceil(maxValue / step) * step, step };
}
