/**
 * 금액 입력 표기.
 *
 * 정산은 만원, 차량비용·매입은 원 단위라 자릿수가 제각각인데, 어느 쪽이든
 * 0이 여러 개 붙으면 눈으로 못 센다(1000000 이 백만인지 천만인지). 세 자리마다 쉼표를 넣는다.
 *
 * <input type="number">로는 쉼표를 못 넣는다(브라우저가 값을 숫자로만 받는다).
 * 그래서 화면에는 쉼표를 붙여 보여주고, 값은 숫자만 남긴 문자열로 다룬다 —
 * 저장할 때 Number()로 바로 넘어가도록.
 */

/** 사용자가 친 것에서 숫자만 남긴다. 음수·소수는 이 앱의 금액 칸에 쓰지 않는다. */
export function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, '');
}

/**
 * "1000000" → "1,000,000" (빈 값은 빈 값 그대로 — placeholder가 보이게)
 *
 * 숫자 0은 빈 칸으로 본다(저장된 값이 0이면 placeholder를 보여주는 게 낫다).
 * 반대로 사용자가 친 "0"은 그대로 둔다 — 타이핑 중에 글자가 사라지면 안 된다.
 */
export function withCommas(value: string | number): string {
  if (typeof value === 'number') return value ? value.toLocaleString() : '';
  const digits = digitsOnly(value);
  if (!digits) return '';
  return Number(digits).toLocaleString();
}

/** 입력값을 숫자로. 빈 칸은 0. */
export function moneyToNumber(value: string): number {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : 0;
}

/**
 * 입력 이벤트에서 받은 값을 '저장용 숫자 문자열'로 바꾼다.
 * 화면 표시는 withCommas가 맡으므로 여기서는 쉼표를 떼기만 한다.
 *
 * 앞자리 0은 지운다("0100" → "100") — type="number"가 해주던 일이라 그대로 유지한다.
 */
export function toMoneyValue(input: string): string {
  const digits = digitsOnly(input).replace(/^0+(?=\d)/, '');
  return digits;
}

// ── 만원 표기 ────────────────────────────────
//
// 매입 정산은 '원' 단위 정수로 저장하고 화면에서만 만원으로 보여준다.
// 광택 35,000원처럼 만원으로 안 떨어지는 비용이 흔한데, 만원 정수로는 3.5를 못 담는다.
// 소수로 저장하면 더할 때 오차가 생기므로, 저장은 정수(원)로 두고 표기만 나눈다.

export const WON_PER_MANWON = 10_000;

/** 입력 중인 만원 값 정리 — 숫자와 소수점 하나만 남긴다("3.5.2" → "3.52"). */
export function toManwonValue(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  const whole = head.replace(/^0+(?=\d)/, '');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
}

/** 만원 표기("3.5", "2,750") → 원 정수. 1원 미만은 반올림한다. */
export function manwonToWon(input: string): number {
  const value = Number(toManwonValue(input));
  return Number.isFinite(value) ? Math.round(value * WON_PER_MANWON) : 0;
}

/**
 * 원 정수 → 만원 표기. 35,000 → "3.5", 27,500,000 → "2,750"
 *
 * 1원 = 0.0001만원이라 소수 넷째 자리까지면 어떤 값도 정확히 표현된다.
 * 필요 없는 0은 toLocaleString이 알아서 뗀다.
 */
export function wonToManwon(won: number): string {
  return (won / WON_PER_MANWON).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** 입력창에 보여줄 만원 표기 — 편집 중인 문자열은 그대로 두고 정수부에만 쉼표를 붙인다. */
export function withManwonCommas(value: string): string {
  if (!value) return '';
  const [whole, decimal] = value.split('.');
  const head = whole ? Number(whole).toLocaleString() : '0';
  return decimal !== undefined ? `${head}.${decimal}` : head;
}
