/**
 * 팀(부서).
 *
 * 작업일지를 팀끼리 나눠 보는 기준이다. 사람이 손으로 적으면 '광고팀'과 '광고 팀'이
 * 따로 놀아 같은 팀이 갈라지므로 목록에서 고르게 한다.
 *
 * 서버 src/employees/departments.ts 와 프론트 src/types.ts 가 같아야 한다.
 */
export const DEPARTMENTS = ['광고팀', '계약팀', '매입팀', '차량관리팀', '알선팀'] as const;

export type Department = (typeof DEPARTMENTS)[number];

export function isDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value);
}
