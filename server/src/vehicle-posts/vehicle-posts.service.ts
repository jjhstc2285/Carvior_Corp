import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

export const PHOTO_MAX = 5;

@Injectable()
export class VehiclePostsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    employee: { select: { id: true, name: true, position: true } },
    photos: { select: { id: true, url: true }, orderBy: { sortOrder: 'asc' as const } },
  };

  /** 게시판은 권한 구분 없이 전 직원이 전체 글을 본다. */
  async findAll(params: { q?: string; site?: string }) {
    const where: Prisma.VehiclePostWhereInput = {
      ...(params.site ? { site: params.site } : {}),
      ...(params.q
        ? {
            OR: [
              { vehicleNumber: { contains: params.q } },
              { vehicleModel: { contains: params.q } },
              { customerPhone: { contains: params.q } },
              { content: { contains: params.q } },
            ],
          }
        : {}),
    };
    return this.prisma.vehiclePost.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.vehiclePost.findUnique({ where: { id }, include: this.include });
    if (!row) throw new NotFoundException('매물 글을 찾을 수 없습니다.');
    return row;
  }

  create(employeeId: string, dto: { photos?: string[] } & Record<string, unknown>) {
    const photos = (dto.photos ?? []).slice(0, PHOTO_MAX);
    return this.prisma.vehiclePost.create({
      data: {
        site: dto.site as string,
        vehicleNumber: dto.vehicleNumber as string,
        vehicleModel: dto.vehicleModel as string,
        customerPhone: dto.customerPhone as string,
        content: dto.content as string,
        employeeId,
        photos: { create: photos.map((url, sortOrder) => ({ url, sortOrder })) },
      },
      include: this.include,
    });
  }

  async update(id: string, dto: { photos?: string[] } & Record<string, unknown>) {
    const existing = await this.findOne(id);

    // 글에서 빠진 사진은 디스크에서도 지운다 — 안 지우면 쓰레기 파일이 계속 쌓인다.
    if (dto.photos) {
      const keep = new Set(dto.photos);
      const removed = existing.photos.filter((p) => !keep.has(p.url));
      await Promise.all(removed.map((p) => this.deleteFile(p.url)));
    }

    return this.prisma.vehiclePost.update({
      where: { id },
      data: {
        ...(dto.site !== undefined ? { site: dto.site as string } : {}),
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: dto.vehicleNumber as string } : {}),
        ...(dto.vehicleModel !== undefined ? { vehicleModel: dto.vehicleModel as string } : {}),
        ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone as string } : {}),
        ...(dto.content !== undefined ? { content: dto.content as string } : {}),
        ...(dto.photos
          ? {
              photos: {
                deleteMany: {},
                create: dto.photos.slice(0, PHOTO_MAX).map((url, sortOrder) => ({ url, sortOrder })),
              },
            }
          : {}),
      },
      include: this.include,
    });
  }

  /** 삭제는 본인 글 또는 관리자만 */
  async remove(id: string, user: { id: string; role: Role }) {
    const post = await this.findOne(id);
    if (user.role !== Role.ADMIN && post.employeeId !== user.id) {
      throw new ForbiddenException('본인이 올린 글만 삭제할 수 있습니다.');
    }
    await Promise.all(post.photos.map((p) => this.deleteFile(p.url)));
    await this.prisma.vehiclePost.delete({ where: { id } });
  }

  /** DB 레코드가 사라진 뒤에도 파일이 남지 않게. 이미 없는 파일은 조용히 넘어간다. */
  private async deleteFile(url: string): Promise<void> {
    const uploadDir = process.env.UPLOAD_DIR ?? './uploads';
    const fileName = url.split('/').pop();
    if (!fileName) return;
    try {
      await unlink(join(uploadDir, 'vehicle-posts', fileName));
    } catch {
      // 파일이 이미 없거나 권한 문제 — 글 삭제 자체를 막을 이유는 없다
    }
  }
}
