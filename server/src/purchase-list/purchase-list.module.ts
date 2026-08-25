import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnlyOrNull, monthRange, toDateOnly, todayKst } from '../common/date.util';

// 빈 문자열도 받는다 — @IsOptional() 은 undefined 만 건너뛰므로, 날짜 칸을 비운 요청(date: '')이
// 이 검사에 걸려 400이 난다. 빈 값은 서비스에서 "그 칸을 지운다(null)"로 해석한다.
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})?$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// ── DTO ──────────────────────────────

/**
 * 엑셀 시트를 옮긴 것이라 대부분의 칸이 비어 있어도 저장된다 —
 * 차를 먼저 적어두고 대출·상환은 나중에 채우는 순서로 쓰기 때문이다.
 * 차량번호와 차량명만 있으면 한 줄이 된다.
 */
export class CreatePurchaseListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) seq?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsString() @MaxLength(60) vehicleName!: string;
  @IsOptional() @IsString() @MaxLength(30) managerName?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) askingPrice?: number;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;

  @IsOptional() @IsString() @MaxLength(20) stockCapital?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stockAmount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitBmw?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitWoori?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitKb?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitMeritz?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitHana?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitHyundai?: number;

  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Matches(DATE_PATTERN, { message: '대출일자는 YYYY-MM-DD 형식이어야 합니다.' }) loanDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '상환일자는 YYYY-MM-DD 형식이어야 합니다.' }) repayDate?: string;
  @IsOptional() @IsString() @MaxLength(30) loanStatus?: string;
  @IsOptional() @Matches(DATE_PATTERN, { message: '상환날짜는 YYYY-MM-DD 형식이어야 합니다.' }) repaidDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) repaymentAmount?: number;
}

/**
 * 수정용 — 차량번호·차량명까지 전부 선택이다.
 * 등록용을 그대로 쓰면 한 칸만 고치는 요청이 "차량번호가 없다"로 거절된다.
 * (@nestjs/mapped-types 의 PartialType 을 쓸 수도 있지만, 이 저장소는 다른 모듈에서도
 *  수정용 DTO를 손으로 적어왔다 — 의존성을 하나 더 늘리지 않는다.)
 */
export class UpdatePurchaseListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) seq?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @IsOptional() @IsString() @MaxLength(30) managerName?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) askingPrice?: number;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;

  @IsOptional() @IsString() @MaxLength(20) stockCapital?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stockAmount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitBmw?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitWoori?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitKb?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitMeritz?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitHana?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitHyundai?: number;

  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Matches(DATE_PATTERN, { message: '대출일자는 YYYY-MM-DD 형식이어야 합니다.' }) loanDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @Matches(DATE_PATTERN, { message: '상환일자는 YYYY-MM-DD 형식이어야 합니다.' }) repayDate?: string;
  @IsOptional() @IsString() @MaxLength(30) loanStatus?: string;
  @IsOptional() @Matches(DATE_PATTERN, { message: '상환날짜는 YYYY-MM-DD 형식이어야 합니다.' }) repaidDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) repaymentAmount?: number;
}

export class PurchaseListQueryDto {
  /** 상환일자 기준 월 — 월별 현황 화면이 쓴다 */
  @IsOptional() @Matches(MONTH_PATTERN, { message: 'month는 YYYY-MM 형식이어야 합니다.' }) month?: string;

  /** 차량번호·차량명·담당자 검색 */
  @IsOptional() @IsString() q?: string;
}

// ── Service ──────────────────────────────

@Injectable()
export class PurchaseListService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: PurchaseListQueryDto) {
    const where: Prisma.PurchaseListItemWhereInput = {
      // 월 필터는 상환일자 기준이다 — "9월 재고차량 현황"이 곧 9월에 갚을 차들이다.
      ...(params.month ? { repayDate: monthRange(params.month) } : {}),
      ...(params.q
        ? {
            OR: [
              { vehicleNumber: { contains: params.q } },
              { vehicleName: { contains: params.q } },
              { managerName: { contains: params.q } },
            ],
          }
        : {}),
    };

