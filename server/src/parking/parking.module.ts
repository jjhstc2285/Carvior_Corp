import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationType, ParkingStatus, Prisma, Role } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { collectPlates, parseParkingSheet, type ParsedSpot, type SkippedCell } from './sheet-import';
import { normalizePlate, plateTailOf } from '../vehicles/vehicle.rules';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { formatDateOnlyOrNull, todayKst } from '../common/date.util';
import { reinspectionOf, reinspectLabel, type Reinspection } from './reinspection';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { PushService } from '../push/push.service';

// ── DTO ──────────────────────────────

export class UpsertParkingDto {
  @IsString() @IsNotEmpty({ message: '주차장을 입력해 주세요.' }) @MaxLength(30) lot!: string;
  @IsString() @IsNotEmpty({ message: '구역을 입력해 주세요.' }) @MaxLength(30) zone!: string;
  @IsString() @IsNotEmpty({ message: '위치를 입력해 주세요.' }) @MaxLength(20) slot!: string;
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) @MaxLength(30) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차량명을 입력해 주세요.' }) @MaxLength(60) vehicleModel!: string;
  @IsOptional() @IsEnum(ParkingStatus) status?: ParkingStatus;
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsOptional() @IsString() memo?: string;
}

/** 자리 이동 — 끌어다 놓은 칸 */
export class MoveParkingDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) lot!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) zone!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) slot!: string;
}

export class UpdateParkingDto {
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleModel?: string;
  @IsOptional() @IsEnum(ParkingStatus) status?: ParkingStatus;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() memo?: string;
}

// ── Service ──────────────────────────────

const EMPLOYEE_SELECT = { employee: { select: { id: true, name: true } } };

/** 재검은 차량관리팀이 맡는다 — 여기와 관리자에게 알린다. */
const VEHICLE_TEAM = '차량관리팀';

/** 시트를 CSV로 받는 주소 — 시트가 바뀌면 .env 로 갈아끼운다. */
const DEFAULT_SHEET_CSV =
  'https://docs.google.com/spreadsheets/d/1SmBh_Grnd5yBiwY4jOxkRjz0P1GK2GilNgiSc8j3EIk/export?format=csv&gid=1762776087';

export interface SheetPreview {
  /** 들어올 자리 */
  spots: (ParsedSpot & { vehicleModel: string; occupiedBy?: string })[];
  /** 못 넣는 칸과 그 이유 */
  skipped: SkippedCell[];
  /** 시트에 있는데 차량관리에 없는 차량번호 — 같이 등록한다 */
  newVehicles: string[];
  /** 시트 전체에서 찾은 차량번호 수(이미 등록된 것 포함) */
  plateCount: number;
}

