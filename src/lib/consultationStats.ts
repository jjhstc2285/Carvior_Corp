import type { ConsultationKind, ConsultationStatus } from '../types';

/**
 * 상담을 어느 탭에 놓고, 전환율을 어떻게 세는가.
 *
 * 화면 여러 곳에서 같은 판단을 하기 때문에 규칙을 한 곳에 모은다 —
 * 목록에서 뺀 건이 전환율에는 들어가는 식으로 어긋나면 숫자를 믿을 수 없게 된다.
 */

/** 내용에 이 말이 있으면 수출 건으로 본다 */
export const EXPORT_KEYWORD = '수출';

/**
 * 이 상담이 실제로 어느 쪽인가.
 *
 * 등록할 때 종류를 알선으로 골라놓고 내용에 "수출"이라고 적는 일이 많다. 적은 사람이
 * 고른 것보다 적힌 내용이 사실에 가깝다 — 내용에 수출이 있으면 수출로 모은다.
 * 저장된 값은 건드리지 않는다. 내용을 고치면 따라 움직이고, 되돌리기도 쉽다.
 */
export function effectiveKind(c: { kind: ConsultationKind; content?: string | null }): ConsultationKind {
  if ((c.content ?? '').includes(EXPORT_KEYWORD)) return 'EXPORT';
  return c.kind;
}

/** 그 탭에 놓을 건인가 */
export function isOfKind(c: { kind: ConsultationKind; content?: string | null }, kind: ConsultationKind): boolean {
  return effectiveKind(c) === kind;
}

/**
 * 계약으로 세는 상태.
 *
 * 판매완료는 계약이 된 뒤 출고까지 끝난 것이라 당연히 계약에 든다.
 * 보류는 계약이 아직 안 된 것이고, 종결은 상담이 끝난 것이라 둘 다 계약이 아니다.
 */
export function isContracted(status: ConsultationStatus): boolean {
  return status === 'CONTRACTED' || status === 'SOLD';
}

/**
 * 전환율의 모수에 넣을 상태.
 *
 * 종결은 상담 자체가 끝난 건이라 뺀다 — 넣으면 오래된 상담을 정리할수록 전환율이
 * 떨어져서, 정리를 안 하는 쪽이 숫자가 좋아 보인다.
 * 보류는 계약이 미뤄진 것뿐이라 모수에 남기고, 몇 건인지 따로 보여준다.
 */
export function countsToward(status: ConsultationStatus): boolean {
  return status !== 'CLOSED';
}

export interface ConversionStat {
  /** 종결을 뺀 상담 수 */
  total: number;
  /** 계약 + 판매완료 */
  contracted: number;
  /** 계약보류 */
  onHold: number;
  /** 상담종결 — 모수에서 뺀 수 */
  closed: number;
  /** 계약 ÷ 모수 (%) */
  rate: number;
}

export function conversionOf(rows: { status: ConsultationStatus }[]): ConversionStat {
  let total = 0;
  let contracted = 0;
  let onHold = 0;
  let closed = 0;

  for (const r of rows) {
    if (r.status === 'CLOSED') {
      closed += 1;
      continue;
    }
    total += 1;
    if (isContracted(r.status)) contracted += 1;
    if (r.status === 'ON_HOLD') onHold += 1;
  }

  return { total, contracted, onHold, closed, rate: total > 0 ? Math.round((contracted / total) * 100) : 0 };
}
