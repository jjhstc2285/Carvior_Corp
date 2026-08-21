import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** 관리자 전용 엔드포인트에 @Roles(Role.ADMIN) 으로 붙인다. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