@Injectable()
export class ParkingService {
  private readonly logger = new Logger(ParkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  // ── 구글 시트 한 번 가져오기 ──────────────────────────────

  /**
   * 시트를 읽어 무엇이 들어올지 보여준다(아직 쓰지 않는다).
   *
   * 한 번 옮기고 끝낼 일이라 미리보기를 따로 둔다 — 백 대가 넘는 자리를 확인 없이
   * 덮어쓰면 무엇이 바뀌었는지 알 방법이 없다.
   */
  async previewSheet(): Promise<SheetPreview> {
    const csv = await this.fetchSheet();
    const { spots, skipped } = parseParkingSheet(csv);

    // 자리 배치와 별개로, 시트 어디에 적혀 있든 차량번호는 전부 차량관리에 올린다.
    const plates = collectPlates(csv);
    const registered = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { in: plates } },
      select: { vehicleNumber: true },
    });
    const registeredSet = new Set(registered.map((v) => v.vehicleNumber));
    const newVehicles = plates.filter((p) => !registeredSet.has(p));

    // 차량관리에 있는 차면 차량명을 같이 채운다(시트에는 번호만 있다).
    const known = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { in: spots.map((s) => s.vehicleNumber) } },
      select: { vehicleNumber: true, vehicleModel: true },
    });
    const modelOf = new Map(known.map((v) => [v.vehicleNumber, v.vehicleModel]));

    // 이미 앱에 등록된 차는 어디에 있는지 알려준다 — 덮어쓸지 판단할 근거가 된다.
    const existing = await this.prisma.parkingVehicle.findMany({
      where: { vehicleNumber: { in: spots.map((s) => s.vehicleNumber) } },
      select: { vehicleNumber: true, lot: true, zone: true, slot: true },
    });
    const placedAt = new Map(existing.map((v) => [v.vehicleNumber, `${v.lot} ${v.zone} ${v.slot}`]));

    return {
      spots: spots.map((s) => ({
        ...s,
        vehicleModel: modelOf.get(s.vehicleNumber) ?? '',
        ...(placedAt.has(s.vehicleNumber) ? { occupiedBy: placedAt.get(s.vehicleNumber) } : {}),
      })),
      skipped,
      newVehicles,
      plateCount: plates.length,
    };
  }

  /**
   * 실제로 옮긴다.
   *
   * 시트에 있는 차는 시트 자리로 맞춘다 — 앱 어딘가에 이미 있으면 그 자리를 비우고 옮긴다.
   * 한 트랜잭션으로 묶어, 중간에 끊겨 절반만 옮겨진 상태가 남지 않게 한다.
   */
  async importSheet(user: AuthUser) {
    const { spots, newVehicles } = await this.previewSheet();

    await this.prisma.$transaction(async (tx) => {
      // 차량관리에 없는 차를 먼저 올린다. 차명은 시트에 없어서 비워두고 나중에 채운다.
      if (newVehicles.length > 0) {
        await tx.managedVehicle.createMany({
          data: newVehicles.map((vehicleNumber) => ({
            vehicleNumber,
            plateTail: plateTailOf(vehicleNumber),
            vehicleModel: '',
          })),
          skipDuplicates: true,
        });
      }

      // 같은 차가 앱의 다른 자리에 있으면 먼저 치운다(칸도 차량번호도 겹치면 안 된다).
      await tx.parkingVehicle.deleteMany({
        where: { vehicleNumber: { in: spots.map((s) => s.vehicleNumber) } },
      });

      for (const s of spots) {
        await tx.parkingVehicle.upsert({
          where: { lot_zone_slot: { lot: s.lot, zone: s.zone, slot: s.slot } },
          create: {
            lot: s.lot,
            zone: s.zone,
            slot: s.slot,
            vehicleNumber: s.vehicleNumber,
            vehicleModel: s.vehicleModel,
            status: ParkingStatus.DISPLAY,
            employeeId: user.id,
            memo: s.memo,
          },
          update: {
            vehicleNumber: s.vehicleNumber,
            vehicleModel: s.vehicleModel,
            employeeId: user.id,
            memo: s.memo,
          },
        });
      }
    });

    return { imported: spots.length, vehiclesAdded: newVehicles.length };
  }

  private async fetchSheet(): Promise<string> {
    const url = this.config.get<string>('PARKING_SHEET_CSV_URL', DEFAULT_SHEET_CSV);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      throw new BadRequestException(
        '구글 시트를 읽지 못했습니다. 시트가 "링크가 있는 모든 사용자에게 공개"인지 확인해 주세요.',
      );
    }
    return res.text();
  }

  async findAll(params: { q?: string; lot?: string; status?: ParkingStatus }) {
    const where: Prisma.ParkingVehicleWhereInput = {
      ...(params.lot ? { lot: params.lot } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? { OR: [{ vehicleNumber: { contains: params.q } }, { vehicleModel: { contains: params.q } }] }
        : {}),
    };
    const rows = await this.prisma.parkingVehicle.findMany({
      where,
      include: EMPLOYEE_SELECT,
      orderBy: [{ lot: 'asc' }, { zone: 'asc' }, { slot: 'asc' }],
    });
    return this.withReinspection(rows);
  }

  /**
   * 서 있는 차마다 이전일자와 재검 시기를 붙여 준다.
   *
   * 이전일자는 차량관리에 있는 값이다. 주차장에 따로 적게 하면 두 곳이 어긋나고,
   * 어느 쪽이 맞는지 알 수 없게 된다 — 저장하지 않고 볼 때마다 붙인다.
   */
  private async withReinspection<T extends { vehicleNumber: string }>(rows: T[]) {
    if (rows.length === 0) return rows.map((r) => ({ ...r, transferDate: null, reinspect: null }));

    const vehicles = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { in: rows.map((r) => r.vehicleNumber) } },
      select: { vehicleNumber: true, transferDate: true },
    });
    // 띄어쓰기가 섞여 들어온 번호가 남아 있어 양쪽을 같은 모양으로 맞춰 짝짓는다.
    const transferOf = new Map(
      vehicles.map((v) => [normalizePlate(v.vehicleNumber), formatDateOnlyOrNull(v.transferDate)]),
    );

    const today = todayKst();
    return rows.map((r) => {
      const transferDate = transferOf.get(normalizePlate(r.vehicleNumber)) ?? null;
      return { ...r, transferDate, reinspect: reinspectionOf(transferDate, today) };
    });
  }

  /**
   * 넉 달이 지난(또는 곧 지나는) 차를 모아 준다 — 알림에 쓴다.
   *
   * 지난 지 오래된 차부터 앞에 놓는다. 여러 대가 한꺼번에 뜰 때 급한 것이 뒤에
   * 묻히면 알림이 있으나 마나가 된다.
   */
  async dueReinspections(): Promise<
    { vehicleNumber: string; vehicleModel: string; lot: string; zone: string; slot: string; transferDate: string | null; reinspect: Reinspection }[]
  > {
    const rows = await this.prisma.parkingVehicle.findMany({
      select: { vehicleNumber: true, vehicleModel: true, lot: true, zone: true, slot: true },
      orderBy: [{ lot: 'asc' }, { zone: 'asc' }, { slot: 'asc' }],
    });
    const withDates = await this.withReinspection(rows);
    return withDates
      .filter((r): r is (typeof withDates)[number] & { reinspect: Reinspection } => r.reinspect !== null)
      .sort((a, b) => a.reinspect.daysLeft - b.reinspect.daysLeft);
  }

  /**
   * 재검이 필요한 차를 차량관리팀에 알린다.
   *
   * 하루에 한 번, 한 장으로 묶어 보낸다 — 차마다 따로 울리면 열 대만 돼도 도배가 되고,
   * 그러면 아무도 안 본다.
   */
  async notifyReinspection(today: string): Promise<{ count: number }> {
    const due = (await this.dueReinspections()).filter((r) => r.reinspect.level === 'DUE');
    if (due.length === 0) return { count: 0 };

    const watchers = await this.prisma.employee.findMany({
      where: { active: true, OR: [{ department: VEHICLE_TEAM }, { role: Role.ADMIN }] },
      select: { id: true },
    });
    if (watchers.length === 0) return { count: 0 };
    const ids = watchers.map((w) => w.id);

    const lines = due.map(
      (r) =>
        `${r.vehicleNumber} ${r.vehicleModel} (${r.lot} ${r.zone} ${r.slot} · 이전 ${r.transferDate} · ${reinspectLabel(r.reinspect)})`.replace(
          /\s+/g,
          ' ',
        ),
    );
    const message = `재검 필요 ${due.length}대 — ${lines.join(' / ')}`;

    await this.prisma.notification.createMany({
      data: ids.map((employeeId) => ({
        type: NotificationType.REINSPECTION,
        message,
        employeeId,
        date: new Date(`${today}T00:00:00.000Z`),
      })),
    });
    this.realtime.toEmployees(ids, REALTIME_EVENT.notification, {
      type: NotificationType.REINSPECTION,
      message,
      date: today,
    });
    void this.push.sendToEmployees(ids, {
      title: `재검이 필요한 차 ${due.length}대`,
      body: lines.slice(0, 2).join(' / ') + (lines.length > 2 ? ' 외' : ''),
    });

    this.logger.log(`재검 알림: ${due.length}대`);
    return { count: due.length };
  }

  /**
   * 칸 등록/수정. 같은 칸(lot+zone+slot)은 유니크라 이미 차가 있으면 갈아끼운다.
   * 구역도에서 칸을 눌러 바로 바꾸는 흐름이라 upsert가 자연스럽다.
   */
  async upsert(dto: UpsertParkingDto) {
    const duplicate = await this.prisma.parkingVehicle.findFirst({
      where: { vehicleNumber: dto.vehicleNumber, NOT: { lot: dto.lot, zone: dto.zone, slot: dto.slot } },
    });
    if (duplicate) {
      throw new BadRequestException(
        `${dto.vehicleNumber} 차량이 이미 ${duplicate.lot} ${duplicate.zone} ${duplicate.slot}에 등록돼 있습니다.`,
      );
    }

    return this.prisma.parkingVehicle.upsert({
      where: { lot_zone_slot: { lot: dto.lot, zone: dto.zone, slot: dto.slot } },
      create: {
        lot: dto.lot,
        zone: dto.zone,
        slot: dto.slot,
        vehicleNumber: dto.vehicleNumber,
        vehicleModel: dto.vehicleModel,
        status: dto.status ?? ParkingStatus.DISPLAY,
        employeeId: dto.employeeId,
        memo: dto.memo ?? '',
      },
      update: {
        vehicleNumber: dto.vehicleNumber,
        vehicleModel: dto.vehicleModel,
        ...(dto.status ? { status: dto.status } : {}),
        employeeId: dto.employeeId,
        memo: dto.memo ?? '',
      },
      include: EMPLOYEE_SELECT,
    });
  }

  /**
   * 자리 이동. 빈 칸이면 옮기고, 차가 있으면 서로 자리를 바꾼다.
   *
   * 한 트랜잭션으로 묶는다 — 중간에 끊기면 두 차가 같은 칸에 있거나 한 대가 사라진다.
   * 칸(lot+zone+slot)이 유니크라 맞바꿀 때 곧장 갱신하면 제약에 걸린다.
   * 그래서 상대를 잠깐 임시 자리로 빼두고 세 번에 나눠 옮긴다.
   */
  async move(dto: MoveParkingDto) {
    const source = await this.prisma.parkingVehicle.findUnique({ where: { id: dto.id } });
    if (!source) throw new NotFoundException('옮길 차량을 찾을 수 없습니다.');

    if (source.lot === dto.lot && source.zone === dto.zone && source.slot === dto.slot) {
      return this.prisma.parkingVehicle.findMany({
        where: { id: source.id },
        include: EMPLOYEE_SELECT,
      });
    }

    const target = await this.prisma.parkingVehicle.findUnique({
      where: { lot_zone_slot: { lot: dto.lot, zone: dto.zone, slot: dto.slot } },
    });

    const moved = await this.prisma.$transaction(async (tx) => {
      if (!target) {
        return [
          await tx.parkingVehicle.update({
            where: { id: source.id },
            data: { lot: dto.lot, zone: dto.zone, slot: dto.slot },
            include: EMPLOYEE_SELECT,
          }),
        ];
      }

      // 같은 칸을 두 번 쓰지 않도록 상대를 먼저 임시 자리로 뺀다(자기 id라 겹칠 수가 없다).
      const parking = source.id.slice(0, 20);
      await tx.parkingVehicle.update({
        where: { id: target.id },
        data: { lot: '__swap__', zone: '__swap__', slot: parking },
      });

      const a = await tx.parkingVehicle.update({
        where: { id: source.id },
        data: { lot: dto.lot, zone: dto.zone, slot: dto.slot },
        include: EMPLOYEE_SELECT,
      });
      const b = await tx.parkingVehicle.update({
        where: { id: target.id },
        data: { lot: source.lot, zone: source.zone, slot: source.slot },
        include: EMPLOYEE_SELECT,
      });
      return [a, b];
    });

    return moved;
  }

  async update(id: string, dto: UpdateParkingDto) {
    await this.assertExists(id);
    return this.prisma.parkingVehicle.update({ where: { id }, data: dto, include: EMPLOYEE_SELECT });
  }

  /** 칸 비우기 */
  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.parkingVehicle.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const found = await this.prisma.parkingVehicle.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('주차 정보를 찾을 수 없습니다.');
  }
}

