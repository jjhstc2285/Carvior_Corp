import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  /** 직급 — 대표 / 본부장 / 사무장 … 화면을 직급으로 가르는 데 쓴다 */
  position: string;
  role: Role;
}

/** 컨트롤러에서 @CurrentUser() user: AuthUser 로 로그인한 직원을 받는다. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
