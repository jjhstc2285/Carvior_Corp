import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalKind, NotificationType, Prisma, RequestStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, todayKst, toDateOnly, toDateOnlyOrNull } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushService } from '../push/push.service';
import { PushModule } from '../push/push.module';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const KIND_LABEL: Record<ApprovalKind, string> = {
  INCIDENT_REPORT: '시말서',
  LEAVE: '휴가원',
  EXPENSE: '지출결의서',
};

const OPTIONAL_DATE = /^(\d{4}-\d{2}-\d{2})?$/;

// ── DTO ──────────────────────────────

export class CreateApprovalDto {
  @IsOptional() @IsEnum(ApprovalKind) kind?: ApprovalKind;

  @IsOptional() @IsString() @MaxLength(30) department?: string;
  @IsOptional() @IsString() @MaxLength(30) position?: string;
  @IsString() @IsNotEmpty({ message: '성명을 입력해 주세요.' }) @MaxLength(30) name!: string;

  @IsString() @IsNotEmpty({ message: '내용을 입력해 주세요.' }) content!: string;

  @IsOptional() @Matches(DATE_PATTERN, { message: '작성일자는 YYYY-MM-DD 형식이어야 합니다.' }) writtenOn?: string;

  // ── 휴가원 ──
  @IsOptional() @IsString() @MaxLength(20) leaveKind?: string;
  @IsOptional() @Matches(OPTIONAL_DATE) startOn?: string | null;
  @IsOptional() @Matches(OPTIONAL_DATE) endOn?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) days?: number;

  // ── 지출결의서 ──
  @IsOptional() @Matches(OPTIONAL_DATE) spentOn?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(60) payee?: string;
}

/** 결재 전에만 고칠 수 있다 — 승인된 문서를 고치면 결재한 내용과 달라진다. */
export class UpdateApprovalDto {
  @IsOptional() @IsString() @MaxLength(30) department?: string;
  @IsOptional() @IsString() @MaxLength(30) position?: string;
  @IsOptional() @IsString() @MaxLength(30) name?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @Matches(DATE_PATTERN) writtenOn?: string;

  @IsOptional() @IsString() @MaxLength(20) leaveKind?: string;
  @IsOptional() @Matches(OPTIONAL_DATE) startOn?: string | null;
  @IsOptional() @Matches(OPTIONAL_DATE) endOn?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) days?: number;

  @IsOptional() @Matches(OPTIONAL_DATE) spentOn?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(60) payee?: string;
}

export class ReviewApprovalDto {
  @IsIn(['approve', 'reject']) action!: 'approve' | 'reject';
  @IsOptional() @IsString() note?: string;
}

// ── Service ──────────────────────────────