// ── Controller ──────────────────────────────

@Controller('parking')
export class ParkingController {
  constructor(private readonly parking: ParkingService) {}

  /** 구역도·리스트 모두 전 직원이 본다 */
  @Get()
  findAll(@Query('q') q?: string, @Query('lot') lot?: string, @Query('status') status?: ParkingStatus) {
    return this.parking.findAll({ q, lot, status });
  }

  /**
   * 칸 등록·수정.
   *
   * 관리자로 막지 않는다 — 차를 대고 자리를 적는 건 현장에서 하는 일이다.
   * 지우는 것만 관리자로 남긴다(자리를 잘못 적은 건 다시 적으면 되지만, 지운 건 되돌릴 수 없다).
   */
  @Post()
  upsert(@Body() dto: UpsertParkingDto) {
    return this.parking.upsert(dto);
  }

  /** 시트에서 무엇이 들어올지 미리 본다 — 아직 쓰지 않는다. */
  @Roles(Role.ADMIN)
  @Get('sheet/preview')
  previewSheet() {
    return this.parking.previewSheet();
  }

  /** 실제로 옮긴다. 한 번 하고 끝낼 일이라 관리자만 부른다. */
  @Roles(Role.ADMIN)
  @Post('sheet/import')
  @HttpCode(200)
  importSheet(@CurrentUser() user: AuthUser) {
    return this.parking.importSheet(user);
  }

