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

/** 재고금융을 받는 캐피탈사. */
export const CAPITAL_COMPANIES = [
  '우리금융',
  '메리츠',
  '제이비우리',
  '새마을엠지',
  '하나캐피탈',
  'KB캐피탈',
  '현대캐피탈',
  'BMW',
] as const;

/**
 * 캐피탈사별 상환일.
 *
 * 갚는 날이 회사마다 정해져 있다 — 우리금융은 다섯 달 뒤 8일, KB캐피탈은 다섯 달 뒤 20일,
 * 현대캐피탈은 여섯 달 뒤 25일 하는 식이다.
 * BMW만 정해진 날이 없어 넉 달 뒤 같은 날에 갚는다.
 *
 * 할부사는 손으로 적는 칸이라 '우리' · '우리금융' · '(주)우리금융' 이 다 들어온다.
 * 이름을 통째로 견주지 않고 들어 있는 말로 찾는다.
 *
 * ⚠️ 차례가 뜻을 가진다 — '제이비우리'에 '우리'가 들어 있어서 제이비를 먼저 봐야 한다.
 */
export const REPAY_RULES: { keywords: string[]; label: string; months: number; day: number | null }[] = [
  { keywords: ['제이비', 'JB', 'jb'], label: '제이비우리', months: 5, day: 14 },
  { keywords: ['우리'], label: '우리금융', months: 5, day: 8 },
  { keywords: ['메리츠'], label: '메리츠', months: 5, day: 10 },
  { keywords: ['새마을', 'MG', 'mg', '엠지'], label: '새마을엠지', months: 5, day: 14 },
  { keywords: ['하나'], label: '하나캐피탈', months: 5, day: 15 },
  { keywords: ['KB', 'kb', '케이비', '국민'], label: 'KB캐피탈', months: 5, day: 20 },
  { keywords: ['현대'], label: '현대캐피탈', months: 6, day: 25 },
  // 알페라(Alphera)는 BMW 쪽 금융이다 — 장부에 그 이름으로 적혀 온다
  { keywords: ['BMW', 'bmw', '비엠', '알페라'], label: 'BMW', months: 4, day: null },
];

export function repayRuleOf(capital: string) {
  const name = capital.replace(/\s+/g, '');
  if (!name) return null;
  return REPAY_RULES.find(r => r.keywords.some(k => name.includes(k))) ?? null;
}

/**
 * 상환일자를 낸다 — 기준일로부터 정해진 달 수 뒤, 그 달의 정해진 날.
 *
 * 정해진 날이 없는 곳(BMW)은 넉 달 뒤 같은 날이다.
 * 모르는 할부사면 null — 넘겨짚어 날짜를 적어두면 그게 맞는 줄 알고 넘어간다.
 */
export function suggestRepayDate(capital: string, baseDate: string | dayjs.Dayjs = dayjs()): string | null {
  const rule = repayRuleOf(capital);
  if (!rule) return null;

  const base = dayjs(baseDate);
  if (!base.isValid()) return null;

  const due = base.add(rule.months, 'month');
  // 그 달에 없는 날이면(2월 30일 같은) 그 달 마지막 날로 잡는다.
  const day = rule.day == null ? due.date() : Math.min(rule.day, due.daysInMonth());
  return due.date(day).format('YYYY-MM-DD');
}

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

/**
 * 연식만으로 10년차 경계에 걸리는가.
 *
 * 이 해에 태어난 차만 등록증을 봐야 갈린다. 그 밖의 차는 등록 월이 언제든 결론이 같아서
 * 실차 확인자에게 굳이 묻지 않는다 — 물을 게 늘면 아무것도 안 적게 된다.
 */
export function needsRegistrationCheck(modelYear: string, today = dayjs()): boolean {
  const year = toYear(modelYear);
  return year != null && today.year() - year === MAX_AGE_YEARS;
}

export interface StockDeadline {
  /** 재고금융이 가능한 마지막 날 — 최초등록일 + 10년 */
  date: string;
  /** 이미 지났는가 */
  passed: boolean;
  /** 남은(또는 지난) 날수 */
  days: number;
}

