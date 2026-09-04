import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsultationKind, ConsultationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { parseConsultationSheet } from './sheet-import';
import type { AuthUser } from '../auth/current-user.decorator';
import { formatDateOnly, formatDateOnlyOrNull, toDateOnly, toDateOnlyOrNull } from '../common/date.util';
import type { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 판매완료된 차의 주차 자리를 비운다.
   *
   * 출고되어 마당에 없는 차가 구역도에 남아 있으면 그 칸을 아무도 못 쓴다.
   * 자리를 비우는 것뿐이고 차량 관리의 차는 그대로 둔다 — 주유·수리 이력이 붙어 있고,
   * 되사오는 일도 있다.
   *
   * 차량번호는 사람이 손으로 적는 값이라 띄어쓰기가 섞여 들어온다. 있는 그대로와
   * 정리한 꼴 둘 다로 찾는다.
   *
   * 실패해도 상담 저장은 그대로 둔다 — 자리 하나 때문에 판매완료 처리를 못 하면 안 된다.
   */
  private async clearParkingSpot(vehicleNumber: string): Promise<void> {
    const candidates = [...new Set([vehicleNumber, normalizePlate(vehicleNumber)])].filter(Boolean);
    if (candidates.length === 0) return;

    try {
      const { count } = await this.prisma.parkingVehicle.deleteMany({
        where: { vehicleNumber: { in: candidates } },
      });
      if (count > 0) this.logger.log(`판매완료로 주차 자리를 비웠습니다: ${vehicleNumber}`);
    } catch (e) {
      this.logger.warn(`주차 자리를 비우지 못했습니다(${vehicleNumber}): ${(e as Error).message}`);
    }
  }

  private readonly include = {
    employee: { select: { id: true, name: true, position: true } },
    files: { select: { id: true, fileName: true, url: true } },
  };

  private toView<T extends { date: Date; visitDate: Date | null; nextContactDate: Date | null }>(row: T) {
    return {
      ...row,
      date: formatDateOnly(row.date),
      visitDate: formatDateOnlyOrNull(row.visitDate),
      nextContactDate: formatDateOnlyOrNull(row.nextContactDate),
    };
  }

  async findAll(params: { q?: string; status?: ConsultationStatus; employeeId?: string; kind?: ConsultationKind }) {
    const where: Prisma.ConsultationWhereInput = {
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      ...(params.q
        ? {
            OR: [
              { vehicleNumber: { contains: params.q } },
              { vehicleName: { contains: params.q } },
              { customerPhone: { contains: params.q } },
              { customerName: { contains: params.q } },
              { platform: { contains: params.q } },
            ],
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
        kind: dto.kind ?? ConsultationKind.BROKERAGE,
        platform: dto.platform?.trim() ?? '',
        vehicleNumber: dto.vehicleNumber,
        vehicleName: dto.vehicleName?.trim() ?? '',
        customerPhone: dto.customerPhone.trim(),
        customerName: dto.customerName?.trim() ?? '',
        employeeId: dto.employeeId,
        status: dto.status ?? ConsultationStatus.IN_PROGRESS,
        date: toDateOnly(dto.date),
        time: dto.time,
        content: dto.content,
        visitDate: toDateOnlyOrNull(dto.visitDate),
        visitTime: dto.visitTime?.trim() ?? '',
        depositAmount: dto.depositAmount ?? 0,
        nextContactDate: toDateOnlyOrNull(dto.nextContactDate),
      },
      include: this.include,
    });

    if (row.status === ConsultationStatus.SOLD) await this.clearParkingSpot(row.vehicleNumber);
    return this.toView(row);
  }

  async update(id: string, dto: UpdateConsultationDto) {
    await this.assertExists(id);
    const row = await this.prisma.consultation.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform.trim() } : {}),
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: dto.vehicleNumber } : {}),
        ...(dto.vehicleName !== undefined ? { vehicleName: dto.vehicleName.trim() } : {}),
        ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone.trim() } : {}),
        ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.time !== undefined ? { time: dto.time } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.visitDate !== undefined ? { visitDate: toDateOnlyOrNull(dto.visitDate) } : {}),
        ...(dto.visitTime !== undefined ? { visitTime: dto.visitTime.trim() } : {}),
        ...(dto.depositAmount !== undefined ? { depositAmount: dto.depositAmount } : {}),
        ...(dto.nextContactDate !== undefined
          ? { nextContactDate: toDateOnlyOrNull(dto.nextContactDate) }
          : {}),
      },
      include: this.include,
    });

    // 이미 판매완료였다가 다른 칸만 고친 경우에도 한 번 더 비운다 — 자리를 다시 적었을 수 있다.
    if (row.status === ConsultationStatus.SOLD) await this.clearParkingSpot(row.vehicleNumber);
    return this.toView(row);
  }

  /**
   * 구글 시트 '알선 상담 정리' 를 옮겨온다.
   *
   * 상담자 이름이 '도연', '수민' 처럼 일부만 적혀 있어서 직원 이름에 그 말이 들어가면
   * 같은 사람으로 본다. 못 찾으면 옮기는 사람 앞으로 둔다 — 담당자가 비면 목록에서
   * 걸러지지도 않고 나중에 누구 건지 알 수도 없다.
   *
   * 이미 넣은 번호는 건너뛴다. 시트에 계속 쌓이는 동안 여러 번 돌려도 겹치지 않는다.
   */
  async importFromSheet(user: AuthUser, csv: string, dryRun: boolean) {
    const { items, skipped } = parseConsultationSheet(csv);

    const existing = new Set(
      (
        await this.prisma.consultation.findMany({
          where: { sourceId: { not: null } },
          select: { sourceId: true },
        })
      ).map((r) => r.sourceId as string),
    );

    const employees = await this.prisma.employee.findMany({ select: { id: true, name: true } });
    const matchEmployee = (counselor: string): string | null => {
      const name = counselor.trim();
      if (!name) return null;
      // 긴 이름부터 본다 — '최수민'이 '수민'보다 먼저 맞아야 한다.
      const found = [...employees]
        .sort((a, b) => b.name.length - a.name.length)
        .find((e) => e.name === name || e.name.includes(name) || name.includes(e.name));
      return found?.id ?? null;
    };

    const fresh = items.filter((i) => !existing.has(i.sourceId));
    const already = items.length - fresh.length;

    if (dryRun) {
      const byKind = { EXPORT: 0, BROKERAGE: 0 };
      const unmatched = new Set<string>();
      for (const i of fresh) {
        byKind[i.kind] += 1;
        if (i.counselor && !matchEmployee(i.counselor)) unmatched.add(i.counselor);
      }
      return {
        total: items.length,
        already,
        toImport: fresh.length,
        exportCount: byKind.EXPORT,
        brokerageCount: byKind.BROKERAGE,
        unmatchedCounselors: [...unmatched],
        skipped,
        sample: fresh.slice(0, 20),
      };
    }

    // 1500건이 넘어 한 건씩 넣으면 오래 걸린다. 한 번에 밀어 넣는다.
    const created = await this.prisma.consultation.createMany({
      data: fresh.map((i) => ({
        sourceId: i.sourceId,
        kind: i.kind,
        platform: i.platform,
        vehicleNumber: i.vehicleNumber,
        vehicleName: i.vehicleName,
        customerPhone: i.customerPhone,
        customerName: '',
        employeeId: matchEmployee(i.counselor) ?? user.id,
        // 지난 상담이라 상태를 짐작하지 않는다. 종결로 두면 안 끝난 건이 묻힌다.
        status: ConsultationStatus.CLOSED,
        date: toDateOnly(i.date),
        time: '00:00',
        content: i.content,
      })),
      skipDuplicates: true,
    });

    return { imported: created.count, already, skipped };
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
