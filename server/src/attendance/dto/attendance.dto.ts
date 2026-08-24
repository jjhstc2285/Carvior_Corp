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

  @IsEnum(AttendanceRequestKind, { message: 'kind는 ANNUAL_LEAVE 또는 FIELD_WORK 여야 합니다.' })
  kind!: AttendanceRequestKind;

  @IsString()
  @IsNotEmpty({ message: '사유를 입력해 주세요.' })
  @MaxLength(500)
  reason!: string;
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

export class RegisterDeviceDto {
  /** 어느 자리 PC인지 알아볼 이름 — 예: "1층 카운터 PC" */
  @IsString()
  @IsNotEmpty({ message: '단말 이름을 입력해 주세요.' })
  @MaxLength(50)
  label!: string;
}
