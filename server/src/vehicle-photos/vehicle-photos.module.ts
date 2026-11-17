import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
  type OnModuleInit,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VehiclePhotoSlot } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
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

/**
 * 버킷 안에서 이 사진들이 사는 칸 — 앞에 붙는 접두어는 StorageService가 정한다.
 *
 * 전에는 상자 안 ./uploads/vehicles 에 떨어뜨리고 Apache가 내줬다. 차 한 대에 여섯 장,
 * 한 달에 백 대면 육백 장이라 디스크가 사진에 그대로 먹힌다 — carvior 상자는 29G 중
 * 6.5G만 남아 있다. S3로 보낸다.
 */
const PHOTO_FOLDER = 'vehicles';

/**
 * 사진을 얼마나 들고 있나 — 올린 날부터 한 달.
 *
 * 차 한 대에 여섯 장씩, 한 달에 백 대면 육백 장이 쌓인다. 상품화 사진은 그 차를 파는
 * 동안 쓰는 것이고 팔고 나면 다시 열어 볼 일이 거의 없다. 그대로 두면 상자 디스크가
 * 먼저 찬다.
 *
 * 지워지기 닷새 전부터 화면에 빨간 날짜가 뜬다 — 남겨야 할 사진은 그 사이에 내려받는다.
 */
const KEEP_DAYS = 30;
const WARN_DAYS = 5;
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

