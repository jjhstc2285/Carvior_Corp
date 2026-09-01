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
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, nowTimeKst, toDateOnly, todayKst } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// ── DTO ──────────────────────────────

export class CreateCleaningDto {
  /** 층 — 층마다 체크 항목이 다르다 */
  @IsOptional() @IsString() @MaxLength(10) floor?: string;

  /** 안 주면 서버 기준 오늘(KST) */
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;
  /** 안 주면 지금 시각(KST) */
  @IsOptional() @Matches(TIME_PATTERN, { message: '시간은 HH:mm 형식이어야 합니다.' }) time?: string;
  /** 대신 적어주는 경우가 있어 담당자를 고를 수 있게 둔다(안 주면 본인) */
  @IsOptional() @IsString() employeeId?: string;

  @IsOptional() @IsBoolean() sweep?: boolean;
  @IsOptional() @IsBoolean() wipe?: boolean;
  @IsOptional() @IsBoolean() waterPurifier?: boolean;
  @IsOptional() @IsBoolean() shredder?: boolean;
  @IsOptional() @IsBoolean() trashBin?: boolean;
  @IsOptional() @IsBoolean() paperCup?: boolean;
  @IsOptional() @IsBoolean() broomClean?: boolean;
  @IsOptional() @IsBoolean() wetMop?: boolean;

  @IsOptional() @IsString() @MaxLength(191) note?: string;
}

/** 표에서 체크만 바꾸는 경우가 많아 전부 선택이다. */
export class UpdateCleaningDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;
  @IsOptional() @Matches(TIME_PATTERN, { message: '시간은 HH:mm 형식이어야 합니다.' }) time?: string;
  @IsOptional() @IsString() employeeId?: string;

  @IsOptional() @IsBoolean() sweep?: boolean;
  @IsOptional() @IsBoolean() wipe?: boolean;
  @IsOptional() @IsBoolean() waterPurifier?: boolean;
  @IsOptional() @IsBoolean() shredder?: boolean;
  @IsOptional() @IsBoolean() trashBin?: boolean;
  @IsOptional() @IsBoolean() paperCup?: boolean;
  @IsOptional() @IsBoolean() broomClean?: boolean;
  @IsOptional() @IsBoolean() wetMop?: boolean;

  @IsOptional() @IsString() @MaxLength(191) note?: string;
}

export class CleaningQueryDto {
  @IsOptional() @Matches(MONTH_PATTERN, { message: 'month는 YYYY-MM 형식이어야 합니다.' }) month?: string;
  @IsOptional() @IsString() @MaxLength(10) floor?: string;
}

// ── Service ──────────────────────────────

@Injectable()
export class CleaningService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: CleaningQueryDto) {
    const where: Prisma.CleaningLogWhereInput = {
      ...(params.month ? { date: monthRange(params.month) } : {}),
      ...(params.floor ? { floor: params.floor } : {}),
    };

    const rows = await this.prisma.cleaningLog.findMany({
      where,
      include: { employee: { select: { id: true, name: true, position: true } } },
      // 대장은 최근 것부터 본다. 같은 날은 늦게 한 청소가 위로.
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(user: AuthUser, dto: CreateCleaningDto) {
    const row = await this.prisma.cleaningLog.create({
      data: {
        floor: dto.floor || '5F',
        date: toDateOnly(dto.date || todayKst()),
        time: dto.time || nowTimeKst(),
        employeeId: dto.employeeId || user.id,
        sweep: dto.sweep ?? false,
        wipe: dto.wipe ?? false,
        waterPurifier: dto.waterPurifier ?? false,
        shredder: dto.shredder ?? false,
        trashBin: dto.trashBin ?? false,
        paperCup: dto.paperCup ?? false,
        broomClean: dto.broomClean ?? false,
        wetMop: dto.wetMop ?? false,
        note: dto.note?.trim() ?? '',
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpdateCleaningDto) {
    await this.assertExists(id);
    const row = await this.prisma.cleaningLog.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        time: dto.time,
        employeeId: dto.employeeId,
        sweep: dto.sweep,
        wipe: dto.wipe,
        waterPurifier: dto.waterPurifier,
        shredder: dto.shredder,
        trashBin: dto.trashBin,
        paperCup: dto.paperCup,
        broomClean: dto.broomClean,
        wetMop: dto.wetMop,
        note: dto.note?.trim(),
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });
    return this.toView(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.cleaningLog.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const found = await this.prisma.cleaningLog.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('청소 기록을 찾을 수 없습니다.');
  }

  private toView<T extends { date: Date }>(row: T) {
    return { ...row, date: formatDateOnly(row.date) };
  }
}

// ── Controller ──────────────────────────────

/**
 * 청소 관리 대장.
 *
 * 벽에 붙여두고 손으로 체크하던 대장을 그대로 옮긴 것이라 전 직원이 적고 본다.
 * 지우는 것도 막지 않는다 — 잘못 적었을 때 본인이 지울 수 있어야 한다.
 */
@Controller('cleaning')
export class CleaningController {
  constructor(private readonly cleaning: CleaningService) {}

  @Get()
  findAll(@Query() query: CleaningQueryDto) {
    return this.cleaning.findAll(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCleaningDto) {
    return this.cleaning.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCleaningDto) {
    return this.cleaning.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.cleaning.remove(id);
  }
}

@Module({
  controllers: [CleaningController],
  providers: [CleaningService],
})
export class CleaningModule {}
