import { applyDecorators } from '@nestjs/common';
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
import { Type } from 'class-transformer';
import { BrokerFeePayout, ConsultationKind, PrepCostKind, SettlementStatus } from '@prisma/client';
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
  /** 알선 / 수출 — 안 보내면 알선이다 */
  @IsOptional() @IsEnum(ConsultationKind) kind?: ConsultationKind;
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) @MaxLength(30) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleName!: string;
  @IsOptional() @Money() totalSaleAmount?: number;
  @IsOptional() @Money() ownerDeposit?: number;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() transferFeeBalance?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  /** 어느 캐피탈로 깔았는가 — 재고 금융 약정을 세는 값 */
  @IsOptional() @IsString() @MaxLength(20) installmentCapital?: string;
  @IsOptional() @Money() installmentAmount?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() etcCost?: number;
  /** 실 차량판매가 — 안 적으면 0, 그때는 실차주입금 + 차대금업으로 본다 */
  @IsOptional() @Money() realSalePrice?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
  /** 계약서 사진 경로 — 한 장 */
  @IsOptional() @IsString() contractPhotos?: string;
}

export class UpdateBrokerageDto {
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsEnum(ConsultationKind) kind?: ConsultationKind;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @IsOptional() @Money() totalSaleAmount?: number;
  @IsOptional() @Money() ownerDeposit?: number;
  @IsOptional() @Money() transferFee?: number;
  @IsOptional() @Money() transferFeeBalance?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  /** 어느 캐피탈로 깔았는가 — 재고 금융 약정을 세는 값 */
  @IsOptional() @IsString() @MaxLength(20) installmentCapital?: string;
  @IsOptional() @Money() installmentAmount?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() etcCost?: number;
  /** 실 차량판매가 — 안 적으면 0, 그때는 실차주입금 + 차대금업으로 본다 */
  @IsOptional() @Money() realSalePrice?: number;
  @IsOptional() @Money() settlementAmount?: number;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
  /** 계약서 사진 경로 — 한 장 */
  @IsOptional() @IsString() contractPhotos?: string;
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
  /** 플랫폼 수수료 — 헤이딜러·엔카 경매장에서 사오면 내는 돈 */
  @IsOptional() @Money() platformFee?: number;
  @IsOptional() @IsEnum(BrokerFeePayout) brokerFeePayout?: BrokerFeePayout;

  /** 매도정산 배분 — NEW(신차 30%) / PERSON(개인 50%). 빈 글자면 아직 안 정한 것이다 */
  @IsOptional() @IsString() @MaxLength(10) profitShare?: string;

  /** 매도정산을 이미 받았는가 — 받은 건은 이번 달 받을 돈에서 뺀다 */
  @IsOptional() @IsBoolean() profitSharePaid?: boolean;

  /** 상사 정산서의 실제지급액(원) — 적으면 판매수익을 이 금액으로 낸다 */
  @IsOptional() @Money() payoutAmount?: number;
  /** 계약서 사진 경로 — 줄바꿈으로 이어 담는다 */
  @IsOptional() @IsString() contractPhotos?: string;
  @IsOptional() @Money() salePrice?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  /** 어느 캐피탈로 깔았는가 — 재고 금융 약정을 세는 값 */
  @IsOptional() @IsString() @MaxLength(20) installmentCapital?: string;
  @IsOptional() @Money() installmentAmount?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() dealerLoanFee?: number;
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
  /** 플랫폼 수수료 — 헤이딜러·엔카 경매장에서 사오면 내는 돈 */
  @IsOptional() @Money() platformFee?: number;
  @IsOptional() @IsEnum(BrokerFeePayout) brokerFeePayout?: BrokerFeePayout;

  /** 매도정산 배분 — NEW(신차 30%) / PERSON(개인 50%). 빈 글자면 아직 안 정한 것이다 */
  @IsOptional() @IsString() @MaxLength(10) profitShare?: string;

  /** 매도정산을 이미 받았는가 — 받은 건은 이번 달 받을 돈에서 뺀다 */
  @IsOptional() @IsBoolean() profitSharePaid?: boolean;

  /** 상사 정산서의 실제지급액(원) — 적으면 판매수익을 이 금액으로 낸다 */
  @IsOptional() @Money() payoutAmount?: number;
  @IsOptional() @Money() salePrice?: number;
  @IsOptional() @Money() cashCommission?: number;
  @IsOptional() @Money() installmentFee?: number;
  /** 어느 캐피탈로 깔았는가 — 재고 금융 약정을 세는 값 */
  @IsOptional() @IsString() @MaxLength(20) installmentCapital?: string;
  @IsOptional() @Money() installmentAmount?: number;
  @IsOptional() @Money() insuranceFee?: number;
  @IsOptional() @Money() dealerLoanFee?: number;
  @IsOptional() @Money() settlementAmount?: number;
  /**
   * 계약서 사진 경로 — 줄바꿈으로 이어 담는다.
   *
   * 이 줄이 빠져 있었다. 들어오는 값은 DTO에 적힌 칸만 받고 나머지는 400으로 되돌리는데,
   * 화면은 고칠 때도 이 칸을 늘 같이 보낸다 — 그래서 매입 정산 수정이 통째로 거절당했다.
   * 상품화 비용을 적어도 안 들어가던 게 이것 때문이다. 만드는 칸을 늘릴 때는 고치는 쪽도
   * 같이 봐야 한다.
   */
  @IsOptional() @IsString() contractPhotos?: string;
  @IsOptional() @IsString() @MaxLength(60) newCarName?: string;
  @IsOptional() @IsString() employeeId?: string;

  /** 보내면 명세를 통째로 갈아끼운다. 안 보내면 그대로 둔다. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrepCostInput) prepCosts?: PrepCostInput[];
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsString() memo?: string;
}
