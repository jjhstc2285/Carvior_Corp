/**
 * 프론트는 날짜를 'YYYY-MM-DD' 문자열로 주고받고, DB는 DATE 타입으로 저장한다.
 * 시간대 때문에 하루씩 밀리는 사고를 막으려고 항상 UTC 자정으로 고정해서 변환한다.
 */

export function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toDateOnlyOrNull(value?: string | null): Date | null {
  return value ? toDateOnly(value) : null;
}

export function formatDateOnlyOrNull(value: Date | null): string | null {
  return value ? formatDateOnly(value) : null;
}

/** 'YYYY-MM' → 해당 월의 [시작일, 다음달 1일) 범위 */
export function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}

/** 서버 기준 오늘 (KST) — 출퇴근 판정에 쓰므로 한국 시간 기준으로 계산한다. */
export function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 현재 시각 'HH:mm' (KST) */
export function nowTimeKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(11, 16);
}
