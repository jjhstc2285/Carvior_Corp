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
