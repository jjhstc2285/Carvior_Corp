import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 로그인 없이 접근 가능한 엔드포인트(로그인 API 등)에 붙인다. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
