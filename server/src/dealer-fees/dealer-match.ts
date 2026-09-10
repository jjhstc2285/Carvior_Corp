/**
 * 영업소 이름 맞추기.
 *
 * 장부에 적은 이름과 카비어에서 넘어오는 이름이 다르다.
 *
 *   장부      "비엠더블유 인천(구월동)"      "기아 노벨대리점"      "도요타 용산"
 *   카비어    "비엠 인천 김철수"             "기아노벨권우진"       "토요타용산 박영희"
 *
 * 카비어 쪽은 딜러 이름까지 붙여 적는 데다, 브랜드를 부르는 말이 제각각이다 —
 * BMW를 비엠·비엠더블유·바바리안으로, 토요타를 도요타로 적는다.
 * 그래서 글자를 통째로 견주면 거의 안 맞는다.
 *
 * 브랜드와 지점을 따로 떼어 견준다.
 *  - 브랜드가 둘 다 있는데 다르면 다른 곳이다(기아 용산 ≠ 벤츠 용산).
 *  - 브랜드가 같으면 지점 이름이 상대 쪽에 들어 있는지 본다.
 *
 * 지점이 없는 이름(랜드로버처럼 한 곳뿐인 브랜드)은 브랜드만 맞으면 같은 곳으로 본다.
 */

/** 같은 브랜드를 부르는 여러 말. 긴 것부터 봐야 '비엠더블유'가 '비엠'에 먼저 걸리지 않는다. */
const BRANDS: { key: string; names: string[] }[] = [
  { key: 'bmw', names: ['비엠더블유', '비엠더블류', '바바리안', 'bmw', '비엠', '도이치', '한독'] },
  { key: 'benz', names: ['메르세데스', '한성자동차', '벤츠', 'benz'] },
  { key: 'audi', names: ['아우디', 'audi'] },
  { key: 'vw', names: ['폭스바겐', '폭바', 'volkswagen', 'vw'] },
  { key: 'ford', names: ['포드', 'ford'] },
  { key: 'porsche', names: ['포르쉐', 'porsche'] },
  { key: 'volvo', names: ['볼보', 'volvo'] },
  { key: 'kia', names: ['기아', 'kia'] },
  { key: 'toyota', names: ['토요타', '도요타', 'toyota'] },
  { key: 'lexus', names: ['렉서스', 'lexus'] },
  { key: 'byd', names: ['byd', '비와이디'] },
  { key: 'cadillac', names: ['캐딜락', 'cadillac'] },
  { key: 'jeep', names: ['지프', 'jeep'] },
  { key: 'landrover', names: ['랜드로버', '랜드로바', 'landrover'] },
  { key: 'hyundai', names: ['현대', 'hyundai'] },
  // 르노·삼성은 '르노삼성'으로 붙여 쓰던 시절 이름이 남아 있어 한 브랜드로 본다.
  { key: 'renault', names: ['르노삼성', '삼성자동차', '르노', 'renault'] },
];

/**
 * 지점 이름이 아닌 말.
 *
 * '대리점' · '전시장' 같은 꼬리와 직함이 붙어 온다. 이걸 지점으로 세면
 * '기아 노벨대리점'이 '벤츠 부천대리점'과 맞아버린다.
 */
const NOISE = [
  '대리점',
  '전시장',
  '지점',
  '영업소',
  '자동차',
  '통합운영',
  '상조회',
  '상조회장',
  '팀장님',
  '차장님',
  '과장님',
  '팀장',
  '차장',
  '과장',
  '딜러',
  '님',
  '점',
  '팀',
];

