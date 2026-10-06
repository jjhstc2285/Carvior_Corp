/**
 * 방문 약속을 한 시간짜리 자리로 바꾼다.
 *
 * 방문 시각은 "오후 3시~4시", "세시쯤", "15:00" 처럼 손님이 말한 그대로 적혀 있다.
 * 나눠 맡기려면 몇 시 자리인지는 알아야 한다 — 한 사람이 그 시간에 손님을 맞고 있으면
 * 다른 손님은 못 받기 때문이다.
 *
 * 범위로 적힌 건 시작 시각으로 본다("3시~4시"는 3시 자리다). 두루뭉술하게 때만 말한
 * 것도 자리는 잡아 준다 — 못 잡겠다고 비워 두면 정작 사람이 많이 오는 날에 아무도
 * 안 나뉜다.
 */

/** 한글로 읽은 시각 — "세시" */
const HOUR_WORDS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12,
};

/** 때만 말한 것 — "오전에 갈게요" */
const PART_OF_DAY: { word: RegExp; hour: number }[] = [
  { word: /새벽/, hour: 8 },
  { word: /아침/, hour: 9 },
  { word: /오전/, hour: 10 },
  { word: /점심|낮/, hour: 12 },
  { word: /오후/, hour: 14 },
  { word: /저녁|밤/, hour: 18 },
];

/**
 * 몇 시라고만 하면 오전인지 오후인지 고른다.
 *
 * 차 보러 오는 시간이다 — 새벽 두 시에 오지 않는다. 1시부터 7시까지는 오후로 본다.
 * (화면에서 쓰는 lib/visitParse.ts 와 같은 기준이다)
 */
function to24(hour: number, mark: string): number {
  if (/오전|아침|새벽/.test(mark)) return hour === 12 ? 0 : hour;
  if (/오후|저녁|밤/.test(mark)) return hour < 12 ? hour + 12 : hour;
  if (hour === 12) return 12;
  return hour >= 1 && hour <= 7 ? hour + 12 : hour;
}

/** 적힌 방문 시각 → 0~23. 아무것도 못 집으면 null */
export function visitHour(text: string | null | undefined): number | null {
  const line = (text ?? '').trim();
  if (!line) return null;

  const mark = /오전|오후|아침|점심|저녁|밤|새벽|낮/.exec(line)?.[0] ?? '';

  // 15:00 / 3:30
  const colon = /(\d{1,2})\s*:\s*(\d{2})/.exec(line);
  if (colon) {
    const h = Number(colon[1]);
    if (h >= 0 && h <= 23) return to24(h, mark);
  }

  // 3시 / 3시 반 / 3시~4시 — 범위면 앞 시각이다
  const num = /(\d{1,2})\s*시/.exec(line);
  if (num) {
    const h = Number(num[1]);
    if (h >= 0 && h <= 23) return to24(h, mark);
  }

  // 세시 / 네시 반
  const words = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|');
  const word = new RegExp(`(${words})\s*시`).exec(line);
  if (word) return to24(HOUR_WORDS[word[1]], mark);

  // 시각 없이 때만 말한 것
  return PART_OF_DAY.find((p) => p.word.test(line))?.hour ?? null;
}

export interface VisitToPlace {
  id: string;
  /** 적힌 방문 시각 그대로 */
  visitTime: string;
  /** 이미 정해진 담당 딜러 — 있으면 안 건드린다 */
  visitDealerId: string | null;
}

export interface Placement {
  id: string;
  dealerId: string;
  hour: number;
}

export interface AssignResult {
  /** 새로 정해진 것 */
  placed: Placement[];
  /** 시각을 못 읽어 못 나눈 건 */
  noTime: string[];
  /** 그 시간에 빈 사람이 없어 못 나눈 건 */
  noRoom: string[];
  /** 사람마다 몇 건을 맡았는가(이미 정해져 있던 것까지 센다) */
  load: Map<string, number>;
}

/**
 * 하루치 방문을 딜러들에게 고르게 나눈다.
 *
 * 규칙은 둘이다.
 *   ① 한 사람은 같은 시간대에 한 손님만 — 맞고 있는 동안 다른 손님은 못 받는다.
 *   ② 그 시간에 빈 사람 중 그날 제일 적게 맡은 사람에게 — 고르게 나뉘라고 두는 규칙이다.
 *
 * 이미 정해 둔 건은 그대로 두고 센다. 전화받은 사람이 "이 손님은 누구에게" 하고 찍어
 * 둔 걸 자동으로 뒤집으면, 자동 배정을 한 번 더 누를 때마다 담당이 바뀐다.
 *
 * 이른 시각부터 채운다 — 늦은 손님부터 자리를 잡으면 아침 손님이 갈 데가 없어진다.
 */
export function assignVisits(visits: VisitToPlace[], dealerIds: string[]): AssignResult {
  const load = new Map<string, number>(dealerIds.map((id) => [id, 0]));
  const busy = new Map<string, Set<number>>(dealerIds.map((id) => [id, new Set<number>()]));

  // 이미 정해진 것부터 자리에 앉힌다
  for (const v of visits) {
    if (!v.visitDealerId || !load.has(v.visitDealerId)) continue;
    load.set(v.visitDealerId, (load.get(v.visitDealerId) ?? 0) + 1);
    const hour = visitHour(v.visitTime);
    if (hour !== null) busy.get(v.visitDealerId)?.add(hour);
  }

  const placed: Placement[] = [];
  const noTime: string[] = [];
  const noRoom: string[] = [];

  // 이른 시각부터 채운다 — 늦은 손님부터 자리를 잡으면 아침 손님이 갈 데가 없어진다
  const waiting = visits
    .filter((v) => !v.visitDealerId)
    .map((v) => ({ ...v, hour: visitHour(v.visitTime) }))
    .sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99));

  for (const v of waiting) {
    if (v.hour === null) {
      noTime.push(v.id);
      continue;
    }
    const free = dealerIds.filter((id) => !busy.get(id)?.has(v.hour as number));
    if (free.length === 0) {
      noRoom.push(v.id);
      continue;
    }
    // 그날 제일 적게 맡은 사람. 같으면 목록 차례대로 — 늘 같은 사람부터 가지 않는다
    const pick = free.reduce((best, id) => ((load.get(id) ?? 0) < (load.get(best) ?? 0) ? id : best), free[0]);

    placed.push({ id: v.id, dealerId: pick, hour: v.hour });
    load.set(pick, (load.get(pick) ?? 0) + 1);
    busy.get(pick)?.add(v.hour);
  }

  return { placed, noTime, noRoom, load };
}
