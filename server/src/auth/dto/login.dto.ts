import { IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** 관리자 계정 로그인 (아이디 + 비밀번호) */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해 주세요.' })
  loginId!: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  password!: string;
}

/** 소셜 로그인 — 프론트가 카카오/네이버에서 받은 프로필을 넘긴다. */
export class SocialLoginDto {
  @IsIn(['KAKAO', 'NAVER'])
  provider!: 'KAKAO' | 'NAVER';

  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

/** 소셜 계정을 사내 직원과 연결 */
export class LinkEmployeeDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  newPassword!: string;
}
