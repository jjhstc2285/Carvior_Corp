import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsultationKind, ConsultationStatus, NotificationType, PayMethod, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { todayKst } from '../common/date.util';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { parseConsultationSheet } from './sheet-import';
import type { AuthUser } from '../auth/current-user.decorator';
import { assignVisits } from './visit-slot';
import { formatDateOnly, formatDateOnlyOrNull, toDateOnly, toDateOnlyOrNull } from '../common/date.util';
import type { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';
import { TelegramService } from '../telegram/telegram.module';

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

/** 방문을 맡는 팀 — 상담도 이 팀이 받는다(화면의 전환율도 같은 팀만 센다) */
const VISIT_TEAM = '알선팀';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * 방문 약속이 잡혔다고 알린다.
   *
   * 손님이 온다는 건 차를 빼 두고 키를 챙겨 둬야 한다는 뜻이다. 약속은 상담 받는
   * 사람이 잡는데 차를 빼는 건 현장이라, 지금은 잡아 놓고 따로 전화를 한다.
   *
   * 날이 새로 잡히거나 바뀔 때만 보낸다.
   */
  private announceVisit(
    before: { visitDate: Date | null } | null,
    row: { vehicleNumber: string; vehicleName: string; visitDate: Date | null; visitTime: string; customerPhone: string },
  ): void {
    if (!row.visitDate) return;
    const same = before?.visitDate && before.visitDate.getTime() === row.visitDate.getTime();
    if (same) return;

    const day = formatDateOnly(row.visitDate);
    const car = `${row.vehicleNumber}${row.vehicleName ? ` ${row.vehicleName}` : ''}`;
    this.telegram.notify(
      [
        '🗓 <b>방문 예약</b>',
        `<b>${car}</b>`,
        `${day}${row.visitTime ? ` ${row.visitTime}` : ''}`,
        '',
        '➡️ 다음: 차 빼두기 · 키 준비',
      ].join('\n'),
    );
  }

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

      /*
        공지방에도 띄운다.

        앱 알림은 출고 챙기는 팀과 관리자에게만 간다. 그런데 계약이 됐다는 건 광고
        내리는 사람도, 주차 옮기는 사람도, 키 내주는 사람도 알아야 한다 — 자리마다
        해야 할 일이 생긴다.
      */
      this.telegram.notify(
        ['🤝 <b>계약 체결</b>', `<b>${car}</b>`, '', '➡️ 다음: 광고 내리기 · 정산 · 매도 찍기 · 주차 비우기'].join('\n'),
      );
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
      /*
        번호로 바로 묻지 않는다.

        차량번호는 손으로 적는 값이라 '124도 7252' 처럼 공백이 섞여 저장돼 있다. 공백을
        걷어낸 번호로 in 질의를 걸면 저장된 글자와 달라 한 건도 안 걸린다.

        번호와 날짜만 읽어와서 공백을 걷어낸 뒤 맞춘다.
      */
      const want = new Set(unique);
      const rows = await this.prisma.managedVehicle.findMany({
        select: { vehicleNumber: true, offerDate: true },
      });
      for (const r of rows) {
        const plate = normalizePlate(r.vehicleNumber);
        if (want.has(plate)) out.set(plate, formatDateOnlyOrNull(r.offerDate));
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
        visitDealerId: dto.visitDealerId?.trim() || null,
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
    this.announceVisit(null, row);
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
        // 빈 글자로 오면 '아직 안 정함'으로 되돌린다
        ...(dto.visitDealerId !== undefined ? { visitDealerId: dto.visitDealerId?.trim() || null } : {}),
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
    this.announceVisit(before, row);
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

  /**
   * 그날 방문을 알선팀에게 자동으로 나눈다.
   *
   * 한 사람은 같은 시간대에 한 손님만 맞는다 — 맞고 있는 동안 다른 손님은 못 받는다.
   * 그 시간에 빈 사람 중 그날 제일 적게 맡은 사람에게 간다.
   *
   * 이미 정해 둔 건은 그대로 둔다. 전화받은 사람이 찍어 둔 걸 자동으로 뒤집으면 버튼을
   * 누를 때마다 담당이 바뀐다.
   *
   * 종결한 건은 빼고 센다 — 안 오기로 한 손님 자리까지 잡아 두면 올 손님이 갈 데가 없다.
   */
  async assignVisits(date: string) {
    const day = toDateOnly(date);

    const [rows, dealers] = await Promise.all([
      this.prisma.consultation.findMany({
        /*
          취소한 방문은 아예 안 본다.

          맡은 딜러는 그 시간을 비워 두고 기다렸을 뿐 손님을 맞은 게 아니다. '한 건
          맡았다'로 세면 다음 손님이 올 때 그 딜러는 이미 몫을 채운 사람이 되어 뒤로
          밀린다 — 그 시간도 다시 빈 자리로 돌려준다.
        */
        where: {
          visitDate: day,
          status: { notIn: [ConsultationStatus.CLOSED, ConsultationStatus.VISIT_CANCELED] },
        },
        select: { id: true, visitTime: true, visitDealerId: true, vehicleNumber: true, vehicleName: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { active: true, department: VISIT_TEAM },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (dealers.length === 0) {
      throw new BadRequestException(`${VISIT_TEAM}에 등록된 직원이 없습니다.`);
    }

    const result = assignVisits(rows, dealers.map((d) => d.id));

    // 몇 건 안 되는 하루치라 한 줄씩 적는다
    await Promise.all(
      result.placed.map((p) =>
        this.prisma.consultation.update({ where: { id: p.id }, data: { visitDealerId: p.dealerId } }),
      ),
    );

    const labelOf = (id: string) => {
      const row = rows.find((r) => r.id === id);
      return row ? row.vehicleName || row.vehicleNumber : '';
    };

    return {
      date,
      visits: rows.length,
      assigned: result.placed.length,
      /** 시각을 못 읽어 못 나눈 건 — 방문 시각을 적어 주면 다음에 나뉜다 */
      noTime: result.noTime.map(labelOf),
      /** 그 시간에 빈 사람이 없던 건 */
      noRoom: result.noRoom.map(labelOf),
      dealers: dealers.map((d) => ({ ...d, count: result.load.get(d.id) ?? 0 })),
    };
  }

  /**
   * 안 된 건에 리뷰를 남긴다 — 왜 계약이 안 됐는지.
   *
   * 담당(방문 담당 딜러, 없으면 적은 사람)과 관리자만 적는다. 남의 건에 사유를 달면
   * 그건 리뷰가 아니라 평가가 된다.
   *
   * 적은 사람과 때를 서버가 박는다 — 화면에서 보내면 누가 적었는지를 믿을 수 없다.
   */
  async saveVisitReview(id: string, user: AuthUser, reason: string, review: string) {
    const row = await this.prisma.consultation.findUnique({
      where: { id },
      select: { id: true, employeeId: true, visitDealerId: true },
    });
    if (!row) throw new NotFoundException('상담을 찾을 수 없습니다.');

    const mine = user.id === (row.visitDealerId ?? row.employeeId);
    if (user.role !== Role.ADMIN && !mine) {
      throw new BadRequestException('담당자와 관리자만 리뷰를 적을 수 있습니다.');
    }

    const clean = review.trim();
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        missReason: reason.trim().slice(0, 20),
        missReview: clean,
        // 둘 다 비우면 안 적은 것으로 되돌린다
        missReviewBy: reason.trim() || clean ? user.name : '',
        missReviewAt: reason.trim() || clean ? new Date() : null,
      },
      include: this.include,
    });
    return this.toView(updated);
  }

  /**
   * 리콜 — 안 된 건에 다시 전화를 걸어 보고 그 결과를 남긴다.
   *
   * 담당자가 아닌 사람이 하는 일이다. 손님에게 직접 걸어 "문제가 있었나, 우리 직원이
   * 실수한 게 있나, 다른 차를 보겠나"를 묻는다.
   *
   * 자리를 가리지 않는다. 처음에는 대표만 열어 뒀는데, 정작 낮에 자리에 앉아 전화를
   * 돌리는 사람은 따로 있다 — 걸 수 있는 사람이 못 적으면 아무 데도 안 남는다.
   *
   * 건 사람과 때는 서버가 박는다. 화면에서 보내면 누가 걸었는지를 믿을 수 없고,
   * 이름이 박히니 아무나 적어도 책임은 남는다.
   */
  async saveRecall(id: string, user: AuthUser, result: string, note: string) {
    const row = await this.prisma.consultation.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('상담을 찾을 수 없습니다.');

    const clean = note.trim();
    const kept = result.trim().slice(0, 20);
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        recallResult: kept,
        recallNote: clean,
        // 둘 다 비우면 안 건 것으로 되돌린다
        recallBy: kept || clean ? user.name : '',
        recallAt: kept || clean ? new Date() : null,
      },
      include: this.include,
    });
    return this.toView(updated);
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
      // 방문일도 같이 본다 — 날이 새로 잡혔는지 가리려면 고치기 전 값을 알아야 한다
      select: { id: true, status: true, visitDate: true },
    });
    if (!exists) throw new NotFoundException('상담 내역을 찾을 수 없습니다.');
    return exists;
  }
}
