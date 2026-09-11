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
import { BrokerFeePayout, BrokerFeeType, NotificationType, Role } from '@prisma/client';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { transferFeeOf } from '../settlements/settlement.calc';
import { formatDateOnly, formatDateOnlyOrNull, monthRange, toDateOnly, toDateOnlyOrNull, todayKst } from '../common/date.util';
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

/**
 * 구전 지급방식 — 매입(BrokerFeeType)과 정산(BrokerFeePayout)이 이름만 다르고 같은 것이다.
 * 정산 줄을 만들 때 옮겨 담는다.
 */
const BROKER_FEE_PAYOUT: Record<BrokerFeeType, BrokerFeePayout> = {
  [BrokerFeeType.CASH]: BrokerFeePayout.CASH,
  [BrokerFeeType.WITHHOLD_3_3]: BrokerFeePayout.TAX_3_3,
  [BrokerFeeType.WITHHOLD_13_3]: BrokerFeePayout.TAX_13_3,
};
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// ── DTO ──────────────────────────────

export class CreatePurchaseIntakeDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  // 고객 이름·번호는 안 받아오는 경우가 있다(대리점에서 넘어온 차 등).
  // 그것 때문에 매입 기록 자체를 못 남기면 곤란하다. 차량번호와 차명만 있으면 된다.
  @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) customerName?: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(60) inspector?: string;

  @IsString() @MaxLength(150) vehicleName!: string;
  @IsOptional() @IsString() @MaxLength(120) detailModel?: string;
  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '최초등록일은 YYYY-MM-DD 형식이어야 합니다.' }) firstRegisteredOn?: string | null;
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
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: '최초등록일은 YYYY-MM-DD 형식이어야 합니다.' }) firstRegisteredOn?: string | null;
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
  /**
   * 기간으로 볼 때 쓴다(반기 등). month 가 있으면 그쪽이 먼저다.
   * 부가세는 반기로 맞춰보기 때문에 달 하나로는 안 된다.
   */
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) from?: string;
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) to?: string;
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
   * 카비어에 없는 값(고객번호·연식·연료)은 비워둔다 — 사람이 나중에 채운다.
   * 구전은 저쪽이 내려주지만(oldDealerFee) 안 적힌 계약도 있어서 그때는 0으로 들어간다.
   * 지급 방식(현금/3.3%/13.3%)은 저쪽에 없으니 기본값 현금으로 두고 필요하면 고친다.
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
          brokerFee: (contract.oldDealerFee ?? 0) * WON_PER_MANWON,
          date: formatDateOnly(new Date(contract.createdAt)),
        })),
        skipped,
      };
    }

    let imported = 0;
    for (const { contract, plate } of items) {
      try {
        const created = await this.prisma.purchaseIntake.create({
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
            brokerFee: (contract.oldDealerFee ?? 0) * WON_PER_MANWON,
            employeeId,
          },
        });
        await this.createSettlementDraft(created);
        await this.syncManagedVehicle(plate, contract.carModel ?? '', {
          priceManwon: contract.purchasePrice ?? 0,
          // 카비어는 연료·연식을 안 내려준다 — 차량 관리에서 채운다.
          fuel: '',
          modelYear: '',
          mileage: contract.mileage ?? 0,
          firstRegisteredOn: null,
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
      ...(params.month
        ? { date: monthRange(params.month) }
        : params.from || params.to
          ? {
              date: {
                ...(params.from ? { gte: toDateOnly(params.from) } : {}),
                ...(params.to ? { lte: toDateOnly(params.to) } : {}),
              },
            }
          : {}),
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
    const [registered, sales] = await Promise.all([this.registeredPlates(), this.salePrices()]);
    return rows.map((r) => this.toView(r, registered, sales));
  }

  async create(user: AuthUser, dto: CreatePurchaseIntakeDto) {
    const vehicleNumber = normalizePlate(dto.vehicleNumber);

    const row = await this.prisma.purchaseIntake.create({
      data: {
        date: toDateOnly(dto.date || todayKst()),
        customerPhone: dto.customerPhone?.trim() ?? '',
        customerName: dto.customerName?.trim() ?? '',
        source: dto.source?.trim() ?? '',
        inspector: dto.inspector?.trim() ?? '',
        vehicleName: dto.vehicleName.trim(),
        detailModel: dto.detailModel?.trim() ?? '',
        vehicleNumber,
        modelYear: dto.modelYear?.trim() ?? '',
        firstRegisteredOn: toDateOnlyOrNull(dto.firstRegisteredOn),
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

    await this.createSettlementDraft(row);
    await this.syncManagedVehicle(vehicleNumber, dto.vehicleName, {
      priceManwon: Math.round((dto.purchaseAmount ?? 0) / WON_PER_MANWON),
      fuel: dto.fuel?.trim() ?? '',
      modelYear: dto.modelYear?.trim() ?? '',
      // 실차 확인한 값이 있으면 그게 맞다.
      mileage: dto.checkedMileage || dto.mileage || 0,
      firstRegisteredOn: toDateOnlyOrNull(dto.firstRegisteredOn),
    });
    await this.alertMileageGap(row);
    return this.toView(row);
  }

  async update(id: string, dto: UpdatePurchaseIntakeDto) {
    await this.assertExists(id);
    const before = await this.prisma.purchaseIntake.findUnique({
      where: { id },
      select: { checkedMileage: true, inspector: true },
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
        ...(dto.firstRegisteredOn !== undefined
          ? { firstRegisteredOn: toDateOnlyOrNull(dto.firstRegisteredOn) }
          : {}),
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
      dto.firstRegisteredOn,
    ].some((v) => v !== undefined);

    if (affectsVehicle) {
      await this.syncManagedVehicle(row.vehicleNumber, row.vehicleName, {
        priceManwon: Math.round(row.purchaseAmount / WON_PER_MANWON),
        fuel: row.fuel,
        modelYear: row.modelYear,
        mileage: row.checkedMileage || row.mileage,
        firstRegisteredOn: row.firstRegisteredOn,
      });
    }

    // 검차자를 이번에 적었으면 정산도 그 사람 앞으로 넘긴다.
    // 카비어에서 자동으로 들어온 건은 검차자가 비어 있고, 실차를 본 사람이 나중에 적는다.
    if (dto.inspector !== undefined && row.inspector !== before?.inspector) {
      await this.moveSettlementOwner(row);
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
    policy?: {
      priceManwon: number;
      fuel: string;
      modelYear: string;
      mileage: number;
      firstRegisteredOn: Date | null;
    },
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
              firstRegisteredOn: policy.firstRegisteredOn,
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
  private toView<
    T extends {
      date: Date;
      firstRegisteredOn: Date | null;
      purchaseAmount: number;
      brokerFee: number;
      vehicleNumber?: string;
    },
  >(row: T, registeredPlates?: Set<string>, salePrices?: Map<string, number>) {
    return {
      ...row,
      date: formatDateOnly(row.date),
      firstRegisteredOn: formatDateOnlyOrNull(row.firstRegisteredOn),
      totalAmount: row.purchaseAmount + row.brokerFee,
      /**
       * 차량 관리에 올라가 있는가.
       *
       * 매입을 적으면 차량 관리에도 같이 올라가는데, 차량번호 형식이 다르거나 저장이
       * 막히면 조용히 건너뛴다. 그러면 재고금융 제시 대상에 안 뜨는데 왜인지 알 길이 없다.
       * 목록에서 바로 보이게 한다. 목록을 안 거쳐 들어온 경우에는 알 수 없어 true 로 둔다 —
       * 모르면서 '미등록'이라고 겁주지 않는다.
       */
      registered: registeredPlates
        ? registeredPlates.has(normalizePlate(row.vehicleNumber ?? ''))
        : true,
      /**
       * 이 차가 얼마에 팔렸는가(원). 아직 안 팔았으면 0.
       *
       * 매입 정산에 적은 차량판매가를 차량번호로 맞춰 온다. 부가세는 매입만으로는 안 나오고
       * 매출이 있어야 맞춰볼 수 있어서 여기까지 끌어온다.
       */
      salePrice: salePrices?.get(normalizePlate(row.vehicleNumber ?? '')) ?? 0,
    };
  }

  /**
   * 매입 정산에 빈 줄을 만들어 둔다.
   *
   * 매입하면 언젠가는 정산한다. 그런데 지금까지는 계약팀이 매입 관리를 보고 차량번호·
   * 차명·매입가·구전을 정산에 다시 쳐야 했다 — 이미 적혀 있는 값을 옮겨 적는 일이다.
   *
   * 상품화 비용과 판매가는 비워둔다. 그건 나중에 생기는 값이라 매입 시점에는 알 수 없다.
   * 계약팀이 그 빈칸을 채우면 정산이 된다.
   *
   * 같은 차를 두 번 매입해도 각각 한 줄씩 만든다 — 팔았다 되사온 건 다른 거래다.
   * 대신 같은 매입 건으로 두 번 만들지는 않는다(차량번호 + 매입일로 가른다).
   *
   * 실패해도 매입 기록은 그대로 둔다 — 정산 줄 하나 때문에 매입을 못 남기면 안 된다.
   * 빠진 건은 정산 화면에서 다시 만들 수 있다.
   */
  /**
   * 정산 담당자 — 실차를 본 사람이다.
   *
   * 실차 검차자 칸에 이름을 적으면 그 사람 앞으로 정산이 간다. 차를 직접 보고
   * 차키까지 세어 적은 사람이 그 차를 아는 사람이라, 빈칸을 채울 사람도 그 사람이다.
   * 매입을 화면에 옮겨 적기만 한 사람이 아니다.
   *
   * 검차자 칸에는 '검차업체(예나)' 처럼 회사 이름이 섞여 들어온다. 이름이 들어 있는지만
   * 본다. 긴 이름부터 봐야 '최수민'이 '수민'보다 먼저 맞는다.
   * 못 찾으면 적은 사람 앞으로 둔다 — 담당자가 비면 목록에서 걸러지지도 않는다.
   *
   * 상담(알선)은 건드리지 않는다. 상담은 받은 사람이 끝까지 끌고 가는 일이다.
   */
  private async settlementOwner(inspector: string, fallback: string): Promise<string> {
    const name = inspector.trim();
    if (!name) return fallback;

    const employees = await this.prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    const found = [...employees]
      .sort((a, b) => b.name.length - a.name.length)
      .find((e) => e.name.length > 1 && name.includes(e.name));

    return found?.id ?? fallback;
  }

  /**
   * 검차자가 바뀌면 그 차의 정산 담당자도 옮긴다.
   *
   * 승인이 찍힌 정산은 건드리지 않는다 — 결재한 뒤에 담당자가 저절로 바뀌면
   * 누구 걸 보고 찍었는지가 남지 않는다.
   */
  private async moveSettlementOwner(row: {
    vehicleNumber: string;
    date: Date;
    inspector: string;
    employeeId: string;
  }): Promise<void> {
    try {
      const owner = await this.settlementOwner(row.inspector, row.employeeId);
      const { count } = await this.prisma.purchaseSettlement.updateMany({
        where: { vehicleNumber: row.vehicleNumber, date: row.date, chiefApprovedAt: null },
        data: { employeeId: owner },
      });
      if (count > 0) this.logger.log(`${row.vehicleNumber} 정산 담당자를 검차자 앞으로 옮겼습니다.`);
    } catch (e) {
      // 못 옮겨도 매입 수정은 그대로 저장된다 — 정산에서 담당자를 고치면 된다.
      this.logger.warn(`정산 담당자를 못 옮겼습니다(${row.vehicleNumber}): ${(e as Error).message}`);
    }
  }

  private async createSettlementDraft(row: {
    vehicleNumber: string;
    vehicleName: string;
    date: Date;
    purchaseAmount: number;
    brokerFee: number;
    brokerFeeType: BrokerFeeType;
    inspector: string;
    employeeId: string;
  }): Promise<void> {
    try {
      const exists = await this.prisma.purchaseSettlement.findFirst({
        where: { vehicleNumber: row.vehicleNumber, date: row.date },
        select: { id: true },
      });
      if (exists) return;

      await this.prisma.purchaseSettlement.create({
        data: {
          date: row.date,
          vehicleName: row.vehicleName,
          vehicleNumber: row.vehicleNumber,
          purchasePrice: row.purchaseAmount,
          // 이전비는 매입가로 정해진다(상사 이전비 + 추가이전비) — 사람이 다시 적을 값이 아니다.
          transferFee: transferFeeOf(row.purchaseAmount),
          brokerFee: row.brokerFee,
          brokerFeePayout: BROKER_FEE_PAYOUT[row.brokerFeeType],
          // 상품화가 아직 안 끝나서 총비용을 모른다. 0 으로 두면 '매입가만큼 정산'으로
          // 잘못 굳으므로 계약팀이 채운 다음에 내게 한다.
          settlementAmount: 0,
          employeeId: await this.settlementOwner(row.inspector, row.employeeId),
          memo: '',
        },
      });
    } catch (e) {
      this.logger.warn(`매입 정산 줄을 만들지 못했습니다(${row.vehicleNumber}): ${(e as Error).message}`);
    }
  }

  /**
   * 매입한 차 중 정산 줄이 아직 없는 것 — 화면에서 만들어 채운다.
   *
   * 달로 가리지 않고 전부 올린다. 한때 9월치만 올렸는데, 그러면 7·8월에 사온 차의
   * 정산 줄이 아예 안 생겨서 알선 정산에 적어둔 판매금액이 갈 데가 없어졌다.
   * 지난 달 것을 안 보고 싶으면 화면에서 달을 골라 거른다.
   */
  async findSettlementDrafts() {
    const [intakes, settlements] = await Promise.all([
      this.prisma.purchaseIntake.findMany({
        select: {
          id: true,
          vehicleNumber: true,
          vehicleName: true,
          date: true,
          purchaseAmount: true,
          brokerFee: true,
          employee: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.purchaseSettlement.findMany({ select: { vehicleNumber: true, date: true } }),
    ]);

    const made = new Set(
      settlements.map((s) => `${normalizePlate(s.vehicleNumber)}|${formatDateOnly(s.date)}`),
    );

    return intakes
      .filter((i) => !made.has(`${normalizePlate(i.vehicleNumber)}|${formatDateOnly(i.date)}`))
      .map((i) => ({
        intakeId: i.id,
        vehicleNumber: i.vehicleNumber,
        vehicleName: i.vehicleName,
        date: formatDateOnly(i.date),
        totalAmount: i.purchaseAmount + i.brokerFee,
        employeeName: i.employee?.name ?? '',
      }));
  }

  /** 그 매입 건으로 정산 줄을 만든다. 이미 있으면 아무 일도 안 한다. */
  async makeSettlementDraft(intakeId: string) {
    const intake = await this.prisma.purchaseIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('매입 내역을 찾을 수 없습니다.');
    await this.createSettlementDraft(intake);
    return { ok: true };
  }

  /**
   * 차량번호별 차량판매가(원).
   *
   * 같은 차를 두 번 사고팔았으면 최근 것이 맞다.
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로 맞춘다.
   */
  private async salePrices(): Promise<Map<string, number>> {
    const rows = await this.prisma.purchaseSettlement.findMany({
      where: { salePrice: { gt: 0 } },
      select: { vehicleNumber: true, salePrice: true },
      orderBy: { date: 'asc' },
    });
    // 오래된 것부터 넣어 최근 것이 덮어쓰게 한다.
    return new Map(rows.map((r) => [normalizePlate(r.vehicleNumber), r.salePrice]));
  }

  /** 차량 관리에 올라가 있는 차량번호 — 목록에 등록 여부를 붙이는 데 쓴다. */
  private async registeredPlates(): Promise<Set<string>> {
    const rows = await this.prisma.managedVehicle.findMany({ select: { vehicleNumber: true } });
    return new Set(rows.map((r) => normalizePlate(r.vehicleNumber)));
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

  /** 매입했는데 정산 줄이 아직 없는 차 — 정산 화면에서 만들어 채운다. */
  @Get('settlement-drafts')
  findSettlementDrafts() {
    return this.intake.findSettlementDrafts();
  }

  /** 그 매입 건으로 정산 줄을 만든다. */
  @Post('settlement-drafts/:intakeId')
  makeSettlementDraft(@Param('intakeId') intakeId: string) {
    return this.intake.makeSettlementDraft(intakeId);
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
