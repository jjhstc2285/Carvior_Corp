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
