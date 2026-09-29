import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, toDateOnly } from '../common/date.util';

/**
 * 외부주차장 세차 대장.
 *
 * 외부 주차장에 세워 둔 차를 한 대당 만 원에 닦아 주신다. 주 두 번 오시기로 했는데
 * 실제로 몇 번 왔는지는 아무도 안 세고 있었다 — 달이 끝나고 청구서를 받으면 그게
 * 맞는지 따질 근거가 없다.
 *
 * 온 날을 찍어 두고, 달마다 치른 값을 남긴다. 주차비와 섞지 않는다 — 자리값과 닦는
 * 값은 따로 흥정하는 돈이다.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

class UpsertVisitDto {
  @Matches(DATE) date!: string;
  @IsString() @MaxLength(40) lot!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) carCount?: number;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

class UpsertSettlementDto {
  @Matches(MONTH) month!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) carCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitPrice?: number;
  @IsOptional() @IsBoolean() paid?: boolean;
  @IsOptional() @Matches(DATE) paidOn?: string;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

@Injectable()
export class WashService {
  constructor(private readonly prisma: PrismaService) {}

  /** 그 달 치 — 온 날과 정산을 같이 내려준다. 화면이 둘을 한 번에 그린다 */
  async month(month: string) {
    const from = toDateOnly(`${month}-01`);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);

    const [visits, settlement] = await Promise.all([
      this.prisma.washVisit.findMany({
        where: { date: { gte: from, lt: to } },
        orderBy: [{ date: 'asc' }, { lot: 'asc' }],
        include: { recordedBy: { select: { name: true } } },
      }),
      this.prisma.washSettlement.findUnique({ where: { month } }),
    ]);

    return {
      visits: visits.map((v) => ({
        id: v.id,
        date: formatDateOnly(v.date),
        lot: v.lot,
        carCount: v.carCount,
        memo: v.memo,
        recordedBy: v.recordedBy?.name ?? '',
      })),
      settlement: settlement
        ? {
            month: settlement.month,
            carCount: settlement.carCount,
            unitPrice: settlement.unitPrice,
            paid: settlement.paid,
            paidOn: formatDateOnlyOrNull(settlement.paidOn),
            memo: settlement.memo,
          }
        : null,
    };
  }

  /**
   * 왔다고 찍는다. 같은 날 같은 주차장을 두 번 찍으면 덮어쓴다.
   *
   * 누르면 켜지고 다시 누르면 꺼지는 자리라, 만들기와 고치기를 가르지 않는다.
   */
  async upsertVisit(user: AuthUser, dto: UpsertVisitDto) {
    const date = toDateOnly(dto.date);
    const data = {
      carCount: dto.carCount ?? 0,
      memo: dto.memo ?? '',
      recordedById: user.id,
    };
    const row = await this.prisma.washVisit.upsert({
      where: { date_lot: { date, lot: dto.lot } },
      create: { date, lot: dto.lot, ...data },
      update: data,
    });
    return { ...row, date: formatDateOnly(row.date) };
  }

  /** 잘못 찍은 날을 지운다 — 없는 걸 지워도 탈 없이 넘어간다 */
  async removeVisit(id: string) {
    await this.prisma.washVisit.deleteMany({ where: { id } });
  }

  /** 달마다 치른 값 */
  async upsertSettlement(dto: UpsertSettlementDto) {
    const data = {
      ...(dto.carCount !== undefined ? { carCount: dto.carCount } : {}),
      ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
      ...(dto.paid !== undefined ? { paid: dto.paid } : {}),
      // 치렀다고 켤 때 날을 안 적으면 오늘로 둔다 — 낸 날이 비어 있으면 나중에 못 따진다
      ...(dto.paidOn ? { paidOn: toDateOnly(dto.paidOn) } : dto.paid ? { paidOn: new Date() } : {}),
      ...(dto.paid === false ? { paidOn: null } : {}),
      ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
    };
    const row = await this.prisma.washSettlement.upsert({
      where: { month: dto.month },
      create: { month: dto.month, ...data },
      update: data,
    });
    return { ...row, paidOn: formatDateOnlyOrNull(row.paidOn) };
  }
}

@Controller('wash')
export class WashController {
  constructor(private readonly wash: WashService) {}

  @Get()
  month(@Query('month') month: string) {
    return this.wash.month(MONTH.test(month ?? '') ? month : new Date().toISOString().slice(0, 7));
  }

  @Post('visits')
  visit(@CurrentUser() user: AuthUser, @Body() dto: UpsertVisitDto) {
    return this.wash.upsertVisit(user, dto);
  }

  @Delete('visits/:id')
  @HttpCode(204)
  async removeVisit(@Param('id') id: string) {
    await this.wash.removeVisit(id);
  }

  @Post('settlement')
  settlement(@Body() dto: UpsertSettlementDto) {
    return this.wash.upsertSettlement(dto);
  }
}

@Module({ controllers: [WashController], providers: [WashService] })
export class WashModule {}
