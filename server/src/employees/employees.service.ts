import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

const LIST_CACHE_KEY = 'employees:list';
const LIST_CACHE_TTL = 300; // 5분 — 명단은 거의 안 바뀌어서 캐시 효과가 크다

export interface EmployeeView {
  id: string;
  name: string;
  position: string;
  department: string | null;
  phones: string[];
  role: Role;
  active: boolean;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private readonly select = {
    id: true,
    name: true,
    position: true,
    department: true,
    role: true,
    active: true,
    phones: { select: { number: true }, orderBy: { sortOrder: 'asc' as const } },
  };

  private toView(row: {
    id: string;
    name: string;
    position: string;
    department: string | null;
    role: Role;
    active: boolean;
    phones: { number: string }[];
  }): EmployeeView {
    return { ...row, phones: row.phones.map((p) => p.number) };
  }

  async findAll(includeInactive = false): Promise<EmployeeView[]> {
    if (!includeInactive) {
      const cached = await this.redis.get<EmployeeView[]>(LIST_CACHE_KEY);
      if (cached) return cached;
    }

    const rows = await this.prisma.employee.findMany({
      where: includeInactive ? {} : { active: true },
      select: this.select,
      orderBy: { createdAt: 'asc' },
    });
    const list = rows.map((r) => this.toView(r));

    if (!includeInactive) await this.redis.set(LIST_CACHE_KEY, list, LIST_CACHE_TTL);
    return list;
  }

  async findOne(id: string): Promise<EmployeeView> {
    const row = await this.prisma.employee.findUnique({ where: { id }, select: this.select });
    if (!row) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
    return this.toView(row);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    const row = await this.prisma.employee.create({
      data: {
        name: dto.name,
        position: dto.position,
        department: dto.department ?? null,
        role: dto.role ?? Role.EMPLOYEE,
        active: dto.active ?? true,
        phones: { create: (dto.phones ?? []).map((number, sortOrder) => ({ number, sortOrder })) },
      },
      select: this.select,
    });
    await this.invalidate();
    return this.toView(row);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    await this.assertExists(id);

    // 관리자를 0명으로 만들어 아무도 못 들어가는 상황을 막는다.
    if (dto.role === Role.EMPLOYEE || dto.active === false) {
      await this.assertNotLastAdmin(id);
    }

    const row = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.phones
          ? { phones: { deleteMany: {}, create: dto.phones.map((number, sortOrder) => ({ number, sortOrder })) } }
          : {}),
      },
      select: this.select,
    });
    await this.invalidate();
    return this.toView(row);
  }

  /**
   * 퇴사 처리는 삭제가 아니라 active=false 로 한다.
   * 출퇴근·정산 기록이 그 직원을 참조하고 있어서 실제로 지우면 이력이 통째로 날아간다.
   */
  async deactivate(id: string): Promise<void> {
    await this.assertExists(id);
    await this.assertNotLastAdmin(id);
    await this.prisma.employee.update({ where: { id }, data: { active: false } });
    await this.invalidate();
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
  }

  private async assertNotLastAdmin(id: string): Promise<void> {
    const target = await this.prisma.employee.findUnique({ where: { id }, select: { role: true } });
    if (target?.role !== Role.ADMIN) return;

    const adminCount = await this.prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (adminCount <= 1) {
      throw new BadRequestException('마지막 관리자는 권한을 내리거나 비활성화할 수 없습니다.');
    }
  }

  private async invalidate(): Promise<void> {
    await this.redis.del(LIST_CACHE_KEY);
  }
}