// 폴더를 미리 만들어 둘 일이 없어졌다 — S3는 폴더라는 것이 없고, 로컬 폴백은
// StorageService가 쓸 때 mkdir 한다.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 지워질 날까지 며칠 남았나 — 0이면 오늘, 음수는 이미 지날 때가 지난 것이다 */
function daysLeftOf(createdAt: Date): number {
  const gone = createdAt.getTime() + KEEP_DAYS * 24 * 60 * 60 * 1000;
  return Math.ceil((gone - Date.now()) / (24 * 60 * 60 * 1000));
}

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
export class VehiclePhotosService implements OnModuleInit {
  private readonly logger = new Logger(VehiclePhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 하루에 한 번 묵은 사진을 치운다.
   *
   * 뜰 때 한 번 먼저 돌린다 — 상자가 밤에 꺼져 있다 아침에 켜지면 정해진 시각이
   * 지나가 버린다. 치우다 넘어져도 앱은 그대로 떠야 한다(사진 때문에 전산이 멈추면 안 된다).
   */
  onModuleInit(): void {
    const run = () =>
      void this.sweepOld().catch((e: Error) => this.logger.warn(`사진 정리에 실패했습니다: ${e.message}`));
    run();
    setInterval(run, 24 * 60 * 60 * 1000).unref();
  }

  /**
   * 한 달이 지난 묶음을 치운다.
   *
   * 줄만 지우면 올린 파일은 상자에 그대로 남는다 — 지우는 뜻이 자리를 비우는 것이라
   * 파일까지 같이 지운다. 파일이 이미 없어도 넘어간다(손으로 지운 적이 있다).
   *
   * 하루에 한 번 돈다. 뜰 때 한 번 돌리는 이유는, 상자가 밤에 꺼져 있다 아침에 켜지면
   * 정해진 시각이 지나가 버리기 때문이다.
   */
  async sweepOld(): Promise<number> {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    const old = await this.prisma.vehiclePhotoSet.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, vehicleNumber: true, photos: { select: { url: true } } },
    });
    if (old.length === 0) return 0;

    // 파일부터 지우고 줄을 지운다. 파일이 남으면 아무도 찾지 못하는 쓰레기가 되지만,
    // 줄이 남으면 화면에 깨진 사진이 뜬다 — 뒤가 더 눈에 띄는 고장이다.
    // S3 주소와 옛 /uploads 경로를 StorageService가 알아서 가려낸다.
    for (const set of old) {
      await this.storage.removeAll(set.photos.map((p) => p.url));
    }

    await this.prisma.vehiclePhotoSet.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
    this.logger.log(`한 달 지난 상품화 사진 ${old.length}묶음을 지웠습니다.`);
    return old.length;
  }

  /**
   * 팔린 차를 가려낸다 — 차량번호로.
   *
   * 상품화 사진은 그 차를 파는 동안 쓰는 것이다. 나가고 나면 목록에 남아 있어 봐야
   * 지금 팔 차를 찾는 데 방해만 된다 — 주차장에서 차를 눌러도 이미 나간 차 사진이 떴다.
   *
   * 지우지는 않는다. 흠집을 두고 다투는 일은 넘기고 나서 생기고, 그때 기준이 되는 게
   * 이 여섯 장이다 — 나가자마자 지우면 정작 필요할 때 없다. 보관은 그대로 한 달이고,
   * 목록에서만 내린다(관리자는 [팔린 차도] 로 꺼내 본다).
   */
  private async soldPlates(plates: string[]): Promise<Set<string>> {
    if (plates.length === 0) return new Set();
    const rows = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { in: plates }, soldDate: { not: null } },
      select: { vehicleNumber: true },
    });
    return new Set(rows.map((r) => r.vehicleNumber));
  }

  async list(params: { vehicleNumber?: string; month?: string; includeSold?: boolean }) {
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

    /* 팔린 차는 목록에서 내린다 — 꺼내 보려면 includeSold 로 부른다 */
    const sold = await this.soldPlates([...new Set(rows.map((r) => r.vehicleNumber))]);
    const shown = params.includeSold ? rows : rows.filter((r) => !sold.has(r.vehicleNumber));

    return shown.map((r) => ({
      id: r.id,
      vehicleNumber: r.vehicleNumber,
      /** 이미 나간 차인가 — 꺼내 볼 때 표를 붙인다 */
      sold: sold.has(r.vehicleNumber),
      vehicleName: r.vehicleName,
      shotOn: formatDateOnly(r.shotOn),
      memo: r.memo,
      recordedBy: r.recordedBy?.name ?? '',
      /** 올린 날 — 여기서부터 보관 기간을 센다 */
      createdAt: r.createdAt.toISOString(),
      /** 지워질 날까지 며칠 남았나. 0이면 오늘 지워진다 */
      daysLeft: daysLeftOf(r.createdAt),
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

  /**
   * 두 칸의 사진을 맞바꾼다.
   *
   * 현장에서 급히 찍어 올리다 보면 좌·우가 뒤바뀌거나 계기판이 실내 칸에 들어간다.
   * 지웠다 다시 올리게 하면 그 사진을 다시 찾아야 하고, LTE로 한 장을 또 올려야 한다.
   *
   * 한쪽이 비어 있으면 그냥 옮긴다. 한 번에 지우고 한 번에 넣는다 — 중간에 끊겨도
   * 두 칸에 같은 사진이 남는 꼴이 안 된다.
   */
  async swapPhotos(setId: string, from: VehiclePhotoSlot, to: VehiclePhotoSlot) {
    if (from === to) return { id: setId };

    const rows = await this.prisma.vehiclePhoto.findMany({
      where: { setId, slot: { in: [from, to] } },
      select: { slot: true, url: true },
    });
    const a = rows.find((r) => r.slot === from);
    const b = rows.find((r) => r.slot === to);
    if (!a && !b) return { id: setId };

    await this.prisma.$transaction(async (tx) => {
      await tx.vehiclePhoto.deleteMany({ where: { setId, slot: { in: [from, to] } } });
      const made = [
        ...(a ? [{ setId, slot: to, url: a.url }] : []),
        ...(b ? [{ setId, slot: from, url: b.url }] : []),
      ];
      if (made.length > 0) await tx.vehiclePhoto.createMany({ data: made });
    });
    return { id: setId };
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
  constructor(
    private readonly service: VehiclePhotosService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(
    @Query('vehicleNumber') vehicleNumber?: string,
    @Query('month') month?: string,
    @Query('includeSold') includeSold?: string,
  ) {
    return this.service.list({ vehicleNumber, month, includeSold: includeSold === '1' });
  }

  /**
   * 사진 한 장 올리기 — 먼저 올려 경로를 받고, 그 경로를 묶음에 붙인다.
   *
   * 원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // 상자에 떨어뜨리지 않고 메모리로 받아 S3로 보낸다 — 디스크를 거치면
      // 올리다 실패한 파일이 그대로 남는다(지우는 사람도 없다).
      storage: memoryStorage(),
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
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('올릴 사진이 없습니다.');
    // 돌려주는 주소를 화면이 그대로 <img src>에 넣는다. S3면 절대주소,
    // AWS 키가 없는 개발 PC면 전과 같은 /uploads/… 가 온다.
    return { url: await this.storage.save(file, PHOTO_FOLDER) };
  }

  @Post('sets')
  upsertSet(@CurrentUser() user: AuthUser, @Body() dto: UpsertSetDto) {
    return this.service.upsertSet(user, dto);
  }

  @Post('photos')
  putPhoto(@CurrentUser() user: AuthUser, @Body() dto: PutPhotoDto) {
    return this.service.putPhoto(user, dto);
  }

  /** 두 칸의 사진을 맞바꾼다 — 끌어서 옮길 때 쓴다 */
  @Post('sets/:id/swap')
  swap(@Param('id') id: string, @Body() dto: { from?: VehiclePhotoSlot; to?: VehiclePhotoSlot }) {
    if (!dto.from || !dto.to) throw new BadRequestException('어느 칸끼리 바꿀지 없습니다.');
    return this.service.swapPhotos(id, dto.from, dto.to);
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
