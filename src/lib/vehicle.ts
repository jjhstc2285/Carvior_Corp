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

export type VehicleListKey = 'WAITING_PREP' | 'MOVABLE' | 'BLOCKED';

export const VEHICLE_LIST_LABEL: Record<VehicleListKey, string> = {
  WAITING_PREP: '상품화 대기',
  MOVABLE: '외부 이동 가능',
  BLOCKED: '이동금지',
};

export const VEHICLE_LIST_ORDER: VehicleListKey[] = ['WAITING_PREP', 'MOVABLE', 'BLOCKED'];

export const VEHICLE_LIST_STYLE: Record<VehicleListKey, string> = {
  WAITING_PREP: 'bg-slate-100 text-slate-600',
  MOVABLE: 'bg-emerald-50 text-emerald-600',
  BLOCKED: 'bg-red-50 text-red-500',
};

type Flags = Pick<ManagedVehicle, 'prepared' | 'moveBlocked'>;

/**
 * 이동금지는 다른 체크와 무관하게 최우선이다.
 *
 *  - 아무것도 안 켬  → 상품화 대기
 *  - 상품화          → 외부 이동 가능
 *
 * 예전에는 상품화 다음에 광고완료를 한 번 더 켜야 '외부 이동 가능'이 됐는데, 광고 여부는
 * 광고팀이 따로 보는 값이라 차량 관리에서 두 번 체크할 이유가 없었다. 상품화 하나로 합쳤다.
 */
export function vehicleListOf(v: Flags): VehicleListKey {
  if (v.moveBlocked) return 'BLOCKED';
  return v.prepared ? 'MOVABLE' : 'WAITING_PREP';
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
