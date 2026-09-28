/**
 * 받아 적힌 말을 우리 표기로 되돌린다.
 *
 * 채널톡 녹취는 들리는 대로 적는다. 사람이 "에스엠오"라고 읽으면 "S M 파이브"가 되고,
 * 값은 "삼천이백사십만 원"으로 적힌다. 우리 목록에는 "SM5", "3240"으로 있다.
 * 이걸 맞춰 두지 않으면 통화에 분명히 나온 차를 못 찾는다 — 실제로 못 찾았다.
 *
 * 되돌리는 건 두 가지다.
 *   글자 — "S M 파이브" → "SM5",  "케이 세븐" → "K7"
 *   숫자 — "오백만 원" → 500(만원),  "삼천이백사십만" → 3240
 */

/** 영어를 한글로 받아 적은 것 — 긴 것부터 바꿔야 "비엠"이 "비엠더블유"를 깨지 않는다 */
const LETTER_WORDS: [RegExp, string][] = [
  [/비엠더블유/g, 'BMW'],
  [/더블유/g, 'W'],
  [/에스엠/g, 'SM'],
  [/에스유브이/g, 'SUV'],
  [/아이오닉/g, '아이오닉'], // 숫자 규칙에 걸리지 않게 그대로 둔다
  [/디젤|가솔린/g, ' '],
  [/에스/g, 'S'],
  [/케이/g, 'K'],
  [/제이/g, 'J'],
  [/엠/g, 'M'],
  [/지이|쥐/g, 'G'],
  [/큐엠/g, 'QM'],
];

/**
 * 영어로 읽은 숫자 — 어디에 나와도 숫자로 본다.
 *
 * '원'은 안 넣는다 — 돈의 '원'과 구별이 안 된다("오백만 원"이 "오백만 1"이 되어버린다).
 * '오'도 안 넣는다. 감탄사 '오'가 너무 흔하다.
 */
const DIGIT_WORDS: [RegExp, string][] = [
  [/파이브/g, '5'],
  [/세븐/g, '7'],
  [/에잇|에이트/g, '8'],
  [/나인/g, '9'],
  [/식스/g, '6'],
  [/쓰리/g, '3'],
];

/**
 * 짧아서 딴 낱말을 깨는 숫자들.
 *
 * "포"를 그냥 바꾸면 포르쉐가 "4르쉐"가 되고, "투"를 바꾸면 투싼이 "2싼"이 된다.
 * 이런 건 영문자 바로 뒤에 붙었을 때만 숫자로 본다 — "케이 포"(K4)처럼 글자를 읽고
 * 이어서 숫자를 읽는 자리에만 나오기 때문이다.
 */
const DIGIT_AFTER_LETTER: [RegExp, string][] = [
  [/([A-Z])포어?/g, '$14'],
  [/([A-Z])투우?/g, '$12'],
  [/([A-Z])텐/g, '$110'],
  [/([A-Z])원/g, '$11'],
  [/([A-Z])트리/g, '$13'],
];

/**
 * 차명을 견주기 좋은 꼴로.
 *
 * 띄어쓰기를 다 지우고 대문자로 맞춘 다음, 한글로 적힌 영어와 영어로 읽은 숫자를 되돌린다.
 * "S M 파이브" 와 "SM5" 가 여기서 같은 글자가 된다.
 */
export function normalizeSpeech(text: string): string {
  let out = text.toUpperCase().replace(/\s+/g, '');
  for (const [re, to] of LETTER_WORDS) out = out.replace(re, to);
  for (const [re, to] of DIGIT_AFTER_LETTER) out = out.replace(re, to);
  for (const [re, to] of DIGIT_WORDS) out = out.replace(re, to);
  return out;
}

/* ── 값 ─────────────────────────────────────── */

const SINO: Record<string, number> = { 영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
const UNIT: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };

/**
 * "삼천이백사십" → 3240.
 *
 * 자리값을 왼쪽부터 쌓는다. "십"처럼 앞에 수가 없으면 1로 본다("십만" = 10만).
 */
function sinoToNumber(korean: string): number {
  let total = 0;
  let current = 0;
  for (const ch of korean) {
    if (ch in SINO) {
      current = SINO[ch];
      continue;
    }
    if (ch in UNIT) {
      total += (current || 1) * UNIT[ch];
      current = 0;
    }
  }
  return total + current;
}

/**
 * 말에서 값을 줍는다 — 만원 단위로.
 *
 * "500만 원", "오백만 원", "삼천이백사십만 원", "3천만원" 이 다 같은 자리로 온다.
 * 값을 물어보는 전화가 많은데("500만원짜리 있어요?"), 지금까지는 이걸 못 알아들어서
 * 아무 차도 못 짚었다.
 *
 * 억은 만원으로 펴서 담는다 — 1억2천 = 12000(만원).
 */
export function parseManwon(text: string): number[] {
  const out = new Set<number>();
  const t = text.replace(/\s+/g, '');

  // 숫자로 적힌 것 — "500만", "3천만", "1억2천"
  for (const m of t.matchAll(/(\d+)억(?:(\d+)천)?|(\d+)천만|(\d+)만/g)) {
    if (m[1]) out.add(Number(m[1]) * 10000 + Number(m[2] ?? 0) * 1000);
    else if (m[3]) out.add(Number(m[3]) * 1000);
    else if (m[4]) out.add(Number(m[4]));
  }

  // 한글로 적힌 것 — "오백만", "삼천이백사십만", "일억이천"
  for (const m of t.matchAll(/([영일이삼사오육륙칠팔구십백천]+)억(?:([영일이삼사오육륙칠팔구십백천]+)천)?/g)) {
    out.add(sinoToNumber(m[1]) * 10000 + (m[2] ? sinoToNumber(m[2]) * 1000 : 0));
  }
  for (const m of t.matchAll(/([영일이삼사오육륙칠팔구십백천]+)만/g)) {
    const n = sinoToNumber(m[1]);
    if (n > 0) out.add(n);
  }

  // 값으로 보기 어려운 것은 버린다 — 50만원짜리 차도, 10억짜리 차도 우리 목록엔 없다
  return [...out].filter(n => n >= 100 && n <= 30000);
}
