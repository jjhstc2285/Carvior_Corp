import { applyDecorators } from '@nestjs/common';
import {
  IsArray,
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
import { Type } from 'class-transformer';
import { PrepCostKind, SettlementStatus } from '@prisma/client';
import { DATE_PATTERN } from '../../common/dto';

/** 금액 필드 공통 — 정수, 음수 불가. 단위는 정산 종류마다 다르다(매입 정산만 '원', 나머지는 만원). */
const Money = () =>
  applyDecorators(Type(() => Number), IsInt({ message: '금액은 정수여야 합니다.' }), Min(0, { message: '금액은 0 이상이어야 합니다.' }));

// ── 간편 정산 ──

export class CreateSettlementDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty({ message: '차량정보를 입력해 주세요.' }) @MaxLength(120) vehicleInfo!: string;
  @IsOptional() @Money() purchaseCost?: number;
  @IsOptional() @Money() prepCost?: number;
  @IsOptional() @Money() saleAmount?: number;
  @IsOptional() @Money() feeAmount?: number;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @Matches(DATE_PATTERN) date!: string;
  @IsOptional() @IsString() memo?: string;
}

export class UpdateSettlementDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleInfo?: string;
  @IsOptional() @Money() purchaseCost?: number;
  @IsOptional() @Money() prepCost?: number;
  @IsOptional() @Money() saleAmount?: number;
  @IsOptional() @Money() feeAmount?: number;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsString() memo?: string;
}

// ── 알선 정산 ──

export class CreateBrokerageDto {
  @Matches(DATE_PATTERN) date!: string;
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) @MaxLength(30) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleName!: string;
  @IsOptional() @Money() totalSaleAmount?: number;
  @IsOptional() @Money() ownerDeposit?: number;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() transferFeeBalance?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() etcCost?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
}

export class UpdateBrokerageDto {
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @IsOptional() @Money() totalSaleAmount?: number;
  @IsOptional() @Money() ownerDeposit?: number;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() transferFeeBalance?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() etcCost?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
}

// ── 매입 정산 ──

/**
 * 상품화 비용 한 줄 — 항목 + 업체/카테고리 + 금액.
 * 업체명은 자유 입력이다(자주 쓰는 이름은 화면이 자동완성으로 추천한다).
 */
export class PrepCostInput {
  @IsEnum(PrepCostKind) kind!: PrepCostKind;
  @IsOptional() @IsString() @MaxLength(60) vendor?: string;
  @IsOptional() @Money() amount?: number;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

export class CreatePurchaseDto {
  @Matches(DATE_PATTERN) date!: string;
  @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleName!: string;
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() purchasePrice?: number;
  @IsOptional() @Money() brokerFee?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsOptional() @IsString() @MaxLength(60) newCarName?: string;
  @IsString() @IsNotEmpty() employeeId!: string;

  /** 상품화 비용 명세 — 항목별 금액 컬럼을 대신한다 */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrepCostInput) prepCosts?: PrepCostInput[];
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
}

export class UpdatePurchaseDto {
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() purchasePrice?: number;
  @IsOptional() @Money() brokerFee?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsOptional() @IsString() @MaxLength(60) newCarName?: string;
  @IsOptional() @IsString() employeeId?: string;

  /** 보내면 명세를 통째로 갈아끼운다. 안 보내면 그대로 둔다. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrepCostInput) prepCosts?: PrepCostInput[];
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
}
