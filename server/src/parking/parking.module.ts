import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParkingStatus, Prisma, Role } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { collectPlates, parseParkingSheet, type ParsedSpot, type SkippedCell } from './sheet-import';
import { plateTailOf } from '../vehicles/vehicle.rules';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

// 매물 사진과 같은 자리에 둔다 — Apache 가 /uploads 를 정적으로 내보내고 있어서
// 이 경로가 곧 브라우저에서 여는 주소가 된다.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const PHOTO_DIR = join(UPLOAD_DIR, 'parking');
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB — 화면에서 줄여 올리므로 넉넉한 상한
const ALLOWED_IMAGE = /^image\/(jpeg|png|webp|heic|heif)$/;

if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });

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
  /** 주차된 모습(전면) 한 장. 빈 문자열이면 지운다는 뜻이다. */
  @IsOptional() @IsString() @MaxLength(255) photoUrl?: string;
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
  @IsOptional() @IsString() @MaxLength(255) photoUrl?: string;
}

// ── Service ──────────────────────────────

const EMPLOYEE_SELECT = { employee: { select: { id: true, name: true } } };

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    // 사진을 바꾸거나 지우면 옛 파일은 아무도 못 보게 된다 — 디스크에만 남지 않게 지운다.
    const before = await this.prisma.parkingVehicle.findUnique({
      where: { lot_zone_slot: { lot: dto.lot, zone: dto.zone, slot: dto.slot } },
      select: { photoUrl: true },
    });

    const saved = await this.prisma.parkingVehicle.upsert({
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
        photoUrl: dto.photoUrl ?? '',
      },
      update: {
        vehicleNumber: dto.vehicleNumber,
        vehicleModel: dto.vehicleModel,
        ...(dto.status ? { status: dto.status } : {}),
        employeeId: dto.employeeId,
        memo: dto.memo ?? '',
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      },
      include: EMPLOYEE_SELECT,
    });

    if (before?.photoUrl && before.photoUrl !== saved.photoUrl) {
      await this.deletePhoto(before.photoUrl);
    }
    return saved;
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
    const row = await this.prisma.parkingVehicle.findUnique({
      where: { id },
      select: { photoUrl: true },
    });
    await this.prisma.parkingVehicle.delete({ where: { id } });
    // 자리를 비우면 사진도 같이 지운다 — 파일만 남으면 아무도 못 찾고 용량만 먹는다.
    if (row?.photoUrl) await this.deletePhoto(row.photoUrl);
  }

  /** 파일이 이미 없거나 권한이 없어도 자리 비우기 자체를 막을 이유는 없다. */
  private async deletePhoto(url: string): Promise<void> {
    const fileName = url.split('/').pop();
    if (!fileName) return;
    try {
      await unlink(join(PHOTO_DIR, fileName));
    } catch {
      // 무시
    }
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
   * 주차 사진 한 장 — 자리를 저장하기 전에 먼저 올리고, 받은 주소를 photoUrl 로 같이 보낸다.
   *
   * 원본 파일명은 쓰지 않고 UUID로 바꾼다(경로 조작·한글 파일명 문제 회피).
   * 사진은 현장에서 찍어 올리는 거라 관리자로 막지 않는다.
   */
  @Post('photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PHOTO_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE.test(file.mimetype)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('업로드할 사진이 없습니다.');
    return { url: `/uploads/parking/${file.filename}` };
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

@Module({
  controllers: [ParkingController],
  providers: [ParkingService],
})
export class ParkingModule {}
