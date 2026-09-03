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

  /** 이 사람이 볼 수 있는 일지의 주인 조건 */
  private async visibleEmployees(
    user: AuthUser,
    pickedEmployeeId?: string,
  ): Promise<Prisma.WorkLogWhereInput> {
    if (user.role === Role.ADMIN) {
      return pickedEmployeeId ? { employeeId: pickedEmployeeId } : {};
    }

    const me = await this.prisma.employee.findUnique({
      where: { id: user.id },
      select: { department: true },
    });
    if (!me?.department) return { employeeId: user.id };

    const team = await this.prisma.employee.findMany({
      where: { department: me.department, active: true },
      select: { id: true },
    });
    // 팀원 목록에 본인이 빠지는 일이 없게 넣어둔다(비활성 처리 중일 수도 있다).
    return { employeeId: { in: [...new Set([user.id, ...team.map((t) => t.id)])] } };
  }

  /**
   * 주간 화면이 한 번에 그려지도록 [from, to] 범위를 통째로 내려준다.
   *
   * 직원은 같은 팀 일지를 본다. 같은 일을 나눠 맡는 사람들이라 서로 뭘 하고 있는지
   * 알아야 하고, 자기 것만 보이면 팀 안에서도 매번 물어봐야 했다.
   * 팀이 정해지지 않은 사람은 본인 것만 본다 — 팀이 빈 사람끼리 묶이면 남남이 섞인다.
   *
   * 관리자는 전체를 보고 employeeId 로 한 사람만 골라 볼 수 있다.
   */
  async findAll(user: AuthUser, params: { from?: string; to?: string; employeeId?: string }) {
    const scope = await this.visibleEmployees(user, params.employeeId);

    const where: Prisma.WorkLogWhereInput = {
      ...scope,
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