/** 띄어쓰기·괄호·기호를 걷어내고 소문자로. 괄호 안도 지점이라 지우지 않고 푼다. */
export function normalizeDealer(name: string): string {
  return name
    .replace(/[()[\]{}·,~\-–—/|]+/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 이름에 들어 있는 브랜드. 없으면 null — 브랜드를 안 적은 이름도 있다. */
export function brandOf(name: string): string | null {
  const n = normalizeDealer(name);
  return BRANDS.find((b) => b.names.some((x) => n.includes(x)))?.key ?? null;
}

/**
 * 지점을 나타내는 말만 남긴다.
 *
 * 브랜드·꼬리·숫자를 걷어낸 뒤 두 글자 이상만 쓴다. 한 글자는 아무 데나 걸린다.
 * 사람 이름이 섞여 들어오는 건 어쩔 수 없다 — 장부 쪽 이름에서만 뽑아 쓰므로
 * 장부에 사람 이름을 안 적으면 문제가 안 된다.
 */
export function placesOf(name: string): string[] {
  let rest = name
    .replace(/[()[\]{}·,~\-–—/|]+/g, ' ')
    .replace(/\d+/g, ' ')
    .toLowerCase();

  for (const b of BRANDS) for (const x of b.names) rest = rest.split(x).join(' ');
  for (const x of NOISE) rest = rest.split(x).join(' ');

  return rest
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

/**
 * 장부 한 곳이 이 이름과 얼마나 맞는가. 안 맞으면 null.
 *
 * 점수를 매기는 이유는 한 이름이 여러 장부에 걸리기 때문이다.
 * '벤츠부천안지훈'에는 '부천'도 '천안'도 들어 있다 — 글자만 보면 둘 다 맞다.
 * 앞에서 걸리고 길게 걸리는 쪽이 진짜다('부천'이 0번째, '천안'이 1번째).
 */
function scoreMatch(ledgerName: string, otherName: string): number | null {
  const other = normalizeDealer(otherName);
  if (other.length < 2) return null;

  const ledgerBrand = brandOf(ledgerName);
  const otherBrand = brandOf(otherName);

  // 브랜드가 둘 다 있는데 다르면 볼 것도 없다 — 기아 용산과 벤츠 용산은 다른 곳이다.
  if (ledgerBrand && otherBrand && ledgerBrand !== otherBrand) return null;

  const places = placesOf(ledgerName);

  // 지점을 안 적은 브랜드(랜드로버처럼 한 곳뿐인 곳)는 브랜드만 맞으면 같은 곳으로 본다.
  // 점수는 낮게 준다 — 지점까지 맞는 장부가 있으면 그쪽이 먼저다.
  if (places.length === 0) {
    return ledgerBrand && ledgerBrand === otherBrand ? 1 : null;
  }

  let best: number | null = null;
  for (const p of places) {
    const at = other.indexOf(p);
    if (at < 0) continue;
    // 브랜드를 안 적어 온 이름은 지점만으로는 약하다 — 앞에서 걸릴 때만 인정한다.
    if (!otherBrand && at > 2) continue;
    // 길게 걸릴수록, 앞에서 걸릴수록 높다.
    const score = p.length * 100 - at;
    if (best == null || score > best) best = score;
  }
  return best;
}

/**
 * 장부의 영업소와 카비어(또는 매입처)의 이름이 같은 곳인가.
 *
 * 장부 이름을 기준으로 본다 — 그쪽이 사람 이름 없이 깨끗하게 적혀 있다.
 */
export function dealerMatches(ledgerName: string, otherName: string): boolean {
  return scoreMatch(ledgerName, otherName) != null;
}

/**
 * 이 이름이 어느 장부의 것인지 하나만 고른다.
 *
 * 한 이름을 여러 곳에 세면 실적이 부풀어, 끊어도 되는 곳이 멀쩡해 보인다.
 * 제일 잘 맞는 한 곳에만 붙인다. 똑같이 맞으면 장부 이름이 긴 쪽이 더 자세한 것이다
 * ('랜드로버 대치'가 '랜드로버'보다 자세하다).
 */
export function bestMatch<T extends { id: string; dealerName: string }>(
  otherName: string,
  ledgers: T[],
): T | null {
  let best: { row: T; score: number } | null = null;

  for (const row of ledgers) {
    const score = scoreMatch(row.dealerName, otherName);
    if (score == null) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && row.dealerName.length > best.row.dealerName.length)
    ) {
      best = { row, score };
    }
  }
  return best?.row ?? null;
}
