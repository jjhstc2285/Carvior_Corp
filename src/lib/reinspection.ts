/**
 * 재검(성능점검 다시 받기) 시기.
 *
 * 이전(명의 이전)하고 넉 달이 지나면 그 차의 성능점검 기록은 더 못 쓴다. 주차장에
 * 서 있는 차는 팔릴 때까지 그대로 있으니, 넉 달이 지나는 줄 모르고 두는 일이 생긴다.
 * 이전일자를 기준으로 날짜만 세서 알려준다 — 사람이 달력을 세게 두지 않는다.
 *
 * 재검을 받고 나면 그날부터 다시 넉 달을 센다 — 받은 날을 적어두고 그 날짜로 센다.
 * 안 적혀 있으면 이전일자로 센다.
 *
 * 기준이 될 날짜가 없는 차는 아무 말도 안 한다. 셀 기준이 없는데 경고부터 띄우면
 * 진짜 지난 차가 그 속에 묻힌다.
 *
 * 서버 server/src/parking/reinspection.ts 와 같은 내용이다 — 고칠 땐 양쪽을 같이 본다.
 */

/** 이전일자로부터 몇 달 */
export const REINSPECT_MONTHS = 4;
/** 며칠 전부터 미리 알릴지 */
export const REINSPECT_SOON_DAYS = 14;

/** DUE = 넉 달이 지났다 · SOON = 곧 지난다 */
export type ReinspectLevel = 'SOON' | 'DUE';

export interface Reinspection {
  /** 다시 받아야 하는 날 — 이전일자 + 4개월 */
  dueOn: string;
  /** 그날까지 며칠. 이미 지났으면 음수 */
  daysLeft: number;
  /** 지난 지 며칠. 아직이면 0 */
  overdueDays: number;
  level: ReinspectLevel;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * YYYY-MM-DD 에 달을 더한다.
 *
 * 그 달에 없는 날(10월 31일 + 4개월 = 2월 31일)은 말일로 당긴다 —
 * Date 에 그냥 맡기면 3월 3일처럼 다음 달로 넘어가 버린다.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = m - 1 + months;
  const year = y + Math.floor(shifted / 12);
  const month = ((shifted % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** from 에서 to 까지 며칠. 시간대가 섞이지 않게 UTC 자정끼리만 뺀다. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * 넉 달을 어느 날부터 세는가 — 재검을 받았으면 그날, 아니면 이전일자.
 *
 * 재검을 받은 차는 성능점검 기록이 그날 새로 생긴 것이라 이전일자는 더 볼 일이 없다.
 */
export function reinspectBaseOf(v: {
  transferDate?: string | null;
  lastInspectedOn?: string | null;
}): string | null {
  return (v.lastInspectedOn ?? '').trim() || (v.transferDate ?? '').trim() || null;
}

/**
 * 이 차가 재검 대상인지. 아직 멀었으면 null.
 *
 * @param baseDate 재검일자 또는 이전일자 (YYYY-MM-DD). 없으면 null
 * @param today 오늘 (YYYY-MM-DD)
 */
export function reinspectionOf(baseDate: string | null | undefined, today: string): Reinspection | null {
  const from = (baseDate ?? '').trim();
  if (!DATE.test(from) || !DATE.test(today)) return null;

  const dueOn = addMonths(from, REINSPECT_MONTHS);
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft > REINSPECT_SOON_DAYS) return null;

  return {
    dueOn,
    daysLeft,
    overdueDays: daysLeft < 0 ? -daysLeft : 0,
    // 당일도 지난 것으로 본다 — 그날 아침에 '아직 괜찮다'고 하면 하루를 넘긴다.
    level: daysLeft <= 0 ? 'DUE' : 'SOON',
  };
}

/** 화면에 띄울 짧은 말 */
export function reinspectLabel(r: Reinspection): string {
  if (r.level === 'DUE') return r.overdueDays === 0 ? '재검 필요' : `재검 필요 ${r.overdueDays}일 지남`;
  return `재검 ${r.daysLeft}일 전`;
}
