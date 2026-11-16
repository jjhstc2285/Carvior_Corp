import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  /** 직급 — 대표 / 본부장 / 사무장 … 화면을 직급으로 가르는 데 쓴다 */
  position: string;
  /** 부서 — 계약팀처럼 팀 단위로 갈리는 일이 있다(계약팀은 남의 정산도 본다) */
  department: string | null;
  role: Role;
  /**
   * 소속 상사. 애니원모터스가 1번이다.
   *
   * ⚠ 아직 **이 값으로 자료를 거르는 곳이 없다.** Employee에만 상사 구분이 붙었고
   * 나머지 56개 모델에는 없어서, 두 번째 상사를 올리면 출퇴근·정산·상담이 섞여 보인다.
   * 모델별 스코핑이 끝나기 전까지 상사를 늘리지 말 것.
   */
  tenantId: number;
}

/** 컨트롤러에서 @CurrentUser() user: AuthUser 로 로그인한 직원을 받는다. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
