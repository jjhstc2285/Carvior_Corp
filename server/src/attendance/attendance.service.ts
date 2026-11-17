import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttendanceRequestKind, NotificationType, RequestStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, monthRange, nowTimeKst, todayKst, toDateOnly } from '../common/date.util';
import type { CreateAttendanceRequestDto, CreateCorrectionDto } from './dto/attendance.dto';
import type { AuthUser } from '../auth/current-user.decorator';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';

const KIND_LABEL: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '연차',
  HALF_DAY: '반차',
  FIELD_WORK: '외근/출장',
  AWAY: '자리비움',
  LATE_EXCUSE: '지각·조퇴 소명',
};

/**
 * 자리비움은 하루에 여러 번 있을 수 있다 — 은행 다녀오고, 오후에 병원 가고.
 * 그래서 '하루에 한 건' 규칙에서 뺀다. 연차 낸 날 자리를 비운다는 말도 성립하지 않으니
 * 다른 신청을 막을 때도 자리비움은 세지 않는다.
 */
/** 오늘 자리에 없다고 볼 신청 — 승인된 것만 센다. */
const OUT_OF_OFFICE_KINDS = [
  AttendanceRequestKind.ANNUAL_LEAVE,
  AttendanceRequestKind.HALF_DAY,
  AttendanceRequestKind.FIELD_WORK,
] as const;

/** 오늘 상태 — 신청 종류 셋에 근무 중·퇴근을 더한 것 */
export type TodayState = (typeof OUT_OF_OFFICE_KINDS)[number] | 'WORKING' | 'DONE';

