import { normalizeSpeech, parseManwon } from './speechText';
import type { ManagedVehicle } from '../types';

/**
 * 통화 내용에서 어떤 차를 보고 전화했는지 찾아낸다.
 *
 * 손님은 차를 "그 흰색 카니발이요", "2530", "SM5 있어요?" 처럼 말한다. 상담원이 그걸
 * 듣고 목록에서 다시 눈으로 찾는 게 지금 하는 일인데, 받아 적힌 말은 목록의 표기와 안 맞는다.
 *
 * 실제 통화를 받아 보니 어긋나는 데가 두 군데였다.
 *
 *   "SM5 있어요?"      → 녹취에는 "S M 파이브 있어요?" 로 적힌다. 글자를 띄우고 숫자를
 *                        영어로 읽는다. 그대로 견주면 한 대도 못 찾는다.
 *   "500만원짜리 있어요?" → 값으로 묻는 전화가 많은데 값을 볼 줄 몰라서 아무것도 못 짚었다.
 *
 * 그래서 네 갈래로 찾는다. 확실한 것부터 본다.
 *
 *   1. 번호 뒷자리 네 자리   — "2530" 이라고 말하면 그 차다. 거의 틀리지 않는다.
 *   2. 차명이 통째로 들어감  — "카니발" 이 말에 있고 차명에도 있다
 *   3. 낱말이 겹침           — "아반떼 씨엔세븐" 처럼 띄어 말한 것
 *   4. 값이 비슷함           — "500만원" 이라고 하면 그 언저리 차들
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

/** 값으로 찾을 때 얼마나 벌려 볼지 — 손님이 부르는 값은 대개 어림수다 */
const PRICE_BAND = 0.2;

/** 값만 보고 짚어 줄 최대 대수 — 다 띄우면 고르는 게 아니라 훑는 일이 된다 */
const PRICE_MAX = 5;

function tokens(name: string): string[] {
  return name
    .replace(NOISE, ' ')
    .split(/[\s,·/]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * 말 속에서 네 자리 숫자를 줍는다.
 *
 * 값이나 연식으로 말한 숫자가 섞인다 — "2016년식", "3000만원". 연식으로 읽히는 수는
 * 뺀다. 값은 따로 보므로 여기서도 뺀다.
 */
function plateCandidates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\d{4})\s*(만|년|원)?/g)) {
    if (m[2]) continue; // 3000만 · 2016년 — 번호가 아니다
    const n = Number(m[1]);
    if (n >= 1990 && n <= 2035) continue; // 연식
    out.add(m[1]);
  }
  return [...out];
}

export function matchVehicles(callText: string, vehicles: ManagedVehicle[]): CallMatch[] {
  const text = callText.replace(/\s+/g, ' ');
  const plates = plateCandidates(text);
  /* 받아 적힌 말을 우리 표기로 되돌린 것 — "S M 파이브" 가 여기서 "SM5" 가 된다 */
  const spoken = normalizeSpeech(text);
  const prices = parseManwon(text);

  const found: CallMatch[] = [];
  const taken = new Set<string>();

  for (const v of vehicles) {
    const model = (v.vehicleModel ?? '').trim();

    // 1. 번호 뒷자리 — 가장 확실하다
    if (v.plateTail && plates.includes(v.plateTail)) {
      found.push({ vehicle: v, reason: `번호 ${v.plateTail}`, score: 100 });
      taken.add(v.id);
      continue;
    }

    if (!model) continue;
    const modelSpoken = normalizeSpeech(model);

    // 2. 차명이 말에 통째로 들어갔다
    if (modelSpoken.length >= 2 && spoken.includes(modelSpoken)) {
      found.push({ vehicle: v, reason: `"${model}"`, score: 80 });
      taken.add(v.id);
      continue;
    }

    // 3. 낱말이 겹친다 — 긴 낱말이 겹칠수록 믿을 만하다
    const hit = tokens(model).filter(t => {
      const t2 = normalizeSpeech(t);
      // 두 글자 영문·숫자 조각("K5")은 통째로만 인정한다 — "K5보다" 같은 데 걸린다
      return t2.length >= 2 && spoken.includes(t2);
    });
    if (hit.length > 0) {
      const longest = Math.max(...hit.map(t => normalizeSpeech(t).length));
      if (hit.length >= 2 || longest >= 3) {
        found.push({ vehicle: v, reason: `"${hit.join(' ')}"`, score: 40 + hit.length * 5 + longest });
        taken.add(v.id);
      }
    }
  }

  /*
    4. 값으로 찾기.

    "500만원짜리 있어요?" 처럼 차를 안 짚고 값만 부르는 전화가 많다. 이름으로 이미 짚은
    차가 있으면 값까지 들이대지 않는다 — 손님이 차를 말했는데 엉뚱한 값의 차를 같이
    띄우면 목록만 길어진다.
  */
  if (found.length === 0 && prices.length > 0) {
    const near = vehicles
      .filter(v => v.priceManwon > 0)
      .map(v => {
        const best = prices.reduce(
          (acc, p) => {
            const gap = Math.abs(v.priceManwon - p) / p;
            return gap < acc.gap ? { gap, p } : acc;
          },
          { gap: Infinity, p: 0 },
        );
        return { v, ...best };
      })
      .filter(x => x.gap <= PRICE_BAND)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, PRICE_MAX);

    for (const x of near) {
      if (taken.has(x.v.id)) continue;
      found.push({
        vehicle: x.v,
        reason: `${x.p.toLocaleString()}만원대 (${x.v.priceManwon.toLocaleString()}만원)`,
        // 값만으로는 이름만큼 못 믿는다 — 가까운 값일수록 조금 위로
        score: 30 - Math.round(x.gap * 100),
      });
    }
  }

  return found.sort(
    (a, b) => b.score - a.score || (a.vehicle.vehicleModel ?? '').localeCompare(b.vehicle.vehicleModel ?? ''),
  );
}
