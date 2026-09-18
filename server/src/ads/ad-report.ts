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
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/**
 * 광고 운영 현황 메모.
 *
 * 대행사에서 주차마다 운영 보고가 온다 — "일 예산 2만원, 클릭 394회, 평균 CPC 353원,
 * 관련 없는 검색어는 제외 키워드로 등록" 같은 여러 줄짜리 글이다. 광고비 표의 메모 칸(한 줄)
 * 에는 도저히 안 들어가서 카톡에만 남고 흘러갔다.
 *
 * 달·채널로 묶어 그대로 붙여 넣게 둔다. 줄바꿈을 살려서 보여주고, 요약하거나 자르지 않는다 —
 * 나중에 "8월엔 CPC가 얼마였지"를 찾는 게 이걸 남기는 이유다.
 */

const MONTH = /^\d{4}-\d{2}$/;

export class CreateAdReportDto {
  @Matches(MONTH, { message: '달은 YYYY-MM 형식이어야 합니다.' }) month!: string;
  @IsString() @IsNotEmpty({ message: '채널을 입력해 주세요.' }) @MaxLength(30) channel!: string;
  @IsOptional() @IsString() @MaxLength(60) title?: string;
  @IsString() @IsNotEmpty({ message: '내용을 적어 주세요.' }) body!: string;
}

export class UpdateAdReportDto {
  @IsOptional() @IsString() @MaxLength(30) channel?: string;
  @IsOptional() @IsString() @MaxLength(60) title?: string;
  @IsOptional() @IsString() body?: string;
}

@Injectable()
export class AdReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** 그 달의 보고. 채널을 주면 그 채널만 — 광고비 줄에서 바로 열 때 쓴다. */
  findMonth(month: string, channel: string) {
    if (!MONTH.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    return this.prisma.adReport.findMany({
      where: { month, ...(channel ? { channel } : {}) },
      // 늦게 쓴 게 위로 — 3주차를 먼저 본다
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateAdReportDto, author: string) {
    return this.prisma.adReport.create({
      data: {
        month: dto.month,
        channel: dto.channel.trim(),
        title: dto.title?.trim() ?? '',
        body: dto.body.trim(),
        author,
      },
    });
  }

  async update(id: string, dto: UpdateAdReportDto) {
    await this.assertExists(id);
    return this.prisma.adReport.update({
      where: { id },
      data: {
        ...(dto.channel !== undefined ? { channel: dto.channel.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.adReport.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const row = await this.prisma.adReport.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('운영 메모를 찾을 수 없습니다.');
  }
}

@Controller('ad-reports')
export class AdReportController {
  constructor(private readonly reports: AdReportService) {}

  @Get()
  findMonth(@Query('month') month = '', @Query('channel') channel = '') {
    return this.reports.findMonth(month, channel.trim());
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdReportDto) {
    // 누가 올린 보고인지는 사람이 치게 두지 않는다 — 안 치거나 남 이름을 친다
    return this.reports.create(dto, user.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdReportDto) {
    return this.reports.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.reports.remove(id);
  }
}