const ONE_PER_DAY_KINDS = Object.values(AttendanceRequestKind).filter(
  (k) => k !== AttendanceRequestKind.AWAY,
);

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  // ── 출퇴근 기록 ──────────────────────────────

  async findRecords(month: string, employeeId?: string) {
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { date: monthRange(month), ...(employeeId ? { employeeId } : {}) },
      orderBy: [{ date: 'asc' }],
    });
    return rows.map((r) => ({ ...r, date: formatDateOnly(r.date) }));
  }

  /**
   * 오늘 누가 무엇을 하고 있는가 — 근무 중 · 퇴근 · 연차 · 반차 · 외근.
   *
   * 근태 기록 자체는 남의 것을 못 본다(내 출퇴근 시각은 남에게 보일 일이 아니다).
   * 그런데 "오늘 누가 있나"는 다 같이 봐야 한다 — 시각은 빼고 무엇을 하는지만 준다.
   *
   * 목록에 없는 사람은 아직 출근 전이다. 없는 걸 굳이 실어 보내지 않는다.
   */
  async workingNow(): Promise<{ employeeId: string; state: TodayState }[]> {
    const today = toDateOnly(todayKst());

    const [records, requests] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { date: today },
        select: { employeeId: true, clockIn: true, clockOut: true },
      }),
      this.prisma.attendanceRequest.findMany({
        where: { date: today, status: RequestStatus.APPROVED, kind: { in: [...OUT_OF_OFFICE_KINDS] } },
        select: { employeeId: true, kind: true },
      }),
    ]);

    // 연차·반차·외근이 먼저다. 외근 나갔다가 들어와 찍은 사람은 외근으로 본다 —
    // 그날 무엇을 하기로 했는지가 지금 자리에 있는지보다 크다.
    const board = new Map<string, TodayState>();
    for (const r of requests) board.set(r.employeeId, r.kind as TodayState);

    for (const r of records) {
      if (board.has(r.employeeId)) continue;
      if (r.clockIn && !r.clockOut) board.set(r.employeeId, 'WORKING');
      else if (r.clockIn && r.clockOut) board.set(r.employeeId, 'DONE');
    }

    return [...board].map(([employeeId, state]) => ({ employeeId, state }));
  }

  /**
   * 출근 등록.
   *
   * 로그인한 사람이 누르면 찍힌다. 전에는 사무실 IP와 자리 PC에 심어둔 키를 같이 봤는데,
   * 애니원 사무실 한 곳을 전제로 한 검사라 여러 상사가 쓰는 제품에서는 성립하지 않는다 —
   * 상사마다 사무실이 다르고, 공유기를 바꾸면 IP가 바뀌고, 폰으로 찍는 사람이 많다.
   *
   * 대리 출근이 걱정되면 그건 IP가 아니라 위치나 사진으로 풀 문제이고, 그때 새로 설계한다.
   */
  async clockIn(employeeId: string) {
    return this.recordClockIn(employeeId);
  }

  private async recordClockIn(employeeId: string) {
    const date = toDateOnly(todayKst());
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (existing?.clockIn) {
      throw new BadRequestException('이미 출근 등록을 했습니다.');
    }

    const row = existing
      ? await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { clockIn: nowTimeKst() },
        })
      : await this.prisma.attendanceRecord.create({
          data: { employeeId, date, clockIn: nowTimeKst() },
        });

    return { ...row, date: formatDateOnly(row.date) };
  }

  async clockOut(employeeId: string) {
    const date = toDateOnly(todayKst());
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });

    if (!existing?.clockIn) throw new BadRequestException('출근 등록을 먼저 해주세요.');
    if (existing.clockOut) throw new BadRequestException('이미 퇴근 등록을 했습니다.');

    const row = await this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { clockOut: nowTimeKst() },
    });
    return { ...row, date: formatDateOnly(row.date) };
  }

  /**
   * 오늘 구내식당에서 먹었는가를 적는다 — 본인이, 오늘 것만.
   *
   * 식대는 출퇴근 시각으로 자동으로 센다. 그런데 찍고 나가서 손님과 밖에서 먹는 날이
   * 있어 찍힌 것과 먹은 것이 늘 같지는 않다. 체크를 켜고 끄면 그날은 그 값으로 센다.
   *
   * null 로 적으면 다시 자동 판정으로 돌아간다 — 잘못 눌렀을 때 되돌릴 자리를 남긴다.
   *
   * 출근 전에는 적지 않는다. 기록이 없는 날에 이것만으로 줄을 만들면 달력과 근무시간
   * 순위에 출근 안 한 날이 빈 줄로 끼어든다.
   */
  async setMeal(employeeId: string, used: boolean | null) {
    const date = toDateOnly(todayKst());
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
      select: { id: true, clockIn: true },
    });
    if (!existing?.clockIn) throw new BadRequestException('출근 등록을 먼저 해주세요.');

    const row = await this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { mealUsed: used },
    });
    return { ...row, date: formatDateOnly(row.date) };
  }

  /** 오늘 내 기록 — 출퇴근 버튼 상태 판단용 */
  async today(employeeId: string) {
    const row = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: toDateOnly(todayKst()) } },
    });
    return row ? { ...row, date: formatDateOnly(row.date) } : null;
  }

  // ── 근태 정정 요청 ──────────────────────────────

  async createCorrection(employeeId: string, dto: CreateCorrectionDto) {
    const req = await this.prisma.correctionRequest.create({
      data: {
        employeeId,
        date: toDateOnly(dto.date),
        reason: dto.reason,
        requestedClockIn: dto.requestedClockIn ?? null,
        requestedClockOut: dto.requestedClockOut ?? null,
      },
      include: { employee: { select: { name: true } } },
    });

    await this.notifyAdmins(
      NotificationType.CORRECTION_REQUEST,
      `${req.employee.name}님이 ${dto.date} 근태 수정을 요청했습니다.`,
      employeeId,
      req.date,
    );

    return { ...req, date: formatDateOnly(req.date) };
  }

  async findCorrections(employeeId?: string, status?: RequestStatus) {
    const rows = await this.prisma.correctionRequest.findMany({
      where: { ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, name: true, position: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, date: formatDateOnly(r.date) }));
  }

  /**
   * 정정 승인 — 요청받은 시각을 실제 출퇴근 기록에 반영한다.
   * 승인과 기록 수정이 따로 놀면 안 되므로 트랜잭션으로 묶는다.
   */
  async reviewCorrection(id: string, approve: boolean, note?: string) {
    const req = await this.prisma.correctionRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('요청을 찾을 수 없습니다.');
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 요청입니다.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.correctionRequest.update({
        where: { id },
        data: {
          status: approve ? RequestStatus.APPROVED : RequestStatus.REJECTED,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
      });

      if (approve) {
        /*
          적어 보낸 칸만 고친다.

          전에는 둘을 통째로 덮었다. 그런데 신청 창이 두 칸을 09:30 · 18:00 으로 미리
          채워 두어서, 퇴근만 빠진 날을 고치려 한 사람도 출근 시각이 09:30 으로 덮였고
          — 아예 안 찍은 퇴근이 18:00 으로 생겼다. "안 찍고 퇴근했는데 찍혀 있다"가
          여기서 나왔다.

          비워 보낸 칸은 건드리지 않는다. 고치라고 한 적 없는 값을 고치면 안 된다.
        */
        const patch = {
          ...(req.requestedClockIn ? { clockIn: req.requestedClockIn } : {}),
          ...(req.requestedClockOut ? { clockOut: req.requestedClockOut } : {}),
        };
        await tx.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: req.employeeId, date: req.date } },
          create: { employeeId: req.employeeId, date: req.date, ...patch },
          update: patch,
        });
      }

      return { ...updated, date: formatDateOnly(updated.date) };
    });

    // 결과 통지는 트랜잭션 밖에서 — 알림 때문에 기록 반영이 되돌아가면 안 된다.
    await this.notifyEmployee(
      NotificationType.CORRECTION_REQUEST,
      `${result.date} 근태 수정 요청이 ${approve ? '승인' : '반려'}되었습니다.${note ? ` (${note})` : ''}`,
      req.employeeId,
      req.date,
    );

    return result;
  }

  // ── 연차 / 외근 신청 ──────────────────────────────

  async createAttendanceRequest(employeeId: string, dto: CreateAttendanceRequestDto) {
    const date = toDateOnly(dto.date);

    if (dto.kind !== AttendanceRequestKind.AWAY) {
      const duplicate = await this.prisma.attendanceRequest.findFirst({
        where: {
          employeeId,
          date,
          kind: { in: ONE_PER_DAY_KINDS },
          status: { in: [RequestStatus.PENDING, RequestStatus.APPROVED] },
        },
      });
      if (duplicate) {
        throw new BadRequestException('해당 날짜에 이미 신청한 내역이 있습니다.');
      }
    }

    /*
     * 자리비움은 허락을 구하는 게 아니라 알리는 기록이다. 승인 대기로 두면 관리자
     * 승인함에 처리할 게 아닌 것들이 쌓여, 정작 판단이 필요한 연차·소명이 묻힌다.
     * 그래서 바로 확정하고 알림만 보낸다.
     */
    const away = dto.kind === AttendanceRequestKind.AWAY;

    const req = await this.prisma.attendanceRequest.create({
      data: {
        employeeId,
        date,
        kind: dto.kind,
        reason: dto.reason,
        photos: (dto.photos ?? '').trim(),
        ...(away ? { status: RequestStatus.APPROVED, reviewedAt: new Date() } : {}),
      },
      include: { employee: { select: { name: true } } },
    });

    await this.notifyAdmins(
      NotificationType.ATTENDANCE_REQUEST,
      away
        ? `${req.employee.name}님 자리비움 — ${dto.reason}`
        : `${req.employee.name}님이 ${dto.date} ${KIND_LABEL[dto.kind]}을 신청했습니다.`,
      employeeId,
      date,
    );

    return { ...req, date: formatDateOnly(req.date) };
  }

  /**
   * 본인이 올린 신청을 고친다.
   *
   * 지금은 한 번 보내면 못 고친다. 날짜를 하루 잘못 적거나 연차로 올려 놓고 반차였다는
   * 걸 알아도, 관리자에게 반려해 달라 부탁하고 다시 올리는 수밖에 없었다 — 그러느라
   * 승인함에 반려만 쌓이고, 부탁받은 쪽도 그게 무슨 건인지 되묻는다.
   *
   * 아직 안 본 건만 고칠 수 있다. 승인·반려가 찍힌 뒤에 내용이 바뀌면 무엇을 보고
   * 찍었는지가 안 남는다 — 그때는 새로 올린다.
   *
   * 남의 신청은 못 고친다. 자리비움도 못 고친다 — 그건 알리는 기록이라 올린 순간
   * 확정이고, 고칠 일이면 지우고 다시 올린다.
   */
  async updateAttendanceRequest(id: string, employeeId: string, dto: CreateAttendanceRequestDto) {
    const found = await this.prisma.attendanceRequest.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('신청 내역을 찾을 수 없습니다.');
    if (found.employeeId !== employeeId) {
      throw new ForbiddenException('본인이 올린 신청만 고칠 수 있습니다.');
    }
    if (found.status !== RequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청은 고칠 수 없습니다. 새로 신청해 주세요.');
    }

    const date = toDateOnly(dto.date);
    /* 날짜나 종류를 옮겼으면 그 자리에 이미 다른 신청이 있는지 다시 본다 */
    if (dto.kind !== AttendanceRequestKind.AWAY) {
      const duplicate = await this.prisma.attendanceRequest.findFirst({
        where: {
          id: { not: id },
          employeeId,
          date,
          kind: { in: ONE_PER_DAY_KINDS },
          status: { in: [RequestStatus.PENDING, RequestStatus.APPROVED] },
        },
      });
      if (duplicate) throw new BadRequestException('해당 날짜에 이미 신청한 내역이 있습니다.');
    }

    const req = await this.prisma.attendanceRequest.update({
      where: { id },
      data: { date, kind: dto.kind, reason: dto.reason, photos: (dto.photos ?? '').trim() },
      include: { employee: { select: { name: true } } },
    });

    /*
      고쳤다고 다시 알린다.

      승인함에 이미 올라가 있는 건이라, 보는 쪽은 처음 올라온 내용을 보고 있다 —
      말 없이 바뀌면 다른 걸 보고 찍게 된다.
    */
    await this.notifyAdmins(
      NotificationType.ATTENDANCE_REQUEST,
      `${req.employee.name}님이 ${dto.date} ${KIND_LABEL[dto.kind]} 신청을 고쳤습니다.`,
      employeeId,
      date,
    );

    return { ...req, date: formatDateOnly(req.date) };
  }

  /**
   * 본인이 올린 신청을 내린다.
   *
   * 잘못 올린 건을 되돌릴 자리가 없으면 관리자에게 반려를 부탁하게 된다 — 승인함에
   * 반려가 쌓이고, 그건 판단한 기록이 아니라 치운 기록이다.
   *
   * 아직 안 본 건만 내린다. 처리된 건은 기록이라 남긴다.
   */
  async withdrawAttendanceRequest(id: string, employeeId: string) {
    const found = await this.prisma.attendanceRequest.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('신청 내역을 찾을 수 없습니다.');
    if (found.employeeId !== employeeId) {
      throw new ForbiddenException('본인이 올린 신청만 내릴 수 있습니다.');
    }
    if (found.status !== RequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청은 내릴 수 없습니다.');
    }
    await this.prisma.attendanceRequest.delete({ where: { id } });
  }

  /**
   * 근태 신청 목록.
   *
   * 목록 자체는 전 직원이 본다 — 누가 언제 쉬는지는 같이 알아야 일정을 짠다.
   *
   * 사진은 본인과 관리자에게만 내준다. 반차·조퇴 증빙으로 붙이는 게 병원 영수증·진단서다.
   * 쉬는 날짜와는 다른 값이다 — 옆자리가 볼 까닭이 없다.
   */
  async findAttendanceRequests(employeeId?: string, status?: RequestStatus, viewer?: AuthUser) {
    const rows = await this.prisma.attendanceRequest.findMany({
      where: { ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, name: true, position: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const maySeePhotos = (ownerId: string) =>
      !viewer || viewer.role === Role.ADMIN || viewer.id === ownerId;
    return rows.map((r) => ({
      ...r,
      date: formatDateOnly(r.date),
      photos: maySeePhotos(r.employeeId) ? r.photos : '',
    }));
  }

  async reviewAttendanceRequest(id: string, approve: boolean, note?: string) {
    const req = await this.prisma.attendanceRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청입니다.');
    }

    const updated = await this.prisma.attendanceRequest.update({
      where: { id },
      data: {
        status: approve ? RequestStatus.APPROVED : RequestStatus.REJECTED,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    await this.notifyEmployee(
      NotificationType.ATTENDANCE_REQUEST,
      `${formatDateOnly(updated.date)} ${KIND_LABEL[updated.kind]} 신청이 ${approve ? '승인' : '반려'}되었습니다.${note ? ` (${note})` : ''}`,
      updated.employeeId,
      updated.date,
    );

    return { ...updated, date: formatDateOnly(updated.date) };
  }

  /**
   * 올해 쓴 연차. 반차는 반 일로 센다.
   *
   * 몇 개를 쓸 수 있는지는 내려주지 않는다 — 입사일·근속에 따라 사람마다 다른데 그
   * 원본 자료가 우리한테 없다. 모르는 값을 15일로 박아 '남은 연차'를 띄우면 그걸 믿고
   * 쓰게 된다. 쓴 날만 센다.
   */
  async annualLeaveUsage(employeeId: string, year: string) {
    const range = {
      gte: new Date(`${year}-01-01T00:00:00Z`),
      lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`),
    };
    const counted = await this.prisma.attendanceRequest.groupBy({
      by: ['kind'],
      where: {
        employeeId,
        kind: { in: [AttendanceRequestKind.ANNUAL_LEAVE, AttendanceRequestKind.HALF_DAY] },
        status: RequestStatus.APPROVED,
        date: range,
      },
      _count: { _all: true },
    });

    const countOf = (kind: AttendanceRequestKind) =>
      counted.find((c) => c.kind === kind)?._count._all ?? 0;

    const used = countOf(AttendanceRequestKind.ANNUAL_LEAVE) + countOf(AttendanceRequestKind.HALF_DAY) * 0.5;
    return { used };
  }

  // ── 알림 ──────────────────────────────

  private async notifyAdmins(type: NotificationType, message: string, employeeId: string, date: Date) {
    const admins = await this.prisma.employee.findMany({
      where: { role: Role.ADMIN, active: true },
      select: { id: true },
    });
    if (!admins.length) return;

    // 관리자마다 한 건씩 — 각자 읽음 처리를 따로 할 수 있어야 하므로 공유하지 않는다.
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({ type, message, employeeId: a.id, date })),
    });

    // 브라우저를 열어둔 관리자에게는 새로고침 없이 바로 뜨게 한다.
    // 실패해도 알림 자체는 DB에 남았으므로 요청을 되돌리지 않는다.
    const adminIds = admins.map((a) => a.id);
    this.realtime.toEmployees(adminIds, REALTIME_EVENT.notification, {
      type,
      message,
      date: formatDateOnly(date),
    });
    // 승인 대기 목록도 같이 갱신되게 한다 — 알림만 뜨고 목록이 그대로면 새로고침해야 한다.
    this.realtime.toEmployees(adminIds, REALTIME_EVENT.attendanceInbox, { reason: type });

    // 브라우저를 닫아둔 관리자에게는 웹 푸시로 간다. 발송을 기다리지 않는다(실패해도 무시).
    void this.push.sendToEmployees(
      admins.map((a) => a.id),
      { title: '새 결재 요청', body: message, tag: `notification:${type}` },
    );
    void employeeId;
  }

  /** 신청 결과를 신청한 직원에게 알린다(승인/반려). */
  private async notifyEmployee(type: NotificationType, message: string, employeeId: string, date: Date) {
    await this.prisma.notification.create({ data: { type, message, employeeId, date } });
    this.realtime.toEmployee(employeeId, REALTIME_EVENT.notification, {
      type,
      message,
      date: formatDateOnly(date),
    });
    this.realtime.toEmployee(employeeId, REALTIME_EVENT.attendanceInbox, { reason: type });
    // 관리자가 여러 명이라 한 명이 처리하면 나머지 화면의 대기 목록도 같이 줄어야 한다.
    this.realtime.toAdmins(REALTIME_EVENT.attendanceInbox, { reason: type });
    void this.push.sendToEmployees([employeeId], {
      title: '새 알림',
      body: message,
      tag: `notification:${type}`,
    });
  }

  async findNotifications(employeeId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({ ...r, date: formatDateOnly(r.date) }));
  }

  async markNotificationRead(id: string, employeeId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, employeeId },
      data: { read: true },
    });
    if (result.count === 0) throw new NotFoundException('알림을 찾을 수 없습니다.');
  }

  async markAllNotificationsRead(employeeId: string) {
    await this.prisma.notification.updateMany({ where: { employeeId, read: false }, data: { read: true } });
  }


  /** 위 응답 형태를 프론트에서 그대로 쓰기 위한 헬퍼 */
  static formatNullableDate = formatDateOnlyOrNull;
}
