import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokerFeeType, NotificationType, Role } from '@prisma/client';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, toDateOnly, todayKst } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { isValidPlate, normalizePlate, plateTailOf } from '../vehicles/vehicle.rules';
import { inferBodyType } from '../vehicles/body-type';
import { CarviorModule, CarviorService, type CarviorContract } from '../carvior/carvior.module';

/** 카비어는 만원, 매입 관리는 원으로 적는다. */
const WON_PER_MANWON = 10000;

/**
 * 실차 확인 주행거리가 이만큼 벌어지면 관리자에게 알린다.
 *
 * 계기판을 잘못 읽거나 한 자리 빠뜨리는 일이 있어서 몇백 km 차이로는 알리지 않는다.
 * 천 단위로 벌어지면 적어 온 값과 실제가 다른 것이고, 그러면 매입가를 다시 봐야 한다.
 */
const MILEAGE_GAP_ALERT_KM = 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// ── DTO ──────────────────────────────

export class CreatePurchaseIntakeDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  @IsString() @MaxLength(20) customerPhone!: string;
  @IsString() @MaxLength(30) customerName!: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(60) inspector?: string;

  @IsString() @MaxLength(150) vehicleName!: string;
  @IsOptional() @IsString() @MaxLength(120) detailModel?: string;
  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @IsString() @MaxLength(20) fuel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) keyCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) checkedMileage?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) purchaseAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) brokerFee?: number;
  @IsOptional() @IsEnum(BrokerFeeType) brokerFeeType?: BrokerFeeType;
}

/** 수정용 — 등록용을 그대로 쓰면 한 칸만 고치는 요청이 필수값 누락으로 거절된다. */
export class UpdatePurchaseIntakeDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) customerName?: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(60) inspector?: string;

  @IsOptional() @IsString() @MaxLength(150) vehicleName?: string;
  @IsOptional() @IsString() @MaxLength(120) detailModel?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @IsString() @MaxLength(20) fuel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) keyCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) checkedMileage?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) purchaseAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) brokerFee?: number;
  @IsOptional() @IsEnum(BrokerFeeType) brokerFeeType?: BrokerFeeType;
}

export class PurchaseIntakeQueryDto {
  @IsOptional() @Matches(MONTH_PATTERN, { message: 'month는 YYYY-MM 형식이어야 합니다.' }) month?: string;
  /** 고객이름·차량번호·차명·매입처 검색 */
  @IsOptional() @IsString() q?: string;
}

// ── Service ──────────────────────────────

