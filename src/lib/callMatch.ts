import type { ManagedVehicle } from '../types';

/**
 * 통화 내용에서 어떤 차를 보고 전화했는지 찾아낸다.
 *
 * 손님은 차를 "그 흰색 카니발이요", "2530", "아반떼 있어요?" 처럼 말한다. 상담원이
 * 그걸 듣고 목록에서 다시 눈으로 찾는 게 지금 하는 일인데, 말한 그대로는 목록의 표기와
 * 안 맞는다 — 목록에는 "기아 카니발 9인승", 번호는 "12가2530" 으로 적혀 있다.
 *
 * 그래서 세 갈래로 찾는다. 확실한 것부터 본다.
 *
 *   1. 번호 뒷자리 네 자리   — "2530" 이라고 말하면 그 차다. 거의 틀리지 않는다.
 *   2. 차명이 통째로 들어감  — "카니발" 이 말에 있고 차명에도 있다
 *   3. 낱말이 겹침           — "아반떼 씨엔세븐" 처럼 띄어 말한 것
 *
 * 맞는 차가 없으면 빈 손으로 돌려준다. 억지로 한 대를 집어 주면 엉뚱한 차를 보게 된다 —
 * 아무것도 안 주는 편이 낫다.
 */

export interface CallMatch {
  vehicle: ManagedVehicle;
  /** 왜 이 차라고 봤는지 — 화면에 그대로 띄운다. 사람이 납득해야 누른다 */
  reason: string;
  /** 확실한 순서대로 정렬하려고 둔다. 높을수록 확실하다 */
  score: number;
}

/**
 * 차명에서 뜻 없는 부스러기를 턴다.
 *
 * "더 뉴 아반떼 CN7 1.6 가솔린" 에서 손님이 말하는 건 "아반떼" 하나다. 세대 수식어와
 * 배기량·연료는 붙어 있어 봐야 겹치는 낱말만 늘린다.
 */
const NOISE = /(올\s*뉴|더\s*뉴|뉴)\s*|[\d.]+\s*(터보|가솔린|디젤|하이브리드)|\d세대|\(.*?\)/g;

/** 아무 차에나 붙어서 단서가 못 되는 낱말 */
const STOPWORDS = new Set(['자동차', '중고차', '차량', '승용', '승합', '인승', '풀옵션', '옵션', '흰색', '검정']);

function tokens(name: string): string[] {
  return name
    .replace(NOISE, ' ')
    .split(/[\s,·/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * 말 속에서 네 자리 숫자를 줍는다.
 *
 * 값이나 연식으로 말한 숫자가 섞인다 — "2016년식", "3000만원". 연식으로 읽히는 수와
 * 만 단위 값은 뺀다. 그래도 남는 게 번호일 가능성이 높다.
 */
function plateCandidates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d{4}/g)) {
    const n = m[0];
    const year = Number(n);
    if (year >= 1990 && year <= 2035) continue; // 연식
    out.add(n);
  }
  return [...out];
}

export function matchVehicles(callText: string, vehicles: ManagedVehicle[]): CallMatch[] {
  const text = callText.replace(/\s+/g, ' ');
  const plates = plateCandidates(text);
  const bare = text.replace(/\s/g, '');

  const found: CallMatch[] = [];

  for (const v of vehicles) {
    const model = (v.vehicleModel ?? '').trim();

    // 1. 번호 뒷자리 — 가장 확실하다
    if (v.plateTail && plates.includes(v.plateTail)) {
      found.push({ vehicle: v, reason: `번호 ${v.plateTail}`, score: 100 });
      continue;
    }

    if (!model) continue;

    // 2. 차명이 말에 통째로 들어갔다
    const modelBare = model.replace(/\s/g, '');
    if (modelBare.length >= 2 && bare.includes(modelBare)) {
      found.push({ vehicle: v, reason: `"${model}"`, score: 80 });
      continue;
    }

    // 3. 낱말이 겹친다 — 긴 낱말이 겹칠수록 믿을 만하다
    const hit = tokens(model).filter((t) => bare.includes(t.replace(/\s/g, '')));
    if (hit.length > 0) {
      const longest = Math.max(...hit.map((t) => t.length));
      // 두 글자 하나만 겹치는 건 우연이 잦다("K5" 가 "K5보다" 에 걸리는 식)
      if (hit.length >= 2 || longest >= 3) {
        found.push({ vehicle: v, reason: `"${hit.join(' ')}"`, score: 40 + hit.length * 5 + longest });
      }
    }
  }

  return found.sort((a, b) => b.score - a.score || (a.vehicle.vehicleModel ?? '').localeCompare(b.vehicle.vehicleModel ?? ''));
}
