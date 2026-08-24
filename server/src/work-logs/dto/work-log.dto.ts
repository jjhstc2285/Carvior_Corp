import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DATE_PATTERN } from '../../common/dto';

export class WorkLogRangeDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from은 YYYY-MM-DD 형식이어야 합니다.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to는 YYYY-MM-DD 형식이어야 합니다.' })
  to?: string;

  /** 관리자가 특정 직원의 일지를 볼 때만 쓴다(직원은 무시되고 항상 본인 것). */
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
