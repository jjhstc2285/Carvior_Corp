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

/*
  출근 제한(IP 화이트리스트 · 출근 단말)에 쓰던 DTO 세 개를 걷어냈다.

  애니원 사무실 한 곳을 전제로 만든 기능이다 — 사무실 공인 IP를 등록해 두고 그 안에서만,
  자리 PC에 심어둔 키가 있어야 출근이 찍혔다. 여러 상사가 쓰는 제품에서는 성립하지 않는다:
  상사마다 사무실이 다르고, 공유기를 바꾸면 IP가 바뀌고, 애초에 폰으로 출근하는 사람이 많다.

  출근은 이제 로그인한 사람이 누르면 찍힌다. 대리 출근이 걱정되면 그건 IP가 아니라
  위치(GPS)나 사진으로 풀 문제이고, 그때 새로 설계한다.
*/
