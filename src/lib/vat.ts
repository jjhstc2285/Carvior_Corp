import dayjs from 'dayjs';

/**
 * 매입과 매출을 맞춰보고 부가세를 낸다.
 *
 * 중고차는 매입할 때 낸 세금을 의제매입세액으로 공제받는데, 그 공제는 그 차를 팔아서
 * 매출이 잡혀야 자리를 잡는다. 2억을 사놓고 1억만 팔면 나머지 1억은 매출이 안 잡힌
 * 채로 남고, 그만큼 부가세를 더 내게 된다.
 *
 * 부가가치세는 값 안에 들어 있다(공급대가 = 공급가액 + 세액). 그래서 10%가 아니라
 * 10/110 으로 뽑는다 — 1억이면 909만원이지 1,000만원이 아니다.
 *
 * 여기서 내는 숫자는 세무 신고서가 아니라 눈대중이다. 얼마나 벌어져 있는지 보고
 * 남은 기간에 얼마를 더 팔아야 하는지 가늠하는 용도다.
 */

/** 값에 들어 있는 부가세를 뽑아낸다. 원 단위로 끊는다. */
export function vatOf(amountWon: number): number {
  return Math.round((amountWon * 10) / 110);
}

/** 부가세를 맞춰보는 기간 — 반기(6개월) 단위로 신고한다. */
export const VAT_PERIOD_MONTHS = 6;

export interface VatBalance {
  purchase: number; // 매입 합계(원)
  sale: number; // 매도 합계(원)
  /** 매입 − 매도. 0보다 크면 아직 못 판 만큼이다 */
  gap: number;
  /** 그 차이에 걸린 부가세(원) */
  vat: number;
}

export function vatBalance(purchase: number, sale: number): VatBalance {
  const gap = purchase - sale;
  return { purchase, sale, gap, vat: gap > 0 ? vatOf(gap) : 0 };
}

/**
 * 그 달이 속한 반기의 시작과 끝.
 *
 * 1~6월 / 7~12월로 끊는다. 화면에서 "이 반기에 얼마나 벌어져 있나"를 볼 때 쓴다.
 */
export function halfYearRange(month: string): { from: string; to: string; label: string } {
  const d = dayjs(`${month}-01`);
  const firstHalf = d.month() < 6;
  const from = d.month(firstHalf ? 0 : 6).startOf('month');
  const to = d.month(firstHalf ? 5 : 11).endOf('month');
  return {
    from: from.format('YYYY-MM-DD'),
    to: to.format('YYYY-MM-DD'),
    label: `${d.year()}년 ${firstHalf ? '상' : '하'}반기`,
  };
}
