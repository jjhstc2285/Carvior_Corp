import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  OnModuleInit,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { SEED_PARKING_LOTS } from './seed';

/**
 * 주차장 구조 — 어떤 주차장에 어떤 구역이 몇 줄로 있는가.
 *
 * 코드에 박아 두었다. 줄 하나를 늘리거나 이름을 고치려면 개발자가 고쳐 올려야 했는데,
 * 실제로 줄을 긋고 차를 대는 건 차량관리팀이다 — 그 팀이 화면에서 고치게 한다.
 *
 * 번지(lot)는 저장된 값이다. 세워 둔 차와 세차 기록이 전부 이 값으로 묶여 있어서
 * 바꾸면 지난 기록이 엉뚱한 주차장을 가리킨다 — 부르는 이름만 따로 둔다.
 */

/** 구조를 고칠 수 있는 팀 — 줄을 긋고 차를 대는 사람들이다 */
const LAYOUT_TEAM = '차량관리팀';

/** 화면 상단 묶음 — 본관과 외부를 따로 본다 */
const AREAS = ['본관', '외부'] as const;

/** 줄바꿈으로 이어 담은 값을 목록으로 — 빈 줄은 버린다 */
const toList = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

class UpsertLayoutDto {
  @IsString() @MaxLength(60) lot!: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsIn(AREAS) area?: (typeof AREAS)[number];
  @IsOptional() @IsString() @MaxLength(20) bandColor?: string;
  /** 구역 이름 — 본관은 '9구역'·'가로주차'처럼 제각각이라 손으로 적는다 */
  @IsOptional() @IsArray() @IsString({ each: true }) zones?: string[];
  /** 줄 이름 — 비우면 본관 기본값을 쓴다 */
  @IsOptional() @IsArray() @IsString({ each: true }) slots?: string[];
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Injectable()
export class ParkingLayoutService implements OnModuleInit {
  private readonly logger = new Logger(ParkingLayoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 표가 비어 있으면 코드에 있던 구조를 그대로 넣는다.
   *
   * 한 번만 한다. 지운 주차장이 다음에 뜰 때 되살아나면 지운 뜻이 없다 —
   * 한 줄이라도 있으면 사람이 손댄 것으로 보고 그대로 둔다.
   */
  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.parkingLotLayout.count();
      if (count > 0) return;

      await this.prisma.parkingLotLayout.createMany({
        data: SEED_PARKING_LOTS.map((l, i) => ({
          lot: l.lot,
          label: l.label ?? '',
          area: l.area,
          bandColor: l.bandColor,
          zones: l.zones.join('\n'),
          slots: (l.slots ?? []).join('\n'),
          sortOrder: i,
        })),
        skipDuplicates: true,
      });
      this.logger.log(`주차장 구조 ${SEED_PARKING_LOTS.length}곳을 처음 넣었습니다.`);
    } catch (e) {
      // 못 넣어도 서버는 떠야 한다 — 화면이 코드에 있던 구조로 돌아간다
      this.logger.warn(`주차장 구조를 처음 넣지 못했습니다: ${(e as Error).message}`);
    }
  }

  async findAll() {
    const rows = await this.prisma.parkingLotLayout.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { lot: 'asc' }],
    });
    return rows.map((r) => ({
      lot: r.lot,
      label: r.label,
      area: r.area,
      bandColor: r.bandColor,
      zones: toList(r.zones),
      slots: toList(r.slots),
      sortOrder: r.sortOrder,
    }));
  }

  /** 고칠 수 있는 사람인가 — 차량관리팀과 관리자 */
  private assertEditor(user: AuthUser): void {
    if (user.role === Role.ADMIN) return;
    if ((user.department ?? '').trim() === LAYOUT_TEAM) return;
    throw new ForbiddenException('주차장 구조는 차량관리팀과 관리자만 고칠 수 있습니다.');
  }

  async upsert(user: AuthUser, dto: UpsertLayoutDto) {
    this.assertEditor(user);

    const lot = dto.lot.trim();
    if (!lot) throw new BadRequestException('주차장 번지를 적어 주세요.');

    const zones = (dto.zones ?? []).map((z) => z.trim()).filter(Boolean);
    if (zones.length === 0) throw new BadRequestException('구역을 하나 이상 두어야 합니다.');

    const data = {
      label: dto.label?.trim() ?? '',
      area: dto.area ?? '외부',
      bandColor: dto.bandColor?.trim() || '#e2e8f0',
      zones: zones.join('\n'),
      slots: (dto.slots ?? []).map((s) => s.trim()).filter(Boolean).join('\n'),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };

    const row = await this.prisma.parkingLotLayout.upsert({
      where: { lot },
      create: { lot, ...data },
      update: data,
    });
    this.logger.log(`${lot} 주차장 구조를 고쳤습니다(${user.name}).`);
    return { lot: row.lot };
  }

  /**
   * 주차장을 목록에서 내린다.
   *
   * 줄을 지우지 않는다. 거기 세워 둔 차와 지난 세차 기록이 그 번지로 묶여 있어서,
   * 줄이 사라지면 그 기록이 어느 주차장 것인지 알 수 없게 된다 — 안 보이게만 한다.
   */
  async remove(user: AuthUser, lot: string) {
    this.assertEditor(user);
    const parked = await this.prisma.parkingVehicle.count({ where: { lot } });
    if (parked > 0) {
      throw new BadRequestException(`${lot} 에 세워 둔 차가 ${parked}대 있습니다. 먼저 옮겨 주세요.`);
    }
    await this.prisma.parkingLotLayout.update({ where: { lot }, data: { active: false } });
    this.logger.log(`${lot} 주차장을 목록에서 내렸습니다(${user.name}).`);
  }
}

@Controller('parking-layout')
export class ParkingLayoutController {
  constructor(private readonly service: ParkingLayoutService) {}

  /** 보는 건 누구나 — 주차 배치도를 전 직원이 본다 */
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertLayoutDto) {
    return this.service.upsert(user, dto);
  }

  @Patch(':lot')
  update(@CurrentUser() user: AuthUser, @Param('lot') lot: string, @Body() dto: UpsertLayoutDto) {
    return this.service.upsert(user, { ...dto, lot });
  }

  @Delete(':lot')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('lot') lot: string) {
    await this.service.remove(user, lot);
  }
}

@Module({ controllers: [ParkingLayoutController], providers: [ParkingLayoutService] })
export class ParkingLayoutModule {}
