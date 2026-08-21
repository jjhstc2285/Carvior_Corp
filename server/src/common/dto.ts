import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class MonthQueryDto {
  @IsOptional()
  @Matches(MONTH_RE, { message: 'month는 YYYY-MM 형식이어야 합니다.' })
  month?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export const DATE_PATTERN = DATE_RE;
export const TIME_PATTERN = TIME_RE;
