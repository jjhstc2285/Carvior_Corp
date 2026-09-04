import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';

/**
 * 매입리스트·상조회비 같은 돈 장부를 볼 수 있는 사람.
 *
 * 대표와 사무장, 그리고 테스트 계정. 넷이다.
 *
 * 예전에는 '관리자 전원'을 열어뒀는데 관리자가 넷보다 많아서 의도보다 넓었다.
 * 직급으로 좁힌다 — 사람이 바뀌어도 자리를 물려받은 사람이 그대로 보고, 이름으로
 * 박아두면 사람이 바뀔 때 코드를 고쳐야 하는데 그 사실을 아무도 기억하지 못한다.
 *
 * 화면에서 메뉴를 감추는 것만으로는 막은 게 아니다. 주소를 알면 그대로 부를 수 있으니
 * 서버에서 한 번 더 가린다.
 */
export const LEDGER_POSITIONS = ['대표', '사무장', '테스트'] as const;

export function canSeeLedger(position: string | undefined): boolean {
  return LEDGER_POSITIONS.some((p) => position?.includes(p));
}

export function assertOfficeManager(user: AuthUser): void {
  if (canSeeLedger(user.position)) return;
  throw new ForbiddenException('대표와 사무장만 볼 수 있습니다.');
}

/** 볼 수 있는 사람을 DB에서 찾을 때 — 알림 대상도 같은 조건이라 한 곳에 둔다. */
export const LEDGER_VIEWER_WHERE: Prisma.EmployeeWhereInput = {
  active: true,
  OR: LEDGER_POSITIONS.map((p) => ({ position: { contains: p } })),
};
