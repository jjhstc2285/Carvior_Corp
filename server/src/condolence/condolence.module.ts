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
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CondolenceKind } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, toDateOnly } from '../common/date.util';

/**
 * 경조사비 대장.
 *
 * 지금은 카톡으로 주고받고 만다. "김재웅 20만원 플러스 화환" 같은 말이 흩어져 있어서,
 * 연말에 얼마를 썼는지도 모르고 다음에 같은 자리에서 얼마를 내야 하는지도 모른다.
 * 받은 데 또 안 내는 일도, 두 번 내는 일도 여기서 생긴다.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateDto {
  @IsEnum(CondolenceKind) kind!: CondolenceKind;
  @IsString() @MaxLength(40) person!: string;
  @IsOptional() @IsString() @MaxLength(30) relation?: string;
  /** 연락처 — 적어 두기만 한다(문자는 따로 정한다) */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) subject?: string;
  @Matches(DATE) eventOn!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsBoolean() wreath?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) wreathPrice?: number;
  @IsOptional() @IsString() @MaxLength(80) place?: string;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

class UpdateDto {
  @IsOptional() @IsEnum(CondolenceKind) kind?: CondolenceKind;
  @IsOptional() @IsString() @MaxLength(40) person?: string;
  @IsOptional() @IsString() @MaxLength(30) relation?: string;
  /** 연락처 — 적어 두기만 한다(문자는 따로 정한다) */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) subject?: string;
  @IsOptional() @Matches(DATE) eventOn?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsBoolean() wreath?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) wreathPrice?: number;
  @IsOptional() @IsString() @MaxLength(80) place?: string;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

@Injectable()
export class CondolenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 그 해 것을 내려준다.
   *
   * 경조사는 해 단위로 본다 — 연말에 얼마 썼는지 세고, 다음 해에 다시 센다.
   * 해를 안 적으면 올해다.
   */
  async list(year?: string) {
    const y = /^\d{4}$/.test(year ?? '') ? Number(year) : new Date().getFullYear();
    const rows = await this.prisma.condolence.findMany({
      where: { eventOn: { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) } },
      orderBy: [{ eventOn: 'desc' }, { createdAt: 'desc' }],
      include: { recordedBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      person: r.person,
      relation: r.relation,
      phone: r.phone,
      subject: r.subject,
      eventOn: formatDateOnly(r.eventOn),
      amount: r.amount,
      wreath: r.wreath,
      wreathPrice: r.wreathPrice,
      place: r.place,
      memo: r.memo,
      recordedBy: r.recordedBy?.name ?? '',
    }));
  }

  /** 어느 해에 기록이 있는지 — 화면이 고를 해를 만든다 */
  async years(): Promise<number[]> {
    const rows = await this.prisma.condolence.findMany({ select: { eventOn: true } });
    const set = new Set(rows.map((r) => r.eventOn.getFullYear()));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }

  async create(user: AuthUser, dto: CreateDto) {
    const row = await this.prisma.condolence.create({
      data: {
        kind: dto.kind,
        person: dto.person.trim(),
        relation: dto.relation ?? '',
        phone: dto.phone ?? '',
        subject: dto.subject ?? '',
        eventOn: toDateOnly(dto.eventOn),
        amount: dto.amount ?? 0,
        wreath: dto.wreath ?? false,
        wreathPrice: dto.wreathPrice ?? 0,
        place: dto.place ?? '',
        memo: dto.memo ?? '',
        recordedById: user.id,
      },
    });
    return { ...row, eventOn: formatDateOnly(row.eventOn) };
  }

  async update(id: string, dto: UpdateDto) {
    const found = await this.prisma.condolence.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('경조사 기록을 찾을 수 없습니다.');

    const { eventOn, ...rest } = dto;
    const row = await this.prisma.condolence.update({
      where: { id },
      data: { ...rest, ...(eventOn ? { eventOn: toDateOnly(eventOn) } : {}) },
    });
    return { ...row, eventOn: formatDateOnly(row.eventOn) };
  }

  async remove(id: string) {
    await this.prisma.condolence.deleteMany({ where: { id } });
  }
}

@Controller('condolences')
export class CondolenceController {
  constructor(private readonly service: CondolenceService) {}

  @Get()
  list(@Query('year') year?: string) {
    return this.service.list(year);
  }

  @Get('years')
  years() {
    return this.service.years();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
  }
}

@Module({ controllers: [CondolenceController], providers: [CondolenceService] })
export class CondolenceModule {}