@Injectable()
export class PurchaseIntakeService {
  private readonly logger = new Logger(PurchaseIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carvior: CarviorService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 실차 확인 주행거리가 처음 적은 것과 많이 벌어지면 관리자에게 알린다.
   *
   * 알림이 실패해도 저장은 되돌리지 않는다 — 확인 결과를 못 남기는 게 더 큰 문제다.
   */
  private async alertMileageGap(row: {
    vehicleNumber: string;
    vehicleName: string;
    mileage: number;
    checkedMileage: number;
    date: Date;
  }): Promise<void> {
    const gap = Math.abs(row.checkedMileage - row.mileage);
    if (row.checkedMileage <= 0 || gap < MILEAGE_GAP_ALERT_KM) return;

    try {
      const admins = await this.prisma.employee.findMany({
        where: { role: Role.ADMIN, active: true },
        select: { id: true },
      });
      if (admins.length === 0) return;

      const direction = row.checkedMileage > row.mileage ? '많습니다' : '적습니다';
      const message =
        `${row.vehicleNumber} ${row.vehicleName} — 실차 확인 주행거리가 ` +
        `${row.checkedMileage.toLocaleString()}km 로, 매입 시 ${row.mileage.toLocaleString()}km 보다 ` +
        `${gap.toLocaleString()}km ${direction}.`;

      // 관리자마다 한 건씩 — 각자 읽음 처리를 따로 한다(근태 알림과 같은 방식).
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          type: NotificationType.MILEAGE_GAP,
          message,
          employeeId: a.id,
          date: row.date,
        })),
      });

      const adminIds = admins.map((a) => a.id);
      this.realtime.toEmployees(adminIds, REALTIME_EVENT.notification, {
        type: NotificationType.MILEAGE_GAP,
        message,
        date: formatDateOnly(row.date),
      });
      void this.push.sendToEmployees(adminIds, { title: '주행거리 차이', body: message });
    } catch (e) {
      this.logger.warn(`주행거리 알림 실패(${row.vehicleNumber}): ${(e as Error).message}`);
    }
  }

  /**
   * 카비어에서 성사된 계약을 매입 내역으로 한 번에 옮긴다.
   *
   * 차량번호로 이미 매입 관리에 있는 건은 건너뛴다 — 같은 차를 두 번 사오는 일도
   * 있지만(팔았다 되사오는 경우), 일괄 등록을 두 번 눌러 생기는 중복이 훨씬 흔하다.
   * 되사온 건은 매입 등록 화면에서 손으로 넣는 편이 안전하다.
   *
   * 취소된 계약은 넣지 않는다. 성사되지 않은 건은 매입한 차가 아니다.
   *
   * 카비어에 없는 값(고객번호·연식·연료·구전)은 비워둔다 — 사람이 나중에 채운다.
   */
  async importFromCarvior(employeeId: string, dryRun: boolean) {
    const contracts = (await this.carvior.findContracts()).filter((c) => c.status !== 'CANCELLED');

    const existing = new Set(
      (await this.prisma.purchaseIntake.findMany({ select: { vehicleNumber: true } })).map(
        (r) => r.vehicleNumber,
      ),
    );

    const items: { contract: CarviorContract; plate: string }[] = [];
    const skipped: { vehicleNumber: string; reason: string }[] = [];
    // 카비어 안에서도 같은 차가 여러 계약으로 잡혀 있을 수 있다.
    const seen = new Set<string>();

    for (const c of contracts) {
      const plate = normalizePlate(c.carNumber ?? '');
      if (!isValidPlate(plate)) {
        skipped.push({ vehicleNumber: c.carNumber, reason: '차량번호 형식이 아닙니다' });
      } else if (existing.has(plate)) {
        skipped.push({ vehicleNumber: plate, reason: '이미 매입 관리에 있습니다' });
      } else if (seen.has(plate)) {
        skipped.push({ vehicleNumber: plate, reason: '카비어에 같은 차 계약이 두 건입니다' });
      } else {
        seen.add(plate);
        items.push({ contract: c, plate });
      }
    }

    // 미리보기 — 몇 건이 들어오고 무엇이 빠지는지 먼저 보여준다.
    if (dryRun) {
      return {
        total: contracts.length,
        items: items.map(({ contract, plate }) => ({
          vehicleNumber: plate,
          vehicleName: contract.carModel ?? '',
          customerName: contract.carOwner ?? '',
          source: contract.dealerName ?? '',
          purchaseAmount: (contract.purchasePrice ?? 0) * WON_PER_MANWON,
          date: formatDateOnly(new Date(contract.createdAt)),
        })),
        skipped,
      };
    }

    let imported = 0;
    for (const { contract, plate } of items) {
      try {
        await this.prisma.purchaseIntake.create({
          data: {
            date: toDateOnly(formatDateOnly(new Date(contract.createdAt))),
            customerPhone: '',
            customerName: (contract.carOwner ?? '').slice(0, 30),
            source: (contract.dealerName ?? '').slice(0, 120),
            inspector: '',
            vehicleName: (contract.carModel ?? '').slice(0, 150),
            // 카비어는 등급을 안 내려준다 — 시세를 조회하면서 사람이 채운다.
            detailModel: '',
            vehicleNumber: plate,
            modelYear: '',
            fuel: '',
            keyCount: contract.keyCount ?? 0,
            mileage: contract.mileage ?? 0,
            note: this.carviorNote(contract),
            purchaseAmount: (contract.purchasePrice ?? 0) * WON_PER_MANWON,
            brokerFee: (contract.brokerFee ?? 0) * WON_PER_MANWON,
            employeeId,
          },
        });
        await this.syncManagedVehicle(plate, contract.carModel ?? '', {
          priceManwon: contract.purchasePrice ?? 0,
          // 카비어는 연료·연식을 안 내려준다 — 차량 관리에서 채운다.
          fuel: '',
          modelYear: '',
          mileage: contract.mileage ?? 0,
        });
        imported += 1;
      } catch (e) {
        // 한 건이 막혀도 나머지는 들어가야 한다 — 94건을 한 건 때문에 다시 하게 두지 않는다.
        this.logger.warn(`카비어 매입 등록 실패(${plate}): ${(e as Error).message}`);
        skipped.push({ vehicleNumber: plate, reason: '등록하지 못했습니다' });
      }
    }

    return { imported, skipped };
  }

  /** 카비어에만 있는 값을 특이사항 한 줄로 남긴다 — 매입 대장에 따로 칸이 없다. */
  private carviorNote(c: CarviorContract): string {
    return [
      '카비어 수출계약',
      c.contractWriter ? `작성자 ${c.contractWriter}` : '',
      c.contractDeposit ? `계약금 ${c.contractDeposit.toLocaleString()}만원` : '',
      c.contractBalance ? `잔금 ${c.contractBalance.toLocaleString()}만원` : '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 255);
  }

  async findAll(params: PurchaseIntakeQueryDto) {
    const where: Prisma.PurchaseIntakeWhereInput = {
      ...(params.month ? { date: monthRange(params.month) } : {}),
      ...(params.q
        ? {
            OR: [
              { customerName: { contains: params.q } },
              { customerPhone: { contains: params.q } },
              { vehicleNumber: { contains: params.q } },
              { vehicleName: { contains: params.q } },
              { detailModel: { contains: params.q } },
              { source: { contains: params.q } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.purchaseIntake.findMany({
      where,
      include: { employee: { select: { id: true, name: true, position: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(user: AuthUser, dto: CreatePurchaseIntakeDto) {
    const vehicleNumber = normalizePlate(dto.vehicleNumber);

    const row = await this.prisma.purchaseIntake.create({
      data: {
        date: toDateOnly(dto.date || todayKst()),
        customerPhone: dto.customerPhone.trim(),
        customerName: dto.customerName.trim(),
        source: dto.source?.trim() ?? '',
        inspector: dto.inspector?.trim() ?? '',
        vehicleName: dto.vehicleName.trim(),
        detailModel: dto.detailModel?.trim() ?? '',
        vehicleNumber,
        modelYear: dto.modelYear?.trim() ?? '',
        fuel: dto.fuel?.trim() ?? '',
        keyCount: dto.keyCount ?? 0,
        mileage: dto.mileage ?? 0,
        checkedMileage: dto.checkedMileage ?? 0,
        note: dto.note?.trim() ?? '',
        purchaseAmount: dto.purchaseAmount ?? 0,
        brokerFee: dto.brokerFee ?? 0,
        brokerFeeType: dto.brokerFeeType ?? BrokerFeeType.CASH,
        employeeId: user.id,
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });

    await this.syncManagedVehicle(vehicleNumber, dto.vehicleName, {
      priceManwon: Math.round((dto.purchaseAmount ?? 0) / WON_PER_MANWON),
      fuel: dto.fuel?.trim() ?? '',
      modelYear: dto.modelYear?.trim() ?? '',
      // 실차 확인한 값이 있으면 그게 맞다.
      mileage: dto.checkedMileage || dto.mileage || 0,
    });
    await this.alertMileageGap(row);
    return this.toView(row);
  }

  async update(id: string, dto: UpdatePurchaseIntakeDto) {
    await this.assertExists(id);
    const before = await this.prisma.purchaseIntake.findUnique({
      where: { id },
      select: { checkedMileage: true },
    });
    const vehicleNumber = dto.vehicleNumber !== undefined ? normalizePlate(dto.vehicleNumber) : undefined;

    const row = await this.prisma.purchaseIntake.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        customerPhone: dto.customerPhone?.trim(),
        customerName: dto.customerName?.trim(),
        source: dto.source?.trim(),
        inspector: dto.inspector?.trim(),
        vehicleName: dto.vehicleName?.trim(),
        detailModel: dto.detailModel?.trim(),
        ...(vehicleNumber !== undefined ? { vehicleNumber } : {}),
        modelYear: dto.modelYear?.trim(),
        fuel: dto.fuel?.trim(),
        keyCount: dto.keyCount,
        mileage: dto.mileage,
        checkedMileage: dto.checkedMileage,
        note: dto.note?.trim(),
        purchaseAmount: dto.purchaseAmount,
        brokerFee: dto.brokerFee,
        brokerFeeType: dto.brokerFeeType,
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });

    // 차량번호나 차명을 고쳤으면 차량관리 쪽도 따라가게 한다.
    // 차량 관리가 이 값들을 보고 배치·제시 가능 여부를 가린다 — 하나라도 바뀌면 따라가야 한다.
    const affectsVehicle = [
      vehicleNumber,
      dto.vehicleName,
      dto.purchaseAmount,
      dto.fuel,
      dto.modelYear,
      dto.mileage,
      dto.checkedMileage,
    ].some((v) => v !== undefined);

    if (affectsVehicle) {
      await this.syncManagedVehicle(row.vehicleNumber, row.vehicleName, {
        priceManwon: Math.round(row.purchaseAmount / WON_PER_MANWON),
        fuel: row.fuel,
        modelYear: row.modelYear,
        mileage: row.checkedMileage || row.mileage,
      });
    }

    // 확인 주행거리를 이번에 적었을 때만 알린다 — 다른 칸을 고칠 때마다 또 울리면 안 된다.
    if (dto.checkedMileage !== undefined && dto.checkedMileage !== before?.checkedMileage) {
      await this.alertMileageGap(row);
    }
    return this.toView(row);
  }

  /**
   * 매입 기록은 지워도 차량관리의 차는 남긴다.
   * 이미 주유·주차 이력이 붙어 있을 수 있고, 잘못 적은 매입 건 하나 때문에
   * 실제로 마당에 있는 차가 목록에서 사라지면 곤란하다.
   */
  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.purchaseIntake.delete({ where: { id } });
  }

  /**
   * 매입한 차를 차량관리 탭에 띄운다.
   *
   * 이미 있는 차량번호면 차명만 맞춰준다(같은 차를 두 번 매입하는 경우가 있다 —
   * 팔았다가 되사오는 것도 같은 번호로 들어온다).
   *
   * 실패해도 매입 기록은 그대로 둔다 — 차량번호 형식이 특이해서 등록이 안 되더라도
   * 매입 내역 자체를 못 남기는 게 더 큰 문제다. 대신 로그로 남겨 나중에 손으로 넣게 한다.
   */
  private async syncManagedVehicle(
    vehicleNumber: string,
    vehicleName: string,
    policy?: { priceManwon: number; fuel: string; modelYear: string; mileage: number },
  ): Promise<void> {
    if (!isValidPlate(vehicleNumber)) {
      this.logger.warn(`차량관리 등록 건너뜀 — 차량번호 형식이 규칙과 다릅니다: ${vehicleNumber}`);
      return;
    }

    try {
      // 어디에 세울지는 값·차종·연료로 갈린다. 매입할 때 이미 아는 값이라 그때 같이 넣어둔다 —
      // 나중에 사람이 백 대를 하나씩 채우게 하지 않는다. 차종은 차명으로 짐작하고 틀리면 고친다.
      const model = vehicleName.trim();
      const derived = {
        vehicleModel: model,
        bodyType: inferBodyType(model),
        ...(policy
          ? {
              priceManwon: policy.priceManwon,
              fuel: policy.fuel,
              // 제시 가능 여부(10년 이내·20만km 미만)를 가리는 값이라 같이 채운다.
              modelYear: policy.modelYear,
              mileage: policy.mileage,
            }
          : {}),
      };

      await this.prisma.managedVehicle.upsert({
        where: { vehicleNumber },
        create: { vehicleNumber, plateTail: plateTailOf(vehicleNumber), ...derived },
        update: derived,
      });
    } catch (e) {
      this.logger.warn(`차량관리 등록 실패(${vehicleNumber}): ${(e as Error).message}`);
    }
  }

  private async assertExists(id: string) {
    const found = await this.prisma.purchaseIntake.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('매입 내역을 찾을 수 없습니다.');
  }

  /** 총 매입금액은 저장하지 않고 여기서 더한다(계산식이 바뀌어도 과거 데이터가 안 꼬이게). */
  private toView<T extends { date: Date; purchaseAmount: number; brokerFee: number }>(row: T) {
    return {
      ...row,
      date: formatDateOnly(row.date),
      totalAmount: row.purchaseAmount + row.brokerFee,
    };
  }
}

// ── 자동 등록 ──────────────────────────────

/**
 * 카비어에 새 계약이 생기면 매입 관리에 알아서 들어오게 한다.
 *
 * 버튼을 눌러야만 들어오면 누가 언제 눌렀는지에 따라 목록이 달라진다. 계약은 하루에도
 * 몇 건씩 생기는데 그때마다 사람이 챙길 수는 없다.
 *
 * 주기는 CARVIOR_AUTO_IMPORT_MINUTES(기본 10분)로 정하고, 0을 주면 아예 끈다.
 * 카비어가 죽어 있어도 서버는 그대로 돌아야 하므로 실패는 로그만 남기고 넘어간다.
 *
 * 등록자는 CARVIOR_IMPORT_EMPLOYEE_ID, 없으면 가장 먼저 만든 관리자로 남긴다 —
 * 매입 내역은 등록자가 필수라 누구든 하나는 있어야 한다.
 */
@Injectable()
export class CarviorAutoImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarviorAutoImportService.name);
  private timer: NodeJS.Timeout | null = null;
  /** 한 번이 늦어지면 다음 차례와 겹친다 — 겹치면 같은 계약을 두 번 넣으려 든다. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: PurchaseIntakeService,
    private readonly carvior: CarviorService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const minutes = Number(this.config.get<string>('CARVIOR_AUTO_IMPORT_MINUTES', '10'));
    if (!this.carvior.enabled) {
      this.logger.log('카비어 열쇠가 없어 자동 등록을 켜지 않습니다.');
      return;
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('CARVIOR_AUTO_IMPORT_MINUTES=0 — 자동 등록을 끕니다.');
      return;
    }

    // 서버가 막 뜬 순간엔 DB 연결이 아직 자리를 잡는 중이라 조금 두고 시작한다.
    setTimeout(() => void this.tick(), 30_000).unref?.();
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref?.();
    this.logger.log(`카비어 자동 등록 ${minutes}분마다`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const employeeId = await this.importerId();
      if (!employeeId) {
        this.logger.warn('등록자로 쓸 관리자가 없어 자동 등록을 건너뜁니다.');
        return;
      }

      const res = (await this.intake.importFromCarvior(employeeId, false)) as {
        imported: number;
      };

      // 새로 들어온 게 없으면 조용히 넘어간다 — 10분마다 로그를 남길 일이 아니다.
      if (res.imported > 0) {
        this.logger.log(`카비어에서 ${res.imported}건을 매입 관리에 등록했습니다.`);
        this.realtime.toAll(REALTIME_EVENT.purchaseIntake, { imported: res.imported });
      }
    } catch (e) {
      this.logger.warn(`카비어 자동 등록 실패: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async importerId(): Promise<string | null> {
    const configured = this.config.get<string>('CARVIOR_IMPORT_EMPLOYEE_ID', '');
    if (configured) {
      const found = await this.prisma.employee.findUnique({
        where: { id: configured },
        select: { id: true },
      });
      if (found) return found.id;
      this.logger.warn(`CARVIOR_IMPORT_EMPLOYEE_ID(${configured}) 로 직원을 찾지 못했습니다.`);
    }

    const admin = await this.prisma.employee.findFirst({
      where: { role: Role.ADMIN, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return admin?.id ?? null;
  }
}

// ── Controller ──────────────────────────────

/**
 * 매입 관리 — 차를 사올 때 받아 적는 인수 내역.
 *
 * 등록하면 같은 차량번호로 차량관리에도 차가 생긴다(이미 있으면 차명만 맞춘다).
 * 매입 담당이 직접 적는 화면이라 관리자로 막지 않는다 — 등록자는 기록에 남는다.
 */
@Controller('purchase-intake')
export class PurchaseIntakeController {
  constructor(private readonly intake: PurchaseIntakeService) {}

  @Get()
  findAll(@Query() query: PurchaseIntakeQueryDto) {
    return this.intake.findAll(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseIntakeDto) {
    return this.intake.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseIntakeDto) {
    return this.intake.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.intake.remove(id);
  }

  /** 카비어 계약 일괄 등록 — 무엇이 들어오고 무엇이 빠지는지 먼저 본다. */
  @Get('carvior/preview')
  preview(@CurrentUser() user: AuthUser) {
    return this.intake.importFromCarvior(user.id, true);
  }

  @Post('carvior/import')
  importCarvior(@CurrentUser() user: AuthUser) {
    return this.intake.importFromCarvior(user.id, false);
  }
}

@Module({
  imports: [CarviorModule, RealtimeModule, PushModule],
  controllers: [PurchaseIntakeController],
  providers: [PurchaseIntakeService, CarviorAutoImportService],
})
export class PurchaseIntakeModule {}
