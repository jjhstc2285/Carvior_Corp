import dayjs from 'dayjs';
import type { ManagedVehicle } from '../types';

/**
 * 재고금융(제시) 가능 여부.
 *
 * 캐피탈에 제시할 수 있는 차의 조건이다 — 10년 이내, 주행거리 20만km 미만.
 * 저장하지 않고 볼 때마다 가린다. 기준이 바뀌면 여기만 고치면 되고, 지난 기록이
 * 옛 기준으로 굳어 있지 않는다.
 */

export const MAX_AGE_YEARS = 10;
export const MAX_MILEAGE_KM = 200_000;

/** 캐피탈사 — 매입리스트의 재고가능금액 칸과 같은 곳들이다. */
export const CAPITAL_COMPANIES = ['BMW', '우리', '케이비', '메리츠', '하나', '현대'] as const;

export type OfferEligibility =
  | { ok: true; age: number }
  /** 왜 안 되는지 — 화면에 그대로 보여준다 */
  | { ok: false; reason: string }
  /** 연식이나 주행거리를 아직 모른다 */
  | { ok: null; reason: string }
  /**
   * 딱 10년차라 등록증을 봐야 갈린다.
   *
   * 2026년에 2016년식이면 1월 등록은 이미 10년을 넘었고 12월 등록은 아직 9년이다.
   * 연식만으로는 알 수 없으니 최초등록일을 받아 다시 잰다.
   * 11년차는 어느 달이어도 넘으므로 여기 오지 않는다.
   */
  | { ok: 'check'; reason: string };

/** "2016", "16", "2016년" 처럼 제각각 적혀 온다 — 숫자만 뽑아 네 자리로 맞춘다. */
export function toYear(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) return 2000 + Number(digits);
  return null;
}

const OVER_MILEAGE = (km: number) =>
  `${km.toLocaleString()}km — ${(MAX_MILEAGE_KM / 10000).toLocaleString()}만km 이상`;

export function offerEligibility(vehicle: ManagedVehicle, today = dayjs()): OfferEligibility {
  // 재고금융을 안 쓰기로 한 차는 더 볼 것도 없다.
  if (vehicle.cashVehicle) return { ok: false, reason: '현금차량' };

  // 주행거리는 연식과 상관없이 걸리므로 먼저 본다.
  if (vehicle.mileage <= 0) return { ok: null, reason: '주행거리를 모릅니다' };
  if (vehicle.mileage >= MAX_MILEAGE_KM) return { ok: false, reason: OVER_MILEAGE(vehicle.mileage) };

  /*
   * 등록증상 최초등록일을 적어뒀으면 그걸로 정확히 잰다.
   * 연식은 해 단위라 같은 2016년식도 등록 월에 따라 열 달 넘게 벌어진다.
   */
  if (vehicle.firstRegisteredOn) {
    const months = today.diff(dayjs(vehicle.firstRegisteredOn), 'month');
    const years = Math.floor(months / 12);
    if (months >= MAX_AGE_YEARS * 12) {
      return { ok: false, reason: `${years}년 ${months % 12}개월 — ${MAX_AGE_YEARS}년 초과` };
    }
    return { ok: true, age: years };
  }

  const year = toYear(vehicle.modelYear);
  // 모르는 걸 '안 된다'고 하면 멀쩡한 차가 목록에서 빠진다. 모른다고 말한다.
  if (year == null) return { ok: null, reason: '연식을 모릅니다' };

  const age = today.year() - year;
  if (age > MAX_AGE_YEARS) return { ok: false, reason: `${age}년차 — ${MAX_AGE_YEARS}년 초과` };
  if (age === MAX_AGE_YEARS) {
    return { ok: 'check', reason: `${year}년식 — 등록증 최초등록일을 확인해 주세요` };
  }
  return { ok: true, age };
}
