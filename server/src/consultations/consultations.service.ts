import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsultationKind, ConsultationStatus, NotificationType, PayMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { todayKst } from '../common/date.util';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { parseConsultationSheet } from './sheet-import';
import type { AuthUser } from '../auth/current-user.decorator';
import { formatDateOnly, formatDateOnlyOrNull, toDateOnly, toDateOnlyOrNull } from '../common/date.util';
import type { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';

/**
 * 출고 준비를 해야 하는 팀.
 *
 * 판매완료는 상담 담당자가 찍는데, 정작 광고를 내리고 차를 빼고 서류를 챙기는 건
 * 다른 팀이다. 상담 화면을 안 보는 사람들이라 알림으로 알린다.
 */
const RELEASE_TEAMS = ['광고팀', '차량관리팀'];

/** 상담은 알선팀이 맡는다 — 전환율은 이 팀만 센다(프론트 ConsultationModule 과 같다). */
const CONSULTATION_TEAM = '알선팀';

/**
 * 결제 구분을 저장할 모양으로.
 *
 * 현금이거나 안 정한 건은 할부 칸을 비운다 — 할부로 골랐다가 현금으로 되돌렸을 때
 * 캐피탈 이름이 남아 있으면 약정 집계가 부푼다.
 */
function payFieldsOf(dto: {
  payMethod?: PayMethod;
  installmentCapital?: string;
  installmentAmount?: number;
}) {
  const payMethod = dto.payMethod ?? PayMethod.UNKNOWN;
  if (payMethod !== PayMethod.INSTALLMENT) {
    return { payMethod, installmentCapital: '', installmentAmount: 0 };
  }
  return {
    payMethod,
    installmentCapital: dto.installmentCapital?.trim() ?? '',
    installmentAmount: dto.installmentAmount ?? 0,
  };
}

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 판매완료를 알린다.
   *
   * 처음 판매완료가 될 때만 보낸다 — 이미 판매완료인 건의 다른 칸만 고쳐도 매번
   * 울리면 아무도 안 보게 된다.
   *
   * 알림을 못 보내도 상담 저장은 그대로 둔다. 알림 하나 때문에 판매완료 처리를
   * 못 하면 안 된다.
   */
  private async notifyRelease(row: { vehicleNumber: string; vehicleName: string }): Promise<void> {
    try {
      const watchers = await this.prisma.employee.findMany({
        where: { active: true, OR: [{ department: { in: RELEASE_TEAMS } }, { role: 'ADMIN' }] },
        select: { id: true },
      });
      if (watchers.length === 0) return;
      const ids = watchers.map((w) => w.id);

      const car = `${row.vehicleNumber}${row.vehicleName ? ` ${row.vehicleName}` : ''}`;
      const message = `출고 예정 — ${car} 판매완료입니다. 광고를 내리고 출고 준비를 해주세요.`;
      const today = todayKst();

      await this.prisma.notification.createMany({
        data: ids.map((employeeId) => ({
          type: NotificationType.RELEASE_PENDING,
          message,
          employeeId,
          date: new Date(`${today}T00:00:00.000Z`),
        })),
      });
      this.realtime.toEmployees(ids, REALTIME_EVENT.notification, {
        type: NotificationType.RELEASE_PENDING,
        message,
        date: today,
      });
      void this.push.sendToEmployees(ids, { title: `출고 예정 — ${car}`, body: '광고를 내리고 출고 준비를 해주세요.' });
    } catch (e) {
      this.logger.warn(`출고 예정 알림을 보내지 못했습니다(${row.vehicleNumber}): ${(e as Error).message}`);
    }
  }

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

  private toView<T extends { date: Date; visitDate: Date | null; nextContactDate: Date | null }>(
    row: T,
    offerDates?: Map<string, string | null>,
  ) {
    return {
      ...row,
      date: formatDateOnly(row.date),
      visitDate: formatDateOnlyOrNull(row.visitDate),
      nextContactDate: formatDateOnlyOrNull(row.nextContactDate),
      /**
       * 매입날짜 — 차량 관리의 제시일자다.
       *
       * 상담에는 없는 값이라 차량번호로 맞춰 붙인다. 저장하지 않는다 — 차 쪽에서 날짜를
       * 고치면 상담도 같이 따라가야 한다. 한 건만 볼 때는 안 붙인다(목록에서만 쓴다).
       */
      offerDate: offerDates?.get(normalizePlate((row as { vehicleNumber?: string }).vehicleNumber ?? '')) ?? null,
    };
  }

  /**
   * 상담에 뜬 차들의 제시일자 — 차량번호로 맞춰 붙인다.
   *
   * 상담이 천 건이 넘어서 번호를 한 번에 밀어 넣으면 질의가 지나치게 커진다. 오백 개씩
   * 끊어 묻는다. 여기서 막히더라도 상담 목록은 나와야 한다 — 날짜 하나 못 붙였다고 화면
   * 전체가 비면 그게 더 큰 일이다.
   */
  private async offerDatesOf(plates: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(plates.filter(Boolean))];
    const out = new Map<string, string | null>();
    if (unique.length === 0) return out;

    try {
      const CHUNK = 500;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const rows = await this.prisma.managedVehicle.findMany({
          where: { vehicleNumber: { in: unique.slice(i, i + CHUNK) } },
          select: { vehicleNumber: true, offerDate: true },
        });
        for (const r of rows) out.set(normalizePlate(r.vehicleNumber), formatDateOnlyOrNull(r.offerDate));
      }
    } catch (e) {
      this.logger.warn(`제시일자를 붙이지 못했습니다: ${(e as Error).message}`);
    }
    return out;
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
    const offerDates = await this.offerDatesOf(rows.map((r) => normalizePlate(r.vehicleNumber)));
    return rows.map((r) => this.toView(r, offerDates));
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
        outsideDealer: dto.outsideDealer?.trim() ?? '',
        status: dto.status ?? ConsultationStatus.IN_PROGRESS,
        date: toDateOnly(dto.date),
        time: dto.time,
        content: dto.content,
        visitDate: toDateOnlyOrNull(dto.visitDate),
        visitTime: dto.visitTime?.trim() ?? '',
        depositAmount: dto.depositAmount ?? 0,
        nextContactDate: toDateOnlyOrNull(dto.nextContactDate),
        ...payFieldsOf(dto),
      },
      include: this.include,
    });

    if (row.status === ConsultationStatus.SOLD) {
      await this.clearParkingSpot(row.vehicleNumber);
      await this.notifyRelease(row);
    }
    return this.toView(row);
  }

  async update(id: string, dto: UpdateConsultationDto) {
    // 판매완료로 '바뀌는' 순간에만 알린다 — 고치기 전 상태를 알아야 한다.
    const before = await this.assertExists(id);
    const row = await this.prisma.consultation.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.outsideDealer !== undefined ? { outsideDealer: dto.outsideDealer.trim() } : {}),
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
        ...(dto.payMethod !== undefined ? payFieldsOf(dto) : {}),
      },
      include: this.include,
    });

    // 이미 판매완료였다가 다른 칸만 고친 경우에도 한 번 더 비운다 — 자리를 다시 적었을 수 있다.
    if (row.status === ConsultationStatus.SOLD) {
      await this.clearParkingSpot(row.vehicleNumber);
      if (before.status !== ConsultationStatus.SOLD) await this.notifyRelease(row);
    }
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
      // 시트에서 오는 건 알선·수출 둘뿐이지만, 분류가 늘어도 세다가 터지지 않게 열어 둔다
      const byKind: Record<string, number> = { EXPORT: 0, BROKERAGE: 0 };
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

  /**
   * 이번 달에 캐피탈사별로 깔아 준 할부.
   *
   * 재고금융을 쓴 캐피탈에는 그 회사 할부를 얼마 이상 써 줘야 하는 약정이 있다.
   * 얼마나 채웠는지는 상담에 적은 할부 내역으로 센다 — 알선·수출을 합쳐 본다.
   * 약정은 회사 대 회사라 어느 쪽에서 판 건인지로 갈리지 않는다.
   *
   * 종결된 상담은 뺀다 — 그건 안 팔린 건이라 깔린 할부가 없다.
   * 언제 깔았는지는 상담 일자로 본다.
   */
  async capitalInstallments(months: number) {
    const span = Math.min(Math.max(Math.trunc(months) || 1, 1), 12);
    const [y, m] = todayKst().split('-').map(Number);
    const from = new Date(Date.UTC(y, m - span, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const grouped = await this.prisma.consultation.groupBy({
      by: ['installmentCapital'],
      where: {
        date: { gte: from, lt: to },
        payMethod: PayMethod.INSTALLMENT,
        installmentCapital: { not: '' },
        status: { not: ConsultationStatus.CLOSED },
      },
      _sum: { installmentAmount: true },
      _count: { _all: true },
    });

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(new Date(to.getTime() - 86_400_000)),
      months: span,
      done: grouped.map((g) => ({
        capital: g.installmentCapital,
        amount: g._sum.installmentAmount ?? 0,
        count: g._count._all,
      })),
    };
  }

  /**
   * 담당자별 상담 → 계약 전환율.
   *
   * 세는 규칙은 화면(src/lib/consultationStats.ts)과 같아야 한다 — 같은 화면에 두 숫자가
   * 나오면 어느 쪽이 맞는지 알 수 없게 된다.
   *   · 계약  = 계약 + 판매완료 (판매완료는 계약이 된 뒤 출고까지 끝난 것이다)
   *   · 보류  = 계약이 미뤄진 것뿐 — 계약으로 안 세고 모수에는 남긴다
   *   · 종결  = 상담이 끝난 것 — 모수에서 뺀다. 넣으면 지난 상담을 정리할수록 숫자가
   *            떨어져서, 정리를 안 하는 쪽이 좋아 보인다
   *
   * 상담은 알선팀이 맡는다. 다른 팀 사람이 어쩌다 한 건 적어두면 1/1 = 100%로 뜨는데
   * 그건 실적이 아니라 잡음이라 세지 않는다.
   */
  async conversionStats() {
    const grouped = await this.prisma.consultation.groupBy({
      by: ['employeeId', 'status'],
      _count: { _all: true },
    });

    const employees = await this.prisma.employee.findMany({
      where: { department: CONSULTATION_TEAM },
      select: { id: true, name: true },
    });
    const names = new Map(employees.map((e) => [e.id, e.name]));

    const byEmployee = new Map<string, { total: number; contracted: number; onHold: number; closed: number }>();
    for (const g of grouped) {
      if (!names.has(g.employeeId)) continue;
      const entry = byEmployee.get(g.employeeId) ?? { total: 0, contracted: 0, onHold: 0, closed: 0 };
      const n = g._count._all;

      if (g.status === ConsultationStatus.CLOSED) {
        entry.closed += n;
      } else {
        entry.total += n;
        if (g.status === ConsultationStatus.CONTRACTED || g.status === ConsultationStatus.SOLD) entry.contracted += n;
        if (g.status === ConsultationStatus.ON_HOLD) entry.onHold += n;
      }
      byEmployee.set(g.employeeId, entry);
    }

    return [...byEmployee].map(([employeeId, s]) => ({
      employeeId,
      name: names.get(employeeId)!,
      ...s,
      rate: s.total > 0 ? Math.round((s.contracted / s.total) * 100) : 0,
    }));
  }

  /** 있는지 보고 고치기 전 상태를 돌려준다 — 판매완료로 '바뀌는' 순간을 가리는 데 쓴다. */
  private async assertExists(id: string) {
    const exists = await this.prisma.consultation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!exists) throw new NotFoundException('상담 내역을 찾을 수 없습니다.');
    return exists;
  }
}
