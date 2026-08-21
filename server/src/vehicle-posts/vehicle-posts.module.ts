import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  BadRequestException,
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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PHOTO_MAX, VehiclePostsService } from './vehicle-posts.service';
import { CreateVehiclePostDto, UpdateVehiclePostDto } from './dto/vehicle-post.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const PHOTO_DIR = join(UPLOAD_DIR, 'vehicle-posts');
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB — 프론트에서 압축해 올리므로 넉넉한 상한
const ALLOWED = /^image\/(jpeg|png|webp|heic|heif)$/;

if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });

@Controller('vehicle-posts')
export class VehiclePostsController {
  constructor(private readonly posts: VehiclePostsService) {}

  @Get()
  findAll(@Query('q') q?: string, @Query('site') site?: string) {
    return this.posts.findAll({ q, site });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.posts.findOne(id);
  }

  /**
   * 사진 업로드 — 글 저장 전에 먼저 올리고 url 목록을 받아 글 본문과 함께 보낸다.
   * 원본 파일명은 쓰지 않고 UUID로 바꾼다(경로 조작·한글 파일명 문제 회피).
   */
  @Post('photos')
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_MAX, {
      storage: diskStorage({
        destination: PHOTO_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE, files: PHOTO_MAX },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED.test(file.mimetype)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('업로드할 사진이 없습니다.');
    // Apache가 /uploads 를 정적으로 서빙하므로 이 경로가 곧 접근 URL이 된다.
    return { urls: files.map((f) => `/uploads/vehicle-posts/${f.filename}`) };
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehiclePostDto) {
    return this.posts.create(user.id, dto as unknown as Record<string, unknown>);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehiclePostDto) {
    return this.posts.update(id, dto as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.posts.remove(id, user);
  }
}

@Module({
  controllers: [VehiclePostsController],
  providers: [VehiclePostsService],
})
export class VehiclePostsModule {}
