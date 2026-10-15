import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AttendanceRequestKind } from '@prisma/client';
import { DATE_PATTERN, TIME_PATTERN } from '../../common/dto';

export class CreateCorrectionDto {
  @Matches(DATE_PATTERN, { message: 'date는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsString()
  @IsNotEmpty({ message: '사유를 입력해 주세요.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: '시각은 HH:mm 형식이어야 합니다.' })
  requestedClockIn?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: '시각은 HH:mm 형식이어야 합니다.' })
  requestedClockOut?: string;
}

export class CreateAttendanceRequestDto {
  @Matches(DATE_PATTERN, { message: 'date는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsEnum(AttendanceRequestKind, {
    message: 'kind는 ANNUAL_LEAVE, HALF_DAY, FIELD_WORK, AWAY, LATE_EXCUSE 중 하나여야 합니다.',
  })
  kind!: AttendanceRequestKind;

  @IsString()
  @IsNotEmpty({ message: '사유를 입력해 주세요.' })
  @MaxLength(500)
  reason!: string;

  /**
   * 증빙 사진 — 먼저 올려 경로를 받고, 그 경로를 줄바꿈으로 이어 함께 보낸다.
   *
   * 다섯 장까지 받으므로 경로가 길어도 500자를 넘지 않는다. 넉넉히 둔다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  photos?: string;
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddIpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  ip!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;
}

/** 키를 잃은 브라우저가 자기 지문을 들고 온다 */
export class RecoverDeviceDto {
  @IsString() @IsNotEmpty() @MaxLength(64) fingerprint!: string;
}

export class RegisterDeviceDto {
  /** 이 브라우저를 알아볼 지문 — 사용기록을 지워도 남는다 */
  @IsOptional() @IsString() @MaxLength(64) fingerprint?: string;
  /** 어느 자리 PC인지 알아볼 이름 — 예: "1층 카운터 PC" */
  @IsString()
  @IsNotEmpty({ message: '단말 이름을 입력해 주세요.' })
  @MaxLength(50)
  label!: string;
}
