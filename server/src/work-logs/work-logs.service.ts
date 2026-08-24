import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, toDateOnly } from '../common/date.util';
import type { CreateWorkLogDto, UpdateWorkLogDto } from './dto/work-log.dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class WorkLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    employee: { select: { id: true, name: true, position: true } },
  };

  private toView<T extends { date: Date }>(row: T) {
    return { ...row, date: formatDateOnly(row.date) };
  }

  /**
   * 주간 화면이 한 번에 그려지도록 [from, to] 범위를 통째로 내려준다.
   * 직원은 본인 일지만, 관리자는 employeeId로 직원을 골라 볼 수 있다(없으면 전체).
   */
  async findAll(user: AuthUser, params: { from?: string; to?: string; employeeId?: string }) {
    const scope = user.role === Role.ADMIN ? params.employeeId : user.id;

    const where: Prisma.WorkLogWhereInput = {
      ...(scope ? { employeeId: scope } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: toDateOnly(params.from) } : {}),
              ...(params.to ? { lte: toDateOnly(params.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.workLog.findMany({
      where,
      include: this.include,
      orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(user: AuthUser, dto: CreateWorkLogDto) {
    // 남의 일지에 적을 수 있는 건 관리자뿐이다.
    const employeeId = user.role === Role.ADMIN && dto.employeeId ? dto.employeeId : user.id;
    const date = toDateOnly(dto.date);

    // 순서를 안 주면 그날 목록 맨 뒤에 붙인다.
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(employeeId, date));

    const row = await this.prisma.workLog.create({
      data: { employeeId, date, content: dto.content, sortOrder },
      include: this.include,
    });
    return this.toView(row);
  }

  async update(id: string, user: AuthUser, dto: UpdateWorkLogDto) {
    await this.assertWritable(id, user);
    const row = await this.prisma.workLog.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.done !== undefined ? { done: dto.done } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: this.include,
    });
    return this.toView(row);
  }

  async remove(id: string, user: AuthUser) {
    await this.assertWritable(id, user);
    await this.prisma.workLog.delete({ where: { id } });
  }

  private async nextSortOrder(employeeId: string, date: Date): Promise<number> {
    const last = await this.prisma.workLog.findFirst({
      where: { employeeId, date },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  /** 수정·삭제는 본인 일지 또는 관리자만 */
  private async assertWritable(id: string, user: AuthUser): Promise<void> {
    const row = await this.prisma.workLog.findUnique({ where: { id }, select: { employeeId: true } });
    if (!row) throw new NotFoundException('작업일지를 찾을 수 없습니다.');
    if (user.role !== Role.ADMIN && row.employeeId !== user.id) {
      throw new ForbiddenException('본인 작업일지만 수정할 수 있습니다.');
    }
  }
}