/**
 * 등록증상 최초등록일로 재고 가능 기한을 낸다.
 *
 * 실차 확인자가 "16.3월" 이라고 적는 순간 2026년 3월이 기한이라는 게 보여야 한다.
 * 오늘이 9월이면 이미 반년이 지난 것이고, 그건 적고 나서 알 게 아니라 적으면서 알 일이다.
 */
export function stockDeadline(firstRegisteredOn: string, today = dayjs()): StockDeadline | null {
  const from = dayjs(firstRegisteredOn);
  if (!from.isValid()) return null;

  const date = from.add(MAX_AGE_YEARS, 'year');
  const days = date.diff(today.startOf('day'), 'day');
  return { date: date.format('YYYY-MM-DD'), passed: days <= 0, days: Math.abs(days) };
}


/**
 * 상환일이 얼마나 급한가.
 *
 * 재고금융은 상환일까지 팔지 못하면 그 돈을 그냥 갚아야 한다. 그런데 정작 차를 파는
 * 사람(상담·광고)은 재고금융 화면을 안 본다. 그래서 판정만 여기 두고 파는 화면들에
 * 같은 라벨을 붙인다 — 어디서 보든 같은 기준이어야 한다.
 *
 * 상환일이 없거나 아직 한 달 넘게 남았으면 null 이다. 급하지 않은 걸 굳이 칠하면
 * 정작 급한 게 안 보인다.
 */
export type RepayUrgency = { level: 'passed' | 'urgent' | 'soon'; days: number; date: string };

/** 며칠 안쪽이면 급한 것으로 볼지 */
export const REPAY_URGENT_DAYS = 7;
export const REPAY_SOON_DAYS = 30;

export function repayUrgency(repayDate: string | null | undefined, today = dayjs()): RepayUrgency | null {
  if (!repayDate) return null;
  const date = dayjs(repayDate);
  if (!date.isValid()) return null;

  const days = date.diff(today.startOf('day'), 'day');
  if (days < 0) return { level: 'passed', days: -days, date: repayDate };
  if (days <= REPAY_URGENT_DAYS) return { level: 'urgent', days, date: repayDate };
  if (days <= REPAY_SOON_DAYS) return { level: 'soon', days, date: repayDate };
  return null;
}

/** 라벨에 적을 말 — "상환 3일 남음" / "상환 2일 지남" */
export function repayLabel(u: RepayUrgency): string {
  if (u.level === 'passed') return `상환 ${u.days}일 지남`;
  return u.days === 0 ? '오늘 상환' : `상환 ${u.days}일 남음`;
}

/** 색. 지난 것과 임박한 것은 빨강, 한 달 안쪽은 주황. */
export const REPAY_BADGE_CLASS: Record<RepayUrgency['level'], string> = {
  passed: 'border-red-300 bg-red-100 text-red-800',
  urgent: 'border-red-300 bg-red-50 text-red-700',
  soon: 'border-amber-300 bg-amber-50 text-amber-700',
};

/**
 * 파는 흐름의 어디쯤인가.
 *
 *   출고 예정 — 상담이 판매완료로 찍혔는데 아직 차가 안 나갔다.
 *              광고를 내리고 자리를 빼고 서류를 챙겨야 하는 구간이다.
 *   매도완료 — 매도일자를 적었다. 끝난 차다.
 *
 * 판매완료(상담)와 매도(차)를 나눈 이유: 계약이 끝난 것과 차가 실제로 나간 것이
 * 며칠씩 벌어지는데, 그 사이에 할 일이 있는 사람들이 따로 있다.
 */
export type SaleStage = 'RELEASE_PENDING' | 'SOLD';

export function saleStage(v: Pick<ManagedVehicle, 'soldDate' | 'releasePending'>): SaleStage | null {
  if (v.soldDate) return 'SOLD';
  return v.releasePending ? 'RELEASE_PENDING' : null;
}

export const SALE_STAGE_LABEL: Record<SaleStage, string> = {
  RELEASE_PENDING: '출고 예정',
  SOLD: '매도완료',
};

/** 출고 예정은 할 일이 남은 쪽이라 눈에 띄게, 매도완료는 끝난 차라 차분하게. */
export const SALE_STAGE_CLASS: Record<SaleStage, string> = {
  RELEASE_PENDING: 'border-violet-300 bg-violet-100 text-violet-800',
  SOLD: 'border-slate-200 bg-slate-100 text-slate-500',
};

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
