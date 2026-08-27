import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParkingStatus, Prisma, Role } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';

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

@Injectable()
export class ParkingService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(params: { q?: string; lot?: string; status?: ParkingStatus }) {
    const where: Prisma.ParkingVehicleWhereInput = {
      ...(params.lot ? { lot: params.lot } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? { OR: [{ vehicleNumber: { contains: params.q } }, { vehicleModel: { contains: params.q } }] }
        : {}),
    };
    return this.prisma.parkingVehicle.findMany({
      where,
      include: EMPLOYEE_SELECT,
      orderBy: [{ lot: 'asc' }, { zone: 'asc' }, { slot: 'asc' }],
    });
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

  @Roles(Role.ADMIN)
  @Post()
  upsert(@Body() dto: UpsertParkingDto) {
    return this.parking.upsert(dto);
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

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateParkingDto) {
    return this.parking.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.parking.remove(id);
  }
}

@Module({
  controllers: [ParkingController],
  providers: [ParkingService],
})
export class ParkingModule {}