  /**
   * 구역도에서 끌어다 놓기 — 빈 칸이면 이동, 차가 있으면 맞바꿈.
   *
   * 등록·삭제와 달리 관리자로 막지 않는다. 차를 실제로 옮기는 건 현장에서 하는 일이고,
   * 자리만 바뀔 뿐 내용은 그대로라 되돌리기도 쉽다.
   */
  @Post('move')
  @HttpCode(200)
  move(@Body() dto: MoveParkingDto) {
    return this.parking.move(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateParkingDto) {
    return this.parking.update(id, dto);
  }

  /**
   * 칸 비우기.
   *
   * 등록·이동과 마찬가지로 관리자로 막지 않는다 — 차가 빠지면 그 자리를 비우는 것도
   * 현장에서 하는 일이다. 지워도 잃는 건 자리 정보뿐이라 다시 적으면 된다
   * (차량관리의 차량 자체와 달리 주유·수리 이력이 딸려 사라지지 않는다).
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.parking.remove(id);
  }
}

// ── 매일 확인 ──────────────────────────────

/**
 * 아침에 한 번, 재검이 필요한 차를 차량관리팀에 알린다.
 *
 * 30분마다 깨어나 보낼 시간인지만 본다 — 정각에 맞추면 서버가 잠깐 내려갔을 때
 * 그날을 통째로 놓친다.
 */
@Injectable()
export class ReinspectionReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReinspectionReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private ranOn = '';

  constructor(
    private readonly parking: ParkingService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const hour = Number(this.config.get<string>('REINSPECT_REMINDER_HOUR', '9'));
    if (!Number.isFinite(hour) || hour < 0) {
      this.logger.log('REINSPECT_REMINDER_HOUR 가 꺼져 있어 재검 알림을 보내지 않습니다.');
      return;
    }
    this.timer = setInterval(() => void this.tick(hour), 30 * 60 * 1000);
    this.timer.unref?.();
    this.logger.log(`재검 확인 매일 ${hour}시`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(hour: number): Promise<void> {
    const today = todayKst();
    if (this.ranOn === today) return;

    const kstHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()),
    );
    if (kstHour < hour) return;

    this.ranOn = today;
    try {
      await this.parking.notifyReinspection(today);
    } catch (e) {
      // 실패해도 다음 날 다시 본다 — 알림 하나 때문에 서버가 죽으면 안 된다.
      this.logger.error(`재검 알림 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [ParkingController],
  providers: [ParkingService, ReinspectionReminderService],
})
export class ParkingModule {}
