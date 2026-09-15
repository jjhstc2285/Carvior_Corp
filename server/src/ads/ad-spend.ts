import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 월별 광고비.
 *
 * 엔카·차차차는 '월 몇 대' 약정이라 계약으로 따로 센다. 그 밖의 광고 — 구글 애즈,
 * 114 우선문의, 채널웍스, 알바천국 같은 것 — 은 달마다 얼마를 썼는지만 남기면 된다.
 * 카톡으로 "9월 광고비 총 135만원"을 주고받던 걸 여기 적는다.
 *
 * 끊은 채널도 0원으로 남긴다("네이버 파워링크 0원 — 광고 종료"). 안 적으면 끊은 건지
 * 적는 걸 잊은 건지 알 수 없다.
 */

const MONTH = /^\d{4}-\d{2}$/;

export class CreateAdSpendDto {
  @Matches(MONTH, { message: '달은 YYYY-MM 형식이어야 합니다.' }) month!: string;
  @IsString() @IsNotEmpty({ message: '채널을 입력해 주세요.' }) @MaxLength(30) channel!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(10) status?: string;
  @IsOptional() @IsString() @MaxLength(30) owner?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
}

export class UpdateAdSpendDto {
  @IsOptional() @IsString() @MaxLength(30) channel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(10) status?: string;
  @IsOptional() @IsString() @MaxLength(30) owner?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
}

/** 'YYYY-MM' 의 바로 앞 달 */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class AdSpendService {
  constructor(private readonly prisma: PrismaService) {}

  findMonth(month: string) {
    if (!MONTH.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    // 큰 돈부터 — 어디에 제일 많이 쓰는지가 먼저 보여야 한다
    return this.prisma.adSpend.findMany({ where: { month }, orderBy: [{ amount: 'desc' }, { channel: 'asc' }] });
  }

  create(dto: CreateAdSpendDto) {
    return this.prisma.adSpend.create({
      data: {
        month: dto.month,
        channel: dto.channel.trim(),
        amount: dto.amount ?? 0,
        status: dto.status?.trim() ?? '',
        owner: dto.owner?.trim() ?? '',
        memo: dto.memo?.trim() ?? '',
      },
    });
  }

  async update(id: string, dto: UpdateAdSpendDto) {
    await this.assertExists(id);
    return this.prisma.adSpend.update({
      where: { id },
      data: {
        ...(dto.channel !== undefined ? { channel: dto.channel.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.status !== undefined ? { status: dto.status.trim() } : {}),
        ...(dto.owner !== undefined ? { owner: dto.owner.trim() } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.adSpend.delete({ where: { id } });
  }

  /**
   * 지난달 채널을 이번 달로 가져온다.
   *
   * 광고는 대개 달마다 같은 채널에 같은 돈이 나간다. 매달 처음부터 다시 치게 두지 않고
   * 지난달 줄을 복사한 뒤 바뀐 것만 고치게 한다. 끊은 채널(0원·종료)은 안 가져온다.
   * 이번 달에 이미 있는 채널은 건너뛴다 — 두 번 누르면 줄이 두 벌 생기면 안 된다.
   */
  async copyFromPrevious(month: string) {
    if (!MONTH.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    const prev = previousMonth(month);

    const [source, existing] = await Promise.all([
      this.prisma.adSpend.findMany({ where: { month: prev } }),
      this.prisma.adSpend.findMany({ where: { month }, select: { channel: true } }),
    ]);
    const have = new Set(existing.map((e) => e.channel));
    const rows = source.filter((s) => s.amount > 0 && s.status !== '종료' && !have.has(s.channel));

    if (rows.length > 0) {
      await this.prisma.adSpend.createMany({
        data: rows.map((s) => ({
          month,
          channel: s.channel,
          amount: s.amount,
          // '신규'로 시작한 채널도 다음 달엔 이어가는 것이다
          status: s.status === '신규' ? '유지' : s.status,
          owner: s.owner,
          memo: '',
        })),
      });
    }
    return { copied: rows.length, from: prev, skipped: source.length - rows.length };
  }

  private async assertExists(id: string) {
    const row = await this.prisma.adSpend.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('광고비 내역을 찾을 수 없습니다.');
  }
}

/** 보고 적는 건 광고 관리 화면을 쓰는 사람 누구나다 — 약정 계약과 같다. */
@Controller('ad-spends')
export class AdSpendController {
  constructor(private readonly spends: AdSpendService) {}

  @Get()
  findMonth(@Query('month') month = '') {
    return this.spends.findMonth(month);
  }

  @Post()
  create(@Body() dto: CreateAdSpendDto) {
    return this.spends.create(dto);
  }

  @Post('copy-previous')
  copyFromPrevious(@Query('month') month = '') {
    return this.spends.copyFromPrevious(month);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdSpendDto) {
    return this.spends.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.spends.remove(id);
  }
}
