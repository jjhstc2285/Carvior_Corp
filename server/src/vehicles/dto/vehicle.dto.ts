import { VehicleBodyType, VehicleExpenseKind, VehicleSaleType, VehicleUsageNote } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATE_PATTERN } from '../../common/dto';
import { PLATE_FORMAT_MESSAGE, PLATE_PATTERN } from '../vehicle.rules';

export class CreateVehicleDto {
  @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleModel!: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber?: string;
  @IsOptional() @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleModel?: string;

  @IsOptional() @IsBoolean() prepared?: boolean; // 상품화
  @IsOptional() @IsBoolean() advertised?: boolean; // 광고 완료
  @IsOptional() @IsBoolean() moveBlocked?: boolean; // 외부 이동 금지

  // ── 주차 배치 기준 ──
  // 매입 관리에서 들어올 때 채워지지만, 차명으로 짐작한 차종이 틀리거나
  // 카비어처럼 연료가 안 오는 경우가 있어 여기서 고칠 수 있어야 한다.
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceManwon?: number;
  @IsOptional() @IsString() @MaxLength(20) fuel?: string;
  @IsOptional() @IsEnum(VehicleBodyType) bodyType?: VehicleBodyType;
  @IsOptional() @IsEnum(VehicleSaleType) saleType?: VehicleSaleType;
  @IsOptional() @IsBoolean() isTaxi?: boolean;

  // ── 재고금융(제시) ──
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  // 빈 문자열은 '지운다'는 뜻이다 — 날짜를 잘못 넣었을 때 되돌릴 길이 있어야 한다.
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) offerDate?: string | null;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) transferDate?: string | null;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) soldDate?: string | null;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) repayDate?: string | null;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) firstRegisteredOn?: string | null;
  @IsOptional() @IsBoolean() cashVehicle?: boolean;
  @IsOptional() @IsString() @MaxLength(20) stockCapital?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stockAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) adCost?: number; // 광고금액(원)
}

/**
 * 재고차량 장부에서 한 줄.
 *
 * 시트를 읽고 무엇이 들어갈지 화면에서 확인한 뒤, 확인한 그 값을 그대로 보낸다 —
 * 서버가 다시 읽으면 화면에서 본 것과 다른 게 들어갈 수 있다.
 */
export class StockImportRowDto {
  @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차명을 입력해 주세요.' }) @MaxLength(60) vehicleModel!: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @Matches(DATE_PATTERN, { message: '제시일자는 YYYY-MM-DD 형식이어야 합니다.' }) offerDate!: string;
  @Matches(DATE_PATTERN, { message: '상환일자는 YYYY-MM-DD 형식이어야 합니다.' }) repayDate!: string;
  @IsString() @IsNotEmpty({ message: '할부사를 입력해 주세요.' }) @MaxLength(20) stockCapital!: string;
  @Type(() => Number) @IsInt() @Min(1, { message: '재고금액을 입력해 주세요.' }) stockAmount!: number;
}

export class StockImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => StockImportRowDto) rows!: StockImportRowDto[];
}

/** 매입했는데 차량 관리에 안 올라간 차를 올릴 때 */
export class RegisterIntakeVehicleDto {
  @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber!: string;
}

/** 차량 관리에 없는 차를 매도로 남길 때 — 차를 만들면서 매도일자까지 같이 적는다. */
export class RegisterSoldVehicleDto {
  @IsString() @Matches(PLATE_PATTERN, { message: PLATE_FORMAT_MESSAGE }) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleModel?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) soldDate!: string;

  /** 알선차인가 — 우리가 사온 차가 아니라 매도 대수에서 빼야 한다 */
  @IsOptional() @IsBoolean() brokered?: boolean;
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

  /** 무엇에 쓴 돈인지 — 소모품·수리와 기타에서 쓴다 */
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

export class UpdateVehicleExpenseDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;
  @IsOptional() @IsEnum(VehicleUsageNote) note?: VehicleUsageNote;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

export class VehicleExpenseQueryDto {
  @IsOptional() @IsEnum(VehicleExpenseKind) kind?: VehicleExpenseKind;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}$/, { message: 'month는 YYYY-MM 형식이어야 합니다.' }) month?: string;
}
