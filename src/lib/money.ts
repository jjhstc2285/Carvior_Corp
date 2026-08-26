/**
 * 금액 입력 표기.
 *
 * 정산은 만원, 차량비용·매입리스트는 원 단위라 자릿수가 제각각인데, 어느 쪽이든
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
