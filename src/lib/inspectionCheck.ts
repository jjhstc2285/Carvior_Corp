/**
 * 실차 검차.
 *
 * 차를 보러 가서 확인하는 것들과, 거기서 센 개수로 나올 상품화 비용을 미리 잡아 본다.
 * 현장에서 카톡으로 주고받던 걸 그대로 옮긴 것이라 항목도 부르는 이름도 그때 말 그대로다.
 *
 * 돈은 여기서 '예상'까지만 낸다 — 실제로 나간 돈은 매입 정산의 상품화 비용에 적는다.
 * 두 곳이 어긋나면 실제로 나간 쪽이 맞다.
 */

export interface CheckItem {
  key: string;
  label: string;
  /** 왜 보는지 — 처음 가는 사람이 뭘 확인해야 하는지 모른다 */
  hint?: string;
}

/** 차 보러 갈 때 확인하는 것 — 적어둔 차례가 곧 도는 차례다 */
export const CHECK_ITEMS: CheckItem[] = [
  { key: 'flashlight', label: '후레시 들고 가기', hint: '지하·야간에는 판·덴트가 안 보인다' },
  { key: 'blackbox', label: '블랙박스 선 빼기' },
  { key: 'engine', label: '시동 걸기' },
  { key: 'panel', label: '판 체크', hint: '판금한 자리가 몇 곳인지' },
  { key: 'dent', label: '덴트 체크' },
  { key: 'wheel', label: '휠 체크' },
  { key: 'glass', label: '유리 깨진 곳', hint: '앞유리 · 뒷유리 · 네비 · 뒷자리 TV' },
  { key: 'aircon', label: '에어컨 · 히터' },
  { key: 'seat', label: '전동시트' },
];

/**
 * 대산 제휴 단가가 걸리는 달 대수.
 *
 * 한 달에 이만큼 맡기면 단가가 내려간다. **차 한 대가 한 건이다** — 한 대에 판을 두 곳
 * 했어도 두 건이 아니다. 곳수로 세면 실제보다 빨리 채운 것처럼 보이고, 그 숫자를 믿고
 * 있다가 제휴를 못 받는다. 달마다 새로 센다.
 */
export const DAESAN_BULK_GOAL = 100; // 대

/** 판금 업체 — 단가가 갈린다 */
export const PREP_VENDORS = ['대산', 'KS'] as const;
export type PrepVendor = (typeof PREP_VENDORS)[number];

/**
 * 판금 한 곳 값(원).
 *
 * 수입차가 국산보다 비싸고, 업체마다 다르다. 대산은 그 달 100대(차 대수)를 채우면 국산이 내려간다.
 * 숫자가 바뀌면 여기만 고친다 — 화면 여러 곳에 흩어 두면 한 군데는 꼭 안 고쳐진다.
 */
export const PANEL_PRICE: Record<PrepVendor, { domestic: number; imported: number; bulkDomestic?: number; bulkImported?: number }> = {
  // 100대를 채우면 국산 7만, 수입 12만
  대산: { domestic: 80_000, imported: 130_000, bulkDomestic: 70_000, bulkImported: 120_000 },
  KS: { domestic: 90_000, imported: 120_000 },
};

/** 덴트 한 곳 값(원) — 크기로 갈린다 */
export const DENT_PRICE = { small: 40_000, large: 60_000 };

/**
 * 휠 복원 한 짝 값(원).
 *
 * 3만에서 5만 사이다. 상태를 보고 부르는 값이라 미리 못 박지 않고, 잡아 볼 때는
 * 가운데(4만)로 센다 — 청구서가 오면 그 값으로 덮어 적는다.
 */
export const WHEEL_PRICE = { min: 30_000, max: 50_000, mid: 40_000 };

/**
 * 기름이 얼마나 있는가.
 *
 * 있다/없다가 아니라 얼마나 있는지를 본다 — 가져오면서 넣고 와야 하는지가 거기서 갈린다.
 */