const INCLUDE = {
  employee: { select: { id: true, name: true, position: true, department: true } },
  reviewer: { select: { id: true, name: true, position: true } },
};

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 직원은 자기가 쓴 문서만, 관리자는 전체를 본다.
   *
   * 시말서는 본인 잘못을 적는 문서다. 옆자리 사람 것까지 보이면 아무도 솔직하게 못 쓴다.
   */
  async findAll(user: AuthUser, params: { status?: RequestStatus }) {
    const where: Prisma.ApprovalDocumentWhereInput = {
      ...(user.role === Role.ADMIN ? {} : { employeeId: user.id }),
      ...(params.status ? { status: params.status } : {}),
    };

    const rows = await this.prisma.approvalDocument.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(user: AuthUser, dto: CreateApprovalDto) {
    const row = await this.prisma.approvalDocument.create({
      data: {
        kind: dto.kind ?? ApprovalKind.INCIDENT_REPORT,
        employeeId: user.id,
        department: dto.department?.trim() ?? '',
        position: dto.position?.trim() ?? '',
        name: dto.name.trim(),
        content: dto.content.trim(),
        writtenOn: toDateOnly(dto.writtenOn || todayKst()),
        leaveKind: dto.leaveKind?.trim() ?? '',
        startOn: toDateOnlyOrNull(dto.startOn),
        endOn: toDateOnlyOrNull(dto.endOn),
        days: dto.days ?? null,
        spentOn: toDateOnlyOrNull(dto.spentOn),
        amount: dto.amount ?? 0,
        payee: dto.payee?.trim() ?? '',
      },
      include: INCLUDE,
    });

    await this.notifyAdmins(
      `${row.name}님이 ${KIND_LABEL[row.kind]}를 올렸습니다.${summarize(row)}`,
      formatDateOnly(row.writtenOn),
    );
    return this.toView(row);
  }

  /** 결재 전에만 고친다. 본인 것만. */
  async update(id: string, user: AuthUser, dto: UpdateApprovalDto) {
    const doc = await this.prisma.approvalDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    if (doc.employeeId !== user.id) throw new ForbiddenException('본인이 쓴 문서만 고칠 수 있습니다.');
    if (doc.status !== RequestStatus.PENDING) {
      throw new BadRequestException('이미 결재된 문서는 고칠 수 없습니다.');
    }

    const row = await this.prisma.approvalDocument.update({
      where: { id },
      data: {
        ...(dto.department !== undefined ? { department: dto.department.trim() } : {}),
        ...(dto.position !== undefined ? { position: dto.position.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.writtenOn !== undefined ? { writtenOn: toDateOnly(dto.writtenOn) } : {}),
        ...(dto.leaveKind !== undefined ? { leaveKind: dto.leaveKind.trim() } : {}),
        ...(dto.startOn !== undefined ? { startOn: toDateOnlyOrNull(dto.startOn) } : {}),
        ...(dto.endOn !== undefined ? { endOn: toDateOnlyOrNull(dto.endOn) } : {}),
        ...(dto.days !== undefined ? { days: dto.days } : {}),
        ...(dto.spentOn !== undefined ? { spentOn: toDateOnlyOrNull(dto.spentOn) } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.payee !== undefined ? { payee: dto.payee.trim() } : {}),
      },
      include: INCLUDE,
    });
    return this.toView(row);
  }

  /**
   * 결재 — 관리자만.
   *
   * 한 번 결재한 문서는 다시 처리하지 않는다. 승인을 반려로 뒤집으면 그 사이에 그 문서를
   * 근거로 한 일이 이미 벌어져 있을 수 있다.
   */
  async review(id: string, user: AuthUser, dto: ReviewApprovalDto) {
    const doc = await this.prisma.approvalDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    if (doc.status !== RequestStatus.PENDING) throw new BadRequestException('이미 결재된 문서입니다.');
    if (dto.action === 'reject' && !dto.note?.trim()) {
      throw new BadRequestException('반려 사유를 적어 주세요.');
    }

    const approved = dto.action === 'approve';
    const row = await this.prisma.approvalDocument.update({
      where: { id },
      data: {
        status: approved ? RequestStatus.APPROVED : RequestStatus.REJECTED,
        reviewerId: user.id,
        reviewedAt: new Date(),
        reviewNote: dto.note?.trim() || null,
      },
      include: INCLUDE,
    });

    await this.notifyEmployee(
      row.employeeId,
      `${KIND_LABEL[row.kind]}가 ${approved ? '승인' : '반려'}되었습니다.${row.reviewNote ? ` (${row.reviewNote})` : ''}`,
      formatDateOnly(row.writtenOn),
    );
    return this.toView(row);
  }

  /** 결재 전에만 지운다. 본인 것만. */
  async remove(id: string, user: AuthUser) {
    const doc = await this.prisma.approvalDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('문서를 찾을 수 없습니다.');
    if (doc.employeeId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('본인이 쓴 문서만 지울 수 있습니다.');
    }
    if (doc.status !== RequestStatus.PENDING && user.role !== Role.ADMIN) {
      throw new BadRequestException('이미 결재된 문서는 지울 수 없습니다.');
    }
    await this.prisma.approvalDocument.delete({ where: { id } });
  }

  /** 알림이 실패해도 문서는 그대로 둔다 — 올린 걸 못 남기는 게 더 큰 문제다. */
  private async notifyAdmins(message: string, date: string): Promise<void> {
    try {
      const admins = await this.prisma.employee.findMany({
        where: { role: Role.ADMIN, active: true },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await this.send(
        admins.map((a) => a.id),
        message,
        date,
      );
    } catch (e) {
      this.logger.warn(`결재 알림 실패: ${(e as Error).message}`);
    }
  }

  private async notifyEmployee(employeeId: string, message: string, date: string): Promise<void> {
    try {
      await this.send([employeeId], message, date);
    } catch (e) {
      this.logger.warn(`결재 결과 알림 실패: ${(e as Error).message}`);
    }
  }

  private async send(employeeIds: string[], message: string, date: string): Promise<void> {
    await this.prisma.notification.createMany({
      data: employeeIds.map((employeeId) => ({
        type: NotificationType.APPROVAL,
        message,
        employeeId,
        date: new Date(`${date}T00:00:00.000Z`),
      })),
    });
    this.realtime.toEmployees(employeeIds, REALTIME_EVENT.notification, {
      type: NotificationType.APPROVAL,
      message,
      date,
    });
    void this.push.sendToEmployees(employeeIds, { title: '결재', body: message });
  }

  private toView<
    T extends { writtenOn: Date; startOn: Date | null; endOn: Date | null; spentOn: Date | null },
  >(row: T) {
    return {
      ...row,
      writtenOn: formatDateOnly(row.writtenOn),
      startOn: formatDateOnlyOrNull(row.startOn),
      endOn: formatDateOnlyOrNull(row.endOn),
      spentOn: formatDateOnlyOrNull(row.spentOn),
    };
  }
}

/**
 * 알림 한 줄에 붙일 요약.
 *
 * '휴가원을 올렸습니다'만 오면 언제 며칠인지 보려고 결국 들어와야 한다.
 * 결재 여부를 가르는 값만 붙인다.
 */
function summarize(row: {
  kind: ApprovalKind;
  leaveKind: string;
  startOn: Date | null;
  endOn: Date | null;
  days: number | null;
  spentOn: Date | null;
  amount: number;
  payee: string;
}): string {
  if (row.kind === ApprovalKind.LEAVE) {
    const range = [row.startOn, row.endOn]
      .filter((d): d is Date => d != null)
      .map(formatDateOnly)
      .join(' ~ ');
    return ` (${[row.leaveKind, range, row.days ? `${row.days}일` : ''].filter(Boolean).join(' · ')})`;
  }
  if (row.kind === ApprovalKind.EXPENSE) {
    const spent = row.spentOn ? formatDateOnly(row.spentOn) : '';
    return ` (${[row.payee, spent, `${row.amount.toLocaleString()}원`].filter(Boolean).join(' · ')})`;
  }
  return '';
}

// ── Controller ──────────────────────────────

/**
 * 결재 관리.
 *
 * 쓰는 건 전 직원이 하고, 결재는 관리자가 한다.
 * 직원은 자기가 쓴 문서만 보고 관리자는 전체를 본다 — 시말서는 본인 잘못을 적는 문서라
 * 옆자리 사람 것까지 보이면 아무도 솔직하게 못 쓴다.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    return this.approvals.findAll(user, { status });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApprovalDto) {
    return this.approvals.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateApprovalDto) {
    return this.approvals.update(id, user, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/review')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewApprovalDto) {
    return this.approvals.review(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.approvals.remove(id, user);
  }
}

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
