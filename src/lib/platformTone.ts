/**
 * 유입 경로 빛깔 — 엔카는 빨강, 차차차는 노랑….
 *
 * 경로 이름은 글자라 한 번에 안 읽힌다. 빛깔이 붙으면 그래프에서도 표에서도 같은 자리가
 * 같은 색으로 보여서, 이름을 읽기 전에 어디인지 알아본다.
 *
 * 그래서 색을 섞지 않고 한 군데 적어 둔다 — 그래프와 정산 표가 다른 색을 쓰면 빛깔이
 * 뜻을 잃는다.
 *
 * 인스타와 오토벨은 둘 다 보라로 정했는데, 한 그래프에 나란히 서면 갈리지 않는다.
 * 보라 안에서 조금 다른 두 가지를 쓴다 — 둘 다 보라로 읽히고 옆에 붙어도 구별된다.
 */

export interface PlatformTone {
  /** 막대·도넛에 칠하는 색 */
  bar: string;
  hex: string;
  /** 표에 붙는 알약 — 옅은 바탕에 진한 글자 */
  chip: string;
}

const TONE = {
  red: { bar: 'bg-red-500', hex: '#ef4444', chip: 'bg-red-50 text-red-700' },
  orange: { bar: 'bg-orange-500', hex: '#f97316', chip: 'bg-orange-50 text-orange-700' },
  yellow: { bar: 'bg-yellow-400', hex: '#facc15', chip: 'bg-yellow-50 text-yellow-700' },
  purple: { bar: 'bg-purple-500', hex: '#a855f7', chip: 'bg-purple-50 text-purple-700' },
  violet: { bar: 'bg-violet-600', hex: '#7c3aed', chip: 'bg-violet-50 text-violet-700' },
  blue: { bar: 'bg-blue-500', hex: '#3b82f6', chip: 'bg-blue-50 text-blue-700' },
  green: { bar: 'bg-green-500', hex: '#22c55e', chip: 'bg-green-50 text-green-700' },
  navy: { bar: 'bg-blue-900', hex: '#1e3a8a', chip: 'bg-blue-50 text-blue-900' },
  black: { bar: 'bg-slate-900', hex: '#0f172a', chip: 'bg-slate-200 text-slate-900' },
} satisfies Record<string, PlatformTone>;

/** 경로 이름 → 빛깔. 정해 둔 이름이다 */
const BY_NAME: Record<string, PlatformTone> = {
  엔카: TONE.red,
  기타: TONE.orange,
  차차차: TONE.yellow,
  인스타: TONE.purple,
  자사몰: TONE.blue,
  '114': TONE.green,
  사이트: TONE.navy,
  오토벨: TONE.violet,
  대표님소개: TONE.black,
};

/**
 * 적은 이름이 조금 달라도 같은 빛깔로 본다.
 *
 * 칸이 자유 입력이라 '엔ㅋ카', '엔카 채팅', '현대글로빌오토벨', '대표님손님' 처럼
 * 적혀 들어온다. 빛깔까지 따로 놀면 한 그래프에 엔카가 여러 색으로 흩어진다.
 *
 * 쌓인 값은 안 건드린다 — 빛깔을 고를 때만 느슨하게 본다.
 */
const LOOSE: [string, PlatformTone][] = [
  ['엔카', TONE.red],
  ['차차차', TONE.yellow],
  ['오토벨', TONE.violet],
  ['자사몰', TONE.blue],
  ['인스타', TONE.purple],
  ['사이트', TONE.navy],
  ['대표님', TONE.black],
  ['114', TONE.green],
];

/** 정해 둔 데가 아닌 곳 — 이름이 같으면 늘 같은 색이 나오게 글자로 고른다 */
const SPARE: PlatformTone[] = [
  { bar: 'bg-teal-500', hex: '#14b8a6', chip: 'bg-teal-50 text-teal-700' },
  { bar: 'bg-pink-500', hex: '#ec4899', chip: 'bg-pink-50 text-pink-700' },
  { bar: 'bg-lime-500', hex: '#84cc16', chip: 'bg-lime-50 text-lime-700' },
  { bar: 'bg-cyan-500', hex: '#06b6d4', chip: 'bg-cyan-50 text-cyan-700' },
  { bar: 'bg-amber-600', hex: '#d97706', chip: 'bg-amber-50 text-amber-700' },
];

/** 아직 안 적은 칸 — 경로가 아니라 빈칸이라 늘 회색이다 */
export const BLANK_TONE: PlatformTone = {
  bar: 'bg-slate-300',
  hex: '#cbd5e1',
  chip: 'bg-slate-100 text-slate-500',
};

export function platformTone(name: string): PlatformTone {
  const key = (name ?? '').trim();
  if (!key) return BLANK_TONE;
  if (BY_NAME[key]) return BY_NAME[key];

  for (const [part, tone] of LOOSE) {
    if (key.includes(part)) return tone;
  }

  let sum = 0;
  for (const ch of key) sum += ch.charCodeAt(0);
  return SPARE[sum % SPARE.length];
}
