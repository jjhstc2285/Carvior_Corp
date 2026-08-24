import { VehicleExpenseKind, VehicleUsageNote } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../common/dto';
import { PLATE_FORMAT_MESSAGE, PLATE_PATTERN } from '../vehicle.rules';

export class CreateVehicleDto {
  @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차종을 입력해 주세요.' }) @MaxLength(60) vehicleModel!: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber?: string;
  @IsOptional() @IsString() @IsNotEmpty({ message: '차종을 입력해 주세요.' }) @MaxLength(60) vehicleModel?: string;

  @IsOptional() @IsBoolean() prepared?: boolean; // 상품화
  @IsOptional() @IsBoolean() advertised?: boolean; // 광고 완료
  @IsOptional() @IsBoolean() moveBlocked?: boolean; // 외부 이동 금지
}

export class VehicleListQueryDto {
  @IsOptional() @IsString() q?: string;
}

export class PlateTailQueryDto {
  @Matches(/^\d{4}$/, { message: '차량번호 뒤 4자리를 입력해 주세요.' }) tail!: string;
}

export class CreateVehicleExpenseDto {
  @IsString() @IsNotEmpty({ message: '차량을 선택해 주세요.' }) vehicleId!: string;
  @IsEnum(VehicleExpenseKind) kind!: VehicleExpenseKind;
  @Type(() => Number) @IsInt() @Min(0) amount!: number; // 원

  /** 안 주면 서버 기준 오늘(KST)로 저장한다 — "등록 시점의 날짜" */
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  /** 주유일 때만 쓴다(배터리에 보내면 무시하지 않고 막는다) */
  @IsOptional() @IsEnum(VehicleUsageNote) note?: VehicleUsageNote;
}

export class UpdateVehicleExpenseDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;
  @IsOptional() @IsEnum(VehicleUsageNote) note?: VehicleUsageNote;
}

export class VehicleExpenseQueryDto {
  @IsOptional() @IsEnum(VehicleExpenseKind) kind?: VehicleExpenseKind;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}$/, { message: 'month는 YYYY-MM 형식이어야 합니다.' }) month?: string;
}
