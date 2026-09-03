import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';

/**
 * 매입리스트(재고금융 대장)는 사무장이 보는 화면이다.
 *
 * 관리자도 함께 열어둔다 — 잘못 들어간 값을 고칠 사람이 아무도 없으면 곤란하고,
 * 대표도 관리자 계정이다. 더 좁혀야 하면 여기만 고치면 된다.
 *
 * 화면에서 메뉴를 감추는 것만으로는 막은 게 아니다. 주소를 알면 그대로 부를 수 있으니
 * 서버에서 한 번 더 가린다.
 */
export const OFFICE_MANAGER_POSITION = '사무장';

export function assertOfficeManager(user: AuthUser): void {
  if (user.role === Role.ADMIN) return;
  if (user.position?.includes(OFFICE_MANAGER_POSITION)) return;
  throw new ForbiddenException('매입리스트는 사무장과 관리자만 볼 수 있습니다.');
}