    // 월별 현황은 갚는 날 순서로, 전체 목록은 최근 순번부터 본다.
    const rows = await this.prisma.purchaseListItem.findMany({
      where,
      orderBy: params.month ? [{ repayDate: 'asc' }, { seq: 'asc' }] : [{ seq: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  /**
   * 월별 요약 — 그 달에 상환할 금액의 합계와 대수.
   * 화면에서 더해도 되지만 필터를 바꿀 때마다 같은 계산을 다시 하게 되어 서버에서 낸다.
   */
  async monthlySummary(month?: string) {
    // 월을 안 주면 이번 달로 본다 — 빈 값으로 범위를 만들면 Invalid Date가 된다.
    const target = month || todayKst().slice(0, 7);
    const result = await this.prisma.purchaseListItem.aggregate({
      where: { repayDate: monthRange(target) },
      _sum: { repaymentAmount: true, stockAmount: true },
      _count: { _all: true },
    });
    return {
      month: target,
      count: result._count._all,
      repaymentTotal: result._sum.repaymentAmount ?? 0,
      stockTotal: result._sum.stockAmount ?? 0,
    };
  }

  async create(dto: CreatePurchaseListDto) {
    // 순번을 안 주면 지금 있는 것 다음 번호를 붙인다(엑셀에서 손으로 세던 걸 대신한다).
    const seq = dto.seq ?? (await this.nextSeq());
    const row = await this.prisma.purchaseListItem.create({
      data: { ...this.toData(dto), seq } as Prisma.PurchaseListItemUncheckedCreateInput,
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpdatePurchaseListDto) {
    await this.assertExists(id);
    const row = await this.prisma.purchaseListItem.update({ where: { id }, data: this.toData(dto) });
    return this.toView(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.purchaseListItem.delete({ where: { id } });
  }

  private async nextSeq(): Promise<number> {
    const top = await this.prisma.purchaseListItem.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return (top?.seq ?? 0) + 1;
  }

  private async assertExists(id: string) {
    const found = await this.prisma.purchaseListItem.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('매입리스트 항목을 찾을 수 없습니다.');
  }

  /**
   * 안 보낸 칸은 건드리지 않는다 — 표에서 한 칸만 고치는 경우가 대부분이다.
   * 날짜에 빈 문자열이 오면 "지운다"는 뜻으로 보고 null로 바꾼다(칸을 비우는 유일한 방법).
   */
  private toData(dto: CreatePurchaseListDto | UpdatePurchaseListDto): Prisma.PurchaseListItemUncheckedUpdateInput {
    const date = (value?: string) => (value === undefined ? undefined : value ? toDateOnly(value) : null);

    return {
      seq: dto.seq,
      date: date(dto.date),
      vehicleNumber: dto.vehicleNumber,
      vehicleName: dto.vehicleName,
      managerName: dto.managerName,
      askingPrice: dto.askingPrice,
      modelYear: dto.modelYear,
      mileage: dto.mileage,
      stockCapital: dto.stockCapital === undefined ? undefined : dto.stockCapital || null,
      stockAmount: dto.stockAmount,
      limitBmw: dto.limitBmw,
      limitWoori: dto.limitWoori,
      limitKb: dto.limitKb,
      limitMeritz: dto.limitMeritz,
      limitHana: dto.limitHana,
      limitHyundai: dto.limitHyundai,
      note: dto.note,
      loanDate: date(dto.loanDate),
      interestRate: dto.interestRate,
      repayDate: date(dto.repayDate),
      loanStatus: dto.loanStatus,
      repaidDate: date(dto.repaidDate),
      repaymentAmount: dto.repaymentAmount,
    };
  }

  /** 날짜는 화면에서 그대로 쓰도록 YYYY-MM-DD 문자열로 내린다. */
  private toView<
    T extends { date: Date | null; loanDate: Date | null; repayDate: Date | null; repaidDate: Date | null },
  >(row: T) {
    return {
      ...row,
      date: formatDateOnlyOrNull(row.date),
      loanDate: formatDateOnlyOrNull(row.loanDate),
      repayDate: formatDateOnlyOrNull(row.repayDate),
      repaidDate: formatDateOnlyOrNull(row.repaidDate),
    };
  }
}

// ── Controller ──────────────────────────────

/**
 * 매입리스트 — 재고금융(캐피탈 대출) 장부.
 *
 * 전 직원이 보고 쓴다. 담당자가 자기 차를 적는 화면이라 관리자로 막지 않는다
 * (누가 맡은 차인지는 담당자 칸으로 남는다).
 */
@Controller('purchase-list')
export class PurchaseListController {
  constructor(private readonly purchaseList: PurchaseListService) {}

  @Get()
  findAll(@Query() query: PurchaseListQueryDto) {
    return this.purchaseList.findAll(query);
  }

  /** 월별 현황 상단의 합계 — /purchase-list/summary?month=2026-09 */
  @Get('summary')
  summary(@Query() query: PurchaseListQueryDto) {
    return this.purchaseList.monthlySummary(query.month);
  }

  @Post()
  create(@Body() dto: CreatePurchaseListDto) {
    return this.purchaseList.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseListDto) {
    return this.purchaseList.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.purchaseList.remove(id);
  }
}

@Module({
  controllers: [PurchaseListController],
  providers: [PurchaseListService],
})
export class PurchaseListModule {}
