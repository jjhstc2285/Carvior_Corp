import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1, { message: '이름을 입력해 주세요.' })
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1, { message: '직책을 입력해 주세요.' })
  @MaxLength(50)
  position!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  department?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Type(() => String)
  phones?: string[];

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  department?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  phones?: string[];

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * 지금 상태 — "🚗 외근 중" 처럼.
 *
 * 이모지는 글자 수로 재면 안 된다. 하나짜리 이모지도 코드 단위로는 여러 글자다
 * (🚗 는 2, 👨‍💻 는 5). 넉넉히 열어두고 화면에서 하나만 고르게 한다.
 * 둘 다 비우면 상태를 내린다.
 */
export class UpdateStatusDto {
  @IsOptional() @IsString() @MaxLength(8) emoji?: string | null;
  @IsOptional() @IsString() @MaxLength(40) text?: string | null;
}
