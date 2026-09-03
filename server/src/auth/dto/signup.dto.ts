import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DEPARTMENTS } from '../../employees/departments';

/**
 * 회원가입 신청.
 *
 * 아이디는 로그인에 쓰는 값이라 형식을 좁게 잡는다 — 공백이나 한글이 섞이면
 * 나중에 본인도 못 치는 아이디가 된다.
 */
export class SignupDto {
  @IsString()
  @Matches(/^[a-z0-9._-]{4,20}$/, {
    message: '아이디는 영문 소문자·숫자·(._-) 조합 4~20자여야 합니다.',
  })
  loginId!: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상으로 정해주세요.' })
  @MaxLength(72) // bcrypt가 72바이트까지만 본다 — 더 길게 받으면 뒤가 조용히 잘린다
  password!: string;

  @IsString() @IsNotEmpty({ message: '이름을 입력해 주세요.' }) @MaxLength(30) name!: string;
  @IsOptional() @IsString() @MaxLength(30) position?: string;
  /** 소속 팀 — 작업일지를 팀끼리 나눠 보는 기준이다 */
  @IsOptional() @IsIn(DEPARTMENTS as unknown as string[]) department?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;

  /** 신청한 브라우저의 지문 — 승인할 때 출근 단말로 같이 등록할 수 있다 */
  @IsOptional() @IsString() @MaxLength(64) fingerprint?: string;
}

export class ReviewSignupDto {
  @IsIn(['approve', 'reject']) action!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(191) note?: string;

  /**
   * 신청한 그 PC를 출근 단말로도 등록할지.
   *
   * 기본은 끈다 — 휴대폰으로 신청했으면 휴대폰이 출근 단말이 되어버린다.
   * 사무실 자리 PC에서 신청한 게 확인될 때만 켠다.
   */
  @IsOptional() @IsBoolean() registerDevice?: boolean;
}
