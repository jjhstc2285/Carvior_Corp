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
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';

/**
 * 사내 게시판 — 전 직원이 보는 공지.
 *
 * 지금은 텔레그램 공지방으로만 돌린다. 방에 들어온 뒤의 글만 보이고, 지난 공지를 찾으려면
 * 올려 가며 뒤져야 한다. 들어오면 보이는 자리에 남겨 둔다.
 *
 * 읽는 건 전 직원, 쓰는 건 관리자다. 아무나 쓰게 두면 공지가 아니라 게시물이 된다 —
 * 그러면 "그건 공지가 아니라 누가 쓴 글"을 가리는 데 품이 든다.
 *
 * 금액은 여기에도 안 적는다. 전 직원이 보는 자리라는 점은 공지방과 같다.
 */

/*
  글에 넣는 사진.

  차량 사진과 같은 자리(uploads)에 두되 폴더만 따로 쓴다 — Apache 가 /uploads 를 그대로
  내주므로 올린 경로가 곧 보이는 주소가 된다.

  원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.

  차량 사진과 달리 지우지 않는다. 공지는 지난 것도 찾아보는 글이라, 한 달 뒤에 사진만
  사라지면 무슨 말인지 모르는 글이 남는다.
*/
const NOTICE_IMG_DIR = join(process.env.UPLOAD_DIR ?? './uploads', 'notices');
const MAX_IMG_SIZE = 12 * 1024 * 1024;
const ALLOWED_IMG = /^image\/(jpeg|png|webp|gif|heic|heif)$/;
const IMG_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

if (!existsSync(NOTICE_IMG_DIR)) mkdirSync(NOTICE_IMG_DIR, { recursive: true });

/** 아이폰에서 올리면 종류가 application/octet-stream 으로 오는 일이 있다 — 이름으로도 본다 */
function looksLikeImage(file: { mimetype: string; originalname: string }): boolean {
  return ALLOWED_IMG.test(file.mimetype) || IMG_EXT.test(file.originalname);
}

/** 갈래 — 화면과 같은 말을 쓰게 서버에서 내려준다 */
export const NOTICE_CATEGORIES = ['공지', '업무', '일반'] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

interface NoticeDto {
  category?: string;
  title?: string;
  body?: string;
  pinned?: boolean;
}

const AUTHOR = { author: { select: { id: true, name: true, position: true } } } as const;

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 고정한 글이 먼저, 그다음 최신 순 */
  async list(limit?: number) {
    return this.prisma.notice.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: AUTHOR,
      ...(limit && limit > 0 ? { take: limit } : {}),
    });
  }

  async one(id: string) {
    const row = await this.prisma.notice.findUnique({ where: { id }, include: AUTHOR });
    if (!row) throw new NotFoundException('공지를 찾을 수 없습니다.');
    return row;
  }

  private assertWriter(user: AuthUser): void {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('공지는 관리자만 올릴 수 있습니다.');
    }
  }

  private clean(dto: NoticeDto) {
    const category = (dto.category ?? '').trim();
    return {
      category: (NOTICE_CATEGORIES as readonly string[]).includes(category) ? category : '일반',
      title: (dto.title ?? '').trim().slice(0, 120),
      body: (dto.body ?? '').trim(),
      pinned: dto.pinned === true,
    };
  }

  async create(user: AuthUser, dto: NoticeDto) {
    this.assertWriter(user);
    const data = this.clean(dto);
    if (!data.title) throw new ForbiddenException('제목을 적어 주세요.');
    return this.prisma.notice.create({ data: { ...data, authorId: user.id }, include: AUTHOR });
  }

  async update(user: AuthUser, id: string, dto: NoticeDto) {
    this.assertWriter(user);
    await this.one(id);
    const data = this.clean(dto);
    return this.prisma.notice.update({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: data.category } : {}),
        ...(dto.title !== undefined ? { title: data.title } : {}),
        ...(dto.body !== undefined ? { body: data.body } : {}),
        ...(dto.pinned !== undefined ? { pinned: data.pinned } : {}),
      },
      include: AUTHOR,
    });
  }

  async remove(user: AuthUser, id: string) {
    this.assertWriter(user);
    await this.one(id);
    await this.prisma.notice.delete({ where: { id } });
  }
}

@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  /** 갈래 — 화면이 같은 말을 쓰게 내려준다 */
  @Get('categories')
  categories() {
    return NOTICE_CATEGORIES;
  }

  @Get()
  list(@Body() _body: unknown) {
    return this.notices.list();
  }

  /** 글에 넣을 사진 한 장 — 먼저 올려 주소를 받고, 그 주소를 글에 박는다 */
  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: NOTICE_IMG_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
      }),
      limits: { fileSize: MAX_IMG_SIZE, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!looksLikeImage(file)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    // 올리는 것도 쓰는 일이다 — 읽기만 되는 사람이 사진을 쌓아 두면 안 된다
    if (user.role !== Role.ADMIN) throw new ForbiddenException('공지는 관리자만 올릴 수 있습니다.');
    if (!file) throw new BadRequestException('올릴 사진이 없습니다.');
    return { url: `/uploads/notices/${file.filename}` };
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: NoticeDto) {
    return this.notices.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoticeDto) {
    return this.notices.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notices.remove(user, id);
  }
}

@Module({ controllers: [NoticesController], providers: [NoticesService] })
export class NoticesModule {}
