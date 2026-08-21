import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, toDateOnly, toDateOnlyOrNull } from '../common/date.util';
import type { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    employee: { select: { id: true, name: true, position: true } },
    files: { select: { id: true, fileName: true, url: true } },
  };

  private toView<T extends { date: Date; nextContactDate: Date | null }>(row: T) {
    return {
      ...row,
      date: formatDateOnly(row.date),
      nextContactDate: formatDateOnlyOrNull(row.nextContactDate),
    };
  }

  async findAll(params: { q?: string; status?: ConsultationStatus; employeeId?: string }) {
    const where: Prisma.ConsultationWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      ...(params.q
        ? {
            OR: [{ vehicleNumber: { contains: params.q } }, { customerName: { contains: params.q } }],
          }
        : {}),
    };

    const rows = await this.prisma.consultation.findMany({
      where,
      include: this.include,
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.consultation.findUnique({ where: { id }, include: this.include });
    if (!row) throw new NotFoundException('상담 내역을 찾을 수 없습니다.');
    return this.toView(row);
  }

  /** 고객명 클릭 시 보여줄 전체 상담 이력 */
  async findByCustomer(customerName: string) {
    const rows = await this.prisma.consultation.findMany({
      where: { customerName },
      include: this.include,
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(dto: CreateConsultationDto) {
    const row = await this.prisma.consultation.create({
      data: {
        vehicleNumber: dto.vehicleNumber,
        customerName: dto.customerName,
        employeeId: dto.employeeId,
        status: dto.status ?? ConsultationStatus.IN_PROGRESS,
        date: toDateOnly(dto.date),
        time: dto.time,
        content: dto.content,
        nextContactDate: toDateOnlyOrNull(dto.nextContactDate),
      },
      include: this.include,
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpdateConsultationDto) {
    await this.assertExists(id);
    const row = await this.prisma.consultation.update({
      where: { id },
      data: {
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: dto.vehicleNumber } : {}),
        ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.time !== undefined ? { time: dto.time } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.nextContactDate !== undefined
          ? { nextContactDate: toDateOnlyOrNull(dto.nextContactDate) }
          : {}),
      },
      include: this.include,
    });
    return this.toView(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.consultation.delete({ where: { id } });
  }

  /** 담당자별 상담 → 계약 전환율 */
  async conversionStats() {
    const grouped = await this.prisma.consultation.groupBy({
      by: ['employeeId', 'status'],
      _count: { _all: true },
    });

    const byEmployee = new Map<string, { total: number; contracted: number }>();
    for (const g of grouped) {
      const entry = byEmployee.get(g.employeeId) ?? { total: 0, contracted: 0 };
      entry.total += g._count._all;
      if (g.status === ConsultationStatus.CONTRACTED) entry.contracted += g._count._all;
      byEmployee.set(g.employeeId, entry);
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...byEmployee.keys()] } },
      select: { id: true, name: true },
    });

    return employees.map((e) => {
      const { total, contracted } = byEmployee.get(e.id)!;
      return {
        employeeId: e.id,
        name: e.name,
        total,
        contracted,
        rate: total > 0 ? Math.round((contracted / total) * 100) : 0,
      };
    });
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.consultation.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('상담 내역을 찾을 수 없습니다.');
  }
}