export const FUEL_LEVELS = ['많음', '적정', '없음'] as const;

export interface CheckCounts {
  panelCount: number;
  /** 휠 복원 몇 짝 */
  wheelCount?: number;
  dentCount: number;
  /** 큰 덴트가 몇 곳인지 — 나머지는 작은 것으로 본다 */
  dentLargeCount: number;
  vendor: string;
  imported: boolean;
  /** 대산이 그 달 100대를 채웠는가 — 채우면 단가가 내려간다 */
  bulk: boolean;
}

/** 판금 한 곳에 얼마인지 */
export function panelUnit(c: Pick<CheckCounts, 'vendor' | 'imported' | 'bulk'>): number {
  const table = PANEL_PRICE[c.vendor as PrepVendor];
  if (!table) return 0;
  if (c.imported) return (c.bulk && table.bulkImported) || table.imported;
  return (c.bulk && table.bulkDomestic) || table.domestic;
}

/**
 * 센 개수로 잡아 본 상품화 비용(원).
 *
 * 큰 덴트를 먼저 세고 남은 만큼을 작은 것으로 본다 — 큰 것 개수가 전체를 넘으면 전부 큰 것이다.
 */
export function estimateCost(c: CheckCounts): { panel: number; dent: number; wheel: number; total: number } {
  const large = Math.min(Math.max(c.dentLargeCount, 0), Math.max(c.dentCount, 0));
  const small = Math.max(c.dentCount - large, 0);

  const panel = panelUnit(c) * Math.max(c.panelCount, 0);
  const dent = large * DENT_PRICE.large + small * DENT_PRICE.small;
  const wheel = WHEEL_PRICE.mid * Math.max(c.wheelCount ?? 0, 0);
  return { panel, dent, wheel, total: panel + dent + wheel };
}

/** 저장은 '확인한 항목 키를 쉼표로' — 항목이 늘어도 칸을 안 늘린다 */
export function parseChecked(value: string): Set<string> {
  return new Set((value ?? '').split(',').map(v => v.trim()).filter(Boolean));
}

export function serializeChecked(keys: Set<string>): string {
  // 적어둔 차례대로 — 저장한 글자가 사람마다 달라지면 나중에 비교가 안 된다
  return CHECK_ITEMS.filter(i => keys.has(i.key)).map(i => i.key).join(',');
}

/**
 * 적어 넣은 업체 이름에서 판금집을 알아본다.
 *
 * 정산에는 '대산판집', '대산 판금', 'KS판집'처럼 사람마다 다르게 적는다. 이름을 붙여
 * 쓰든 띄어 쓰든 같은 집으로 본다 — 못 알아보면 단가를 못 찾아 금액이 안 채워진다.
 */
export function vendorOfName(name: string): PrepVendor | null {
  const clean = (name ?? '').replace(/\s/g, '').toLowerCase();
  if (!clean) return null;
  if (clean.includes('대산')) return '대산';
  if (clean.includes('ks') || clean.includes('케이에스')) return 'KS';
  return null;
}

/**
 * 판금 비용을 잡아 준다.
 *
 * 업체를 알아보면 그 집 단가로, 못 알아보면 두 집 평균으로 낸다 — 정산에 적을 때는
 * 대개 어디 맡길지 이미 정해져 있지만, 아직 안 정했어도 얼추 잡히는 편이 낫다.
 */
export function panelCost(name: string, panelCount: number, imported: boolean, bulk = false): number {
  const vendor = vendorOfName(name);
  if (panelCount <= 0) return 0;

  if (vendor) return panelUnit({ vendor, imported, bulk }) * panelCount;

  const units = PREP_VENDORS.map(v => panelUnit({ vendor: v, imported, bulk }));
  const average = Math.round(units.reduce((sum, u) => sum + u, 0) / units.length);
  return average * panelCount;
}
