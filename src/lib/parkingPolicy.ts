import { PARKING_LOTS } from './parkingLayout';
import type { ManagedVehicle } from '../types';

/**
 * 차량 외부 주차장 이동 우선순위 — 대표님이 정리해 주신 배치 기준을 그대로 옮겼다.
 *
 * 적용 순서가 곧 우선순위다. 위에서부터 맞는 게 나오면 거기서 끝난다.
 *   1단계 전용 주차장 여부 — SUV·화물 / 소형차 / 전기차 / MINI / 택시·LPG
 *   2단계 판매 유형       — 수출 → 고색동 A·B, 일반광고 → 고색동 C
 *   3단계 차량 가격       — 4,000만원 이상 → 배양동 창고, 2,500만원 이하 → 외부 우선
 *   4단계 기타            — 잔여 공간, 현장 판단
 *
 * 규칙을 배열 하나로 둔 이유: 순서를 바꾸거나 조건을 하나 더 다는 일이 잦을 텐데,
 * 코드 여기저기 흩어진 if 문을 고치는 것보다 이 표 한 곳을 고치는 게 안전하다.
 */

/** 사진의 주차장 이름 → 앱에 등록된 이름 */
export const POLICY_LOT = {
  평동: '평동 20-23',
  팬슬: '고색동 218-1 (팬슬)',
  고색동A: '고색동 213-4',
  고색동B: '고색동 205-1',
  고색동C: '고색동 203-2',
  배양동외부: '배양동 58-13',
  배양동창고: '배양동 창고',
  지상5층: '5F-B19',
  B2: 'B2F-B08',
} as const;

/** 고가차 기준(만원) — 이 이상은 배양동 창고 */
export const HIGH_PRICE_MANWON = 4000;
/** 저가차 기준(만원) — 이 이하는 외부 주차장 우선 */
export const LOW_PRICE_MANWON = 2500;

export interface LotSuggestion {
  /** 우선 배치할 주차장. 여러 곳이면 앞에서부터 빈 자리를 찾는다 */
  lots: string[];
  /** 왜 여기인지 — 화면에 그대로 보여준다. 이유를 모르면 사람이 따르지 않는다 */
  reason: string;
  /** 사진의 몇 단계에서 정해졌는지 */
  step: 1 | 2 | 3 | 4;
}

const isElectric = (v: ManagedVehicle) => v.fuel.includes('전기');
const isLpg = (v: ManagedVehicle) => v.fuel.toUpperCase().includes('LPG');
const isMini = (v: ManagedVehicle) => /MINI|미니/i.test(v.vehicleModel);

const RULES: { when: (v: ManagedVehicle) => boolean; then: LotSuggestion }[] = [
  // ── 1단계 전용 주차장 ──
  {
    when: isMini,
    then: { lots: [POLICY_LOT.B2], reason: 'MINI 전용', step: 1 },
  },
  {
    when: isElectric,
    then: { lots: [POLICY_LOT.지상5층], reason: '전기차 전용', step: 1 },
  },
  {
    when: v => v.bodyType === 'SUV' || v.bodyType === 'TRUCK',
    then: { lots: [POLICY_LOT.평동], reason: 'SUV·화물 — 공간 점유가 커서 평동 우선', step: 1 },
  },
  {
    when: v => v.bodyType === 'COMPACT',
    then: { lots: [POLICY_LOT.팬슬], reason: '소형차', step: 1 },
  },
  {
    when: v => v.isTaxi || isLpg(v),
    then: { lots: [POLICY_LOT.배양동외부], reason: '택시·LPG', step: 1 },
  },

  // ── 2단계 판매 유형 ──
  {
    when: v => v.saleType === 'EXPORT',
    then: { lots: [POLICY_LOT.고색동A, POLICY_LOT.고색동B], reason: '수출 차량 — 고색동 A·B', step: 2 },
  },

  // ── 3단계 차량 가격 ──
  // 판매 유형보다 뒤에 둔 건 사진의 적용 순서를 그대로 따른 것이다.
  {
    when: v => v.priceManwon >= HIGH_PRICE_MANWON,
    then: {
      lots: [POLICY_LOT.배양동창고],
      reason: `${HIGH_PRICE_MANWON.toLocaleString()}만원 이상 고가 — 배양동 창고`,
      step: 3,
    },
  },
  {
    when: v => v.priceManwon > 0 && v.priceManwon <= LOW_PRICE_MANWON,
    then: {
      lots: PARKING_LOTS.filter(l => l.group === '외부').map(l => l.lot),
      reason: `${LOW_PRICE_MANWON.toLocaleString()}만원 이하 중저가 — 외부 주차장 우선`,
      step: 3,
    },
  },
  {
    when: v => v.advertised,
    then: { lots: [POLICY_LOT.고색동C], reason: '일반광고 차량 — 고색동 C', step: 2 },
  },
];

/** 4단계 — 위에서 걸리는 게 없으면 잔여 공간에 둔다. 자동으로 정하지 않는다. */
const FALLBACK: LotSuggestion = {
  lots: [],
  reason: '별도 조건 미해당 — 잔여 공간·현장 상황에 따라 배치',
  step: 4,
};

export function suggestLot(vehicle: ManagedVehicle): LotSuggestion {
  // 이동 금지 차는 어디로도 보내지 않는다. 배치 기준보다 앞선다.
  if (vehicle.moveBlocked) {
    return { lots: [], reason: '외부 이동 금지', step: 1 };
  }
  return RULES.find(r => r.when(vehicle))?.then ?? FALLBACK;
}

/** 지금 서 있는 자리가 기준에 맞는지. 추천이 없으면(4단계) 어디에 있든 어긋난 게 아니다. */
export function isPlacedWell(suggestion: LotSuggestion, currentLot: string | null): boolean {
  if (suggestion.lots.length === 0) return true;
  return currentLot != null && suggestion.lots.includes(currentLot);
}
