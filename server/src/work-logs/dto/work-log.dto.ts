import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DATE_PATTERN } from '../../common/dto';

export class WorkLogRangeDto {
  /** 팀 전체 보기 — 직원이 같은 팀 일지를 한 번에 볼 때 */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() team?: boolean;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from은 YYYY-MM-DD 형식이어야 합니다.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to는 YYYY-MM-DD 형식이어야 합니다.' })
  to?: string;

  /**
   * 볼 사람. 관리자는 아무나, 직원은 같은 팀 사람만 고를 수 있다
   * (팀 밖 id를 보내면 본인 것으로 돌아간다).
   */
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class CreateWorkLogDto {
  @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsString() @IsNotEmpty({ message: '할 일 내용을 입력해 주세요.' }) @MaxLength(500) content!: string;

  /** 관리자가 다른 직원의 일지에 적을 때만 쓴다. */
  @IsOptional() @IsString() employeeId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateWorkLogDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;
  @IsOptional() @IsString() @IsNotEmpty({ message: '할 일 내용을 입력해 주세요.' }) @MaxLength(500) content?: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
