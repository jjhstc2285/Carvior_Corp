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

}

export class ReviewSignupDto {
  @IsIn(['approve', 'reject']) action!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(191) note?: string;

}

/**
 * 상사 개설 신청.
 *
 * 직원 가입과 달리 아이디·비밀번호를 받지 않는다. 여기서 계정이 생기지 않기 때문이다 —
 * 사람이 확인하고 상사를 연 다음에야 대표님 계정이 만들어진다.
 * 그래서 받는 것은 "누구에게 전화를 걸어야 하는가"와 "어떤 상사인가" 뿐이다.
 */
export class OwnerSignupDto {
  @IsString() @IsNotEmpty({ message: '상사 이름을 입력해 주세요.' }) @MaxLength(80) shopName!: string;
  @IsString() @IsNotEmpty({ message: '대표자 성함을 입력해 주세요.' }) @MaxLength(30) ownerName!: string;

  @IsString()
  @Matches(/^[0-9-]{9,20}$/, { message: '연락처는 숫자와 - 로만 입력해 주세요.' })
  phone!: string;

  @IsOptional() @IsString() @MaxLength(20) bizNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(40) region?: string;
  @IsOptional() @IsString() @MaxLength(20) headcount?: string;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
}
