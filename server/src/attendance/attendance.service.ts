import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRequestKind, NotificationType, RequestStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, monthRange, nowTimeKst, todayKst, toDateOnly } from '../common/date.util';
import type { AddIpDto, CreateAttendanceRequestDto, CreateCorrectionDto } from './dto/attendance.dto';

const KIND_LABEL: Record<AttendanceRequestKind, string> = {
  ANNUAL_LEAVE: '연차',
  FIELD_WORK: '외근/출장',
};

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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
   * IP 화이트리스트가 하나라도 등록돼 있으면 그 목록에 있는 IP에서만 찍을 수 있다.
   * (비어 있으면 제한 없음 — 아직 설정을 안 한 상태로 본다)
   */
  async clockIn(employeeId: string, clientIp: string) {
    const whitelist = await this.prisma.ipWhitelist.findMany({ select: { ip: true } });
    if (whitelist.length > 0 && !whitelist.some((w) => w.ip === clientIp)) {
      throw new ForbiddenException(`사무실 네트워크에서만 출근 등록이 가능합니다. (현재 IP: ${clientIp})`);
    }

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

    return this.prisma.$transaction(async (tx) => {
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
    void employeeId;
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
