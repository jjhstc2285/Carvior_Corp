import type { ManagedVehicle } from '../types';

/**
 * 차량번호 규칙과 분류 로직.
 * 서버 쪽 같은 규칙은 server/src/vehicles/vehicle.rules.ts 에 있다 — 고칠 땐 양쪽을 같이 본다.
 */

/** 허용 형식: "12가3456" / "123가4567" 두 가지뿐 */
export const PLATE_PATTERN = /^\d{2,3}[가-힣]\d{4}$/;

export const PLATE_MESSAGE = {
  format: '차량번호 형식을 확인해주세요.',
  duplicate: '동일한 차량번호가 있습니다.',
  notFound: '차량번호를 다시 확인해주세요.',
  unselected: '차량번호 선택박스를 체크해주세요.',
} as const;

export function normalizePlate(value: string): string {
  return value.replace(/\s+/g, '');
}

export function isValidPlate(value: string): boolean {
  return PLATE_PATTERN.test(value);
}

// ── 리스트 분류 ────────────────────────────────────────
// 체크박스 세 개 조합만으로 정해진다(저장하지 않고 매번 계산).

export type VehicleListKey = 'WAITING_PREP' | 'AD_PENDING' | 'MOVABLE' | 'BLOCKED';

export const VEHICLE_LIST_LABEL: Record<VehicleListKey, string> = {
  WAITING_PREP: '상품화 대기',
  AD_PENDING: '광고 예정',
  MOVABLE: '외부 이동 가능',
  BLOCKED: '이동금지',
};

export const VEHICLE_LIST_ORDER: VehicleListKey[] = ['WAITING_PREP', 'AD_PENDING', 'MOVABLE', 'BLOCKED'];

export const VEHICLE_LIST_STYLE: Record<VehicleListKey, string> = {
  WAITING_PREP: 'bg-slate-100 text-slate-600',
  AD_PENDING: 'bg-amber-50 text-amber-600',
  MOVABLE: 'bg-emerald-50 text-emerald-600',
  BLOCKED: 'bg-red-50 text-red-500',
};

type Flags = Pick<ManagedVehicle, 'prepared' | 'advertised' | 'moveBlocked'>;

/**
 * 이동금지는 다른 체크와 무관하게 최우선이다.
 * 그 외에는 상품화 → 광고완료 순서로 단계가 올라간다.
 *
 *  - 아무것도 안 켬            → 상품화 대기
 *  - 상품화만                  → 광고 예정
 *  - 상품화 + 광고완료         → 외부 이동 가능 (광고 예정에서는 빠진다)
 */
export function vehicleListOf(v: Flags): VehicleListKey {
  if (v.moveBlocked) return 'BLOCKED';
  if (v.prepared && v.advertised) return 'MOVABLE';
  if (v.prepared) return 'AD_PENDING';
  return 'WAITING_PREP';
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
