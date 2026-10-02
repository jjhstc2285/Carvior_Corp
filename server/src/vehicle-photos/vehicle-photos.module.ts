import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VehiclePhotoSlot } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, toDateOnly } from '../common/date.util';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 상품화 차량 사진.
 *
 * 상품화가 끝나면 여섯 방향을 찍어 둔다. 지금은 각자 휴대폰에 남아서, 손님이 사진을
 * 달라고 하면 찍은 사람을 찾아 다녀야 하고 그 사람이 쉬는 날이면 못 준다.
 *
 * 나중에 흠집을 두고 다툴 때도 이 여섯 장이 기준이 된다 — 그래서 언제 찍은 것인지가
 * 사진 자체만큼 중요하다.
 */

const PHOTO_DIR = join(process.env.UPLOAD_DIR ?? './uploads', 'vehicles');
const MAX_PHOTO_SIZE = 12 * 1024 * 1024;
const ALLOWED_PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;

/**
 * 종류를 못 믿을 때 이름으로 본다.
 *
 * 아이폰에서 올리면 종류가 application/octet-stream 으로 오는 일이 있다(특히 HEIC).
 * 그러면 사진인데도 "이미지 파일만 올릴 수 있습니다" 로 막힌다 — 현장에서는 왜 안 되는지
 * 알 길이 없다. 끝 글자가 사진이면 받아준다.
 */
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

function looksLikePhoto(file: { mimetype: string; originalname: string }): boolean {
  return ALLOWED_PHOTO.test(file.mimetype) || PHOTO_EXT.test(file.originalname);
}

if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class UpsertSetDto {
  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @Matches(DATE) shotOn!: string;
  @IsOptional() @IsString() @MaxLength(191) memo?: string;
}

class PutPhotoDto {
  @IsString() @MaxLength(30) vehicleNumber!: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @Matches(DATE) shotOn!: string;
  @IsEnum(VehiclePhotoSlot) slot!: VehiclePhotoSlot;
  @IsString() @MaxLength(255) url!: string;
}

@Injectable()
export class VehiclePhotosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { vehicleNumber?: string; month?: string }) {
    const where: Record<string, unknown> = {};
    if (params.vehicleNumber) where.vehicleNumber = normalizePlate(params.vehicleNumber);
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const from = toDateOnly(`${params.month}-01`);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      where.shotOn = { gte: from, lt: to };
    }

    const rows = await this.prisma.vehiclePhotoSet.findMany({
      where,
      orderBy: [{ shotOn: 'desc' }, { vehicleNumber: 'asc' }],
      take: 300,
      include: { photos: true, recordedBy: { select: { name: true } } },
    });

    return rows.map((r) => ({
      id: r.id,
      vehicleNumber: r.vehicleNumber,
      vehicleName: r.vehicleName,
      shotOn: formatDateOnly(r.shotOn),
      memo: r.memo,
      recordedBy: r.recordedBy?.name ?? '',
      // 화면은 칸 이름으로 바로 꺼내 쓴다
      photos: Object.fromEntries(r.photos.map((p) => [p.slot, p.url])) as Record<string, string>,
    }));
  }

  /** 차와 날로 하나만 둔다 — 같은 날 두 묶음이 있으면 어느 게 최신인지 알 수가 없다 */
  private async setOf(user: AuthUser, dto: { vehicleNumber: string; vehicleName?: string; shotOn: string }) {
    const vehicleNumber = normalizePlate(dto.vehicleNumber);
    if (!vehicleNumber) throw new BadRequestException('차량번호를 입력해 주세요.');
    const shotOn = toDateOnly(dto.shotOn);

    return this.prisma.vehiclePhotoSet.upsert({
      where: { vehicleNumber_shotOn: { vehicleNumber, shotOn } },
      create: {
        vehicleNumber,
        vehicleName: dto.vehicleName ?? '',
        shotOn,
        recordedById: user.id,
      },
      // 차명은 비어 있을 때만 채운다 — 나중에 손으로 고친 이름을 덮어쓰지 않는다
      update: dto.vehicleName ? { vehicleName: dto.vehicleName } : {},
    });
  }

  async upsertSet(user: AuthUser, dto: UpsertSetDto) {
    const set = await this.setOf(user, dto);
    if (dto.memo !== undefined) {
      await this.prisma.vehiclePhotoSet.update({ where: { id: set.id }, data: { memo: dto.memo } });
    }
    return { id: set.id };
  }

  /** 한 방향에 한 장. 다시 올리면 갈아끼운다 */
  async putPhoto(user: AuthUser, dto: PutPhotoDto) {
    const set = await this.setOf(user, dto);
    await this.prisma.vehiclePhoto.upsert({
      where: { setId_slot: { setId: set.id, slot: dto.slot } },
      create: { setId: set.id, slot: dto.slot, url: dto.url },
      update: { url: dto.url },
    });
    return { id: set.id };
  }

  async removePhoto(setId: string, slot: VehiclePhotoSlot) {
    await this.prisma.vehiclePhoto.deleteMany({ where: { setId, slot } });
  }

  /** 묶음째 지운다 — 사진 줄은 따라 지워진다 */
  async removeSet(id: string) {
    await this.prisma.vehiclePhotoSet.deleteMany({ where: { id } });
  }
}

@Controller('vehicle-photos')
export class VehiclePhotosController {
  constructor(private readonly service: VehiclePhotosService) {}

  @Get()
  list(@Query('vehicleNumber') vehicleNumber?: string, @Query('month') month?: string) {
    return this.service.list({ vehicleNumber, month });
  }

  /**
   * 사진 한 장 올리기 — 먼저 올려 경로를 받고, 그 경로를 묶음에 붙인다.
   *
   * 원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PHOTO_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
      }),
      limits: { fileSize: MAX_PHOTO_SIZE, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!looksLikePhoto(file)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('올릴 사진이 없습니다.');
    // Apache가 /uploads 를 정적으로 내주므로 이 경로가 곧 보이는 주소가 된다.
    return { url: `/uploads/vehicles/${file.filename}` };
  }

  @Post('sets')
  upsertSet(@CurrentUser() user: AuthUser, @Body() dto: UpsertSetDto) {
    return this.service.upsertSet(user, dto);
  }

  @Post('photos')
  putPhoto(@CurrentUser() user: AuthUser, @Body() dto: PutPhotoDto) {
    return this.service.putPhoto(user, dto);
  }

  @Delete('sets/:id/photos/:slot')
  @HttpCode(204)
  async removePhoto(@Param('id') id: string, @Param('slot') slot: VehiclePhotoSlot) {
    await this.service.removePhoto(id, slot);
  }

  @Delete('sets/:id')
  @HttpCode(204)
  async removeSet(@Param('id') id: string) {
    await this.service.removeSet(id);
  }
}

@Module({ controllers: [VehiclePhotosController], providers: [VehiclePhotosService] })
export class VehiclePhotosModule {}
