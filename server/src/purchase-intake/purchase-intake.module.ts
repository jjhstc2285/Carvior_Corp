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
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, toDateOnly, todayKst } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { isValidPlate, normalizePlate, plateTailOf } from '../vehicles/vehicle.rules';

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
  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @IsString() @MaxLength(20) fuel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) keyCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) purchaseAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) brokerFee?: number;
}

/** 수정용 — 등록용을 그대로 쓰면 한 칸만 고치는 요청이 필수값 누락으로 거절된다. */
export class UpdatePurchaseIntakeDto {
  @IsOptional() @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) date?: string;

  @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) customerName?: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(60) inspector?: string;

  @IsOptional() @IsString() @MaxLength(150) vehicleName?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) modelYear?: string;
  @IsOptional() @IsString() @MaxLength(20) fuel?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) keyCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) purchaseAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) brokerFee?: number;
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

  constructor(private readonly prisma: PrismaService) {}

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
        vehicleNumber,
        modelYear: dto.modelYear?.trim() ?? '',
        fuel: dto.fuel?.trim() ?? '',
        keyCount: dto.keyCount ?? 0,
        mileage: dto.mileage ?? 0,
        note: dto.note?.trim() ?? '',
        purchaseAmount: dto.purchaseAmount ?? 0,
        brokerFee: dto.brokerFee ?? 0,
        employeeId: user.id,
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });

    await this.syncManagedVehicle(vehicleNumber, dto.vehicleName);
    return this.toView(row);
  }

  async update(id: string, dto: UpdatePurchaseIntakeDto) {
    await this.assertExists(id);
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
        ...(vehicleNumber !== undefined ? { vehicleNumber } : {}),
        modelYear: dto.modelYear?.trim(),
        fuel: dto.fuel?.trim(),
        keyCount: dto.keyCount,
        mileage: dto.mileage,
        note: dto.note?.trim(),
        purchaseAmount: dto.purchaseAmount,
        brokerFee: dto.brokerFee,
      },
      include: { employee: { select: { id: true, name: true, position: true } } },
    });

    // 차량번호나 차명을 고쳤으면 차량관리 쪽도 따라가게 한다.
    if (vehicleNumber !== undefined || dto.vehicleName !== undefined) {
      await this.syncManagedVehicle(row.vehicleNumber, row.vehicleName);
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
  private async syncManagedVehicle(vehicleNumber: string, vehicleName: string): Promise<void> {
    if (!isValidPlate(vehicleNumber)) {
      this.logger.warn(`차량관리 등록 건너뜀 — 차량번호 형식이 규칙과 다릅니다: ${vehicleNumber}`);
      return;
    }

    try {
      await this.prisma.managedVehicle.upsert({
        where: { vehicleNumber },
        create: {
          vehicleNumber,
          plateTail: plateTailOf(vehicleNumber),
          vehicleModel: vehicleName.trim(),
        },
        update: { vehicleModel: vehicleName.trim() },
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
}

@Module({
  controllers: [PurchaseIntakeController],
  providers: [PurchaseIntakeService],
})
export class PurchaseIntakeModule {}
