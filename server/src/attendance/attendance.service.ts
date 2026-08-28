import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRequestKind, NotificationType, RequestStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, monthRange, nowTimeKst, todayKst, toDateOnly } from '../common/date.util';
import type { AddIpDto, CreateAttendanceRequestDto, CreateCorrectionDto } from './dto/attendance.dto';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';

const KIND_LABEL: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '연차',
  FIELD_WORK: '외근/출장',
  LATE_EXCUSE: '지각·조퇴 소명',
};

/** 단말 키는 원본을 저장하지 않는다 — 조회는 해시로 한다(비밀번호와 달리 조회 키라 SHA-256). */
function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AttendanceService {
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
   * 출근 등록.
   * 허용 조건은 IP와 단말 두 가지이고, 등록된 것만 검사한다(둘 다 비어 있으면 제한 없음).
   */
  async clockIn(employeeId: string, clientIp: string, deviceToken?: string) {
    await this.assertClockInAllowed(clientIp, deviceToken);

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

  /**
   * 출근을 찍을 수 있는 자리인지 확인한다.
   *
   * IP 화이트리스트는 "사무실 네트워크인가"까지만 가른다. 같은 WiFi를 쓰는 휴대폰도 같은
   * 공인 IP로 나오기 때문에, "그 자리 PC인가"는 등록된 단말 키로 따로 가린다.
   * 각 조건은 등록된 게 하나라도 있을 때만 적용된다 — 설정 전에는 아무도 못 찍게 막지 않는다.
   */
  private async assertClockInAllowed(clientIp: string, deviceToken?: string): Promise<void> {
    const whitelist = await this.prisma.ipWhitelist.findMany({ select: { ip: true } });
    if (whitelist.length > 0 && !whitelist.some((w) => w.ip === clientIp)) {
      // code를 같이 내려준다 — 화면이 문구를 뒤져서 원인을 알아내지 않아도 되게.
      throw new ForbiddenException({
        code: 'IP_NOT_ALLOWED',
        message: `사무실 네트워크에서만 출근 등록이 가능합니다. (현재 IP: ${clientIp})`,
      });
    }

    const deviceCount = await this.prisma.attendanceDevice.count({ where: { active: true } });
    if (deviceCount === 0) return;

    const device = deviceToken
      ? await this.prisma.attendanceDevice.findUnique({ where: { tokenHash: hashDeviceToken(deviceToken) } })
      : null;

    if (!device?.active) {
      throw new ForbiddenException({
        code: 'DEVICE_REQUIRED',
        message: '등록된 출근 단말(사무실 PC)에서만 출근 등록이 가능합니다.',
      });
    }

    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    });
  }

  // ── 출근 단말 ──────────────────────────────

  /** 관리자 화면용 목록 — 키 해시는 내려주지 않는다. */
  listDevices() {
    return this.prisma.attendanceDevice.findMany({
      select: { id: true, label: true, active: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 단말 등록. 키 원본은 이 응답에서만 볼 수 있고, 서버에는 해시만 남는다.
   * 등록을 누른 그 브라우저가 키를 받아 저장하므로 반드시 해당 PC에서 눌러야 한다.
   *
   * 지문도 같이 받아둔다 — 나중에 사용기록을 지워 키가 날아가도 이걸로 알아본다.
   */
  async registerDevice(label: string, fingerprint?: string) {
    const token = randomBytes(32).toString('base64url');
    const device = await this.prisma.attendanceDevice.create({
      data: { label, tokenHash: hashDeviceToken(token), fingerprint: fingerprint || null },
      select: { id: true, label: true, active: true, lastUsedAt: true, createdAt: true },
    });
    return { ...device, token };
  }

  /**
   * 키 되찾기.
   *
   * 브라우저 사용기록을 지우면 단말 키가 날아간다. 매번 관리자를 불러 다시 등록하는 대신,
   * 지문이 맞는 단말이 있으면 키를 새로 내준다.
   *
   * 다만 사무실 IP 안에서만 내준다. 지문은 같은 기종이면 겹칠 수 있고 흉내도 낼 수 있지만
   * 사무실 네트워크는 그렇지 않다 — 둘을 함께 봐야 '그 자리 PC'라고 할 수 있다.
   * IP 화이트리스트를 아예 안 쓰는 설치에서는 이 복구를 하지 않는다(가려낼 방법이 없다).
   */
  async recoverDevice(clientIp: string, fingerprint: string) {
    if (!fingerprint) return { recovered: false as const };

    const whitelist = await this.prisma.ipWhitelist.findMany({ select: { ip: true } });
    if (whitelist.length === 0 || !whitelist.some((w) => w.ip === clientIp)) {
      return { recovered: false as const };
    }

    const device = await this.prisma.attendanceDevice.findUnique({ where: { fingerprint } });
    if (!device?.active) return { recovered: false as const };

    // 옛 키는 못 쓰게 갈아끼운다 — 지운 브라우저에 남아 있을 리 없고, 남아 있다면 그게 문제다.
    const token = randomBytes(32).toString('base64url');
    await this.prisma.attendanceDevice.update({
      where: { id: device.id },
      data: { tokenHash: hashDeviceToken(token) },
    });

    return { recovered: true as const, id: device.id, label: device.label, token };
  }

  async removeDevice(id: string) {
    const found = await this.prisma.attendanceDevice.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('등록된 단말을 찾을 수 없습니다.');
    await this.prisma.attendanceDevice.delete({ where: { id } });
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
        await tx.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: req.employeeId, date: req.date } },
          create: {
            employeeId: req.employeeId,
            date: req.date,
            clockIn: req.requestedClockIn,
            clockOut: req.requestedClockOut,
          },
          update: { clockIn: req.requestedClockIn, clockOut: req.requestedClockOut },
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

    const duplicate = await this.prisma.attendanceRequest.findFirst({
      where: { employeeId, date, status: { in: [RequestStatus.PENDING, RequestStatus.APPROVED] } },
    });
    if (duplicate) {
      throw new BadRequestException('해당 날짜에 이미 신청한 내역이 있습니다.');
    }

    const req = await this.prisma.attendanceRequest.create({
      data: { employeeId, date, kind: dto.kind, reason: dto.reason },
      include: { employee: { select: { name: true } } },
    });

    await this.notifyAdmins(
      NotificationType.ATTENDANCE_REQUEST,
      `${req.employee.name}님이 ${dto.date} ${KIND_LABEL[dto.kind]}을 신청했습니다.`,
      employeeId,
      date,
    );

    return { ...req, date: formatDateOnly(req.date) };
  }

  async findAttendanceRequests(employeeId?: string, status?: RequestStatus) {
    const rows = await this.prisma.attendanceRequest.findMany({
      where: { ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, name: true, position: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, date: formatDateOnly(r.date) }));
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

  /** 남은 연차 — 근로기준법 15일 고정으로 단순화(입사연차 가산 미반영) */
  async annualLeaveUsage(employeeId: string, year: string) {
    const used = await this.prisma.attendanceRequest.count({
      where: {
        employeeId,
        kind: AttendanceRequestKind.ANNUAL_LEAVE,
        status: RequestStatus.APPROVED,
        date: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`) },
      },
    });
    return { quota: 15, used, remaining: 15 - used };
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
    this.realtime.toEmployees(
      admins.map((a) => a.id),
      REALTIME_EVENT.notification,
      { type, message, date: formatDateOnly(date) },
    );

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

  // ── IP 화이트리스트 ──────────────────────────────

  findIpWhitelist() {
    return this.prisma.ipWhitelist.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async addIp(dto: AddIpDto) {
    const exists = await this.prisma.ipWhitelist.findUnique({ where: { ip: dto.ip } });
    if (exists) throw new BadRequestException('이미 등록된 IP입니다.');
    return this.prisma.ipWhitelist.create({ data: { ip: dto.ip, label: dto.label ?? null } });
  }

  async removeIp(ip: string) {
    await this.prisma.ipWhitelist.deleteMany({ where: { ip } });
  }

  /** 위 응답 형태를 프론트에서 그대로 쓰기 위한 헬퍼 */
  static formatNullableDate = formatDateOnlyOrNull;
}
