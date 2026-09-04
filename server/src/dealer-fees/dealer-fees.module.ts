import {
  Body,
  Controller,
  Delete,
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
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DealerFeeMethod, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnlyOrNull, todayKst, toDateOnlyOrNull } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { assertOfficeManager } from '../auth/office-manager';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushService } from '../push/push.service';
import { PushModule } from '../push/push.module';

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})?$/;

/**
 * 바뀌면 알릴 칸.
 *
 * 담당자 이름이나 비고가 바뀐 걸로 알림이 오면 정작 봐야 할 이체 조건 변경이 묻힌다.
 * 돈이 언제 얼마나 어떻게 빠지는지, 그것만 알린다.
 */
const WATCHED: { key: keyof UpdateDealerFeeDto; label: string }[] = [
  { key: 'transferDay', label: '자동이체날짜' },
  { key: 'monthlyFee', label: '매달 회비' },
  { key: 'feeNote', label: '회비 조건' },
  { key: 'method', label: '자동이체여부' },
  { key: 'autoTransferUntil', label: '자동이체기한' },
  { key: 'accountNumber', label: '자동이체계좌' },
  { key: 'bank', label: '은행' },
];

const METHOD_LABEL: Record<DealerFeeMethod, string> = {
  AUTO: '자동이체',
  DIRECT: '직접이체',
  CANCELED: '자동이체 해지',
};

// ── DTO ──────────────────────────────

export class CreateDealerFeeDto {
  @IsString() @IsNotEmpty({ message: '업체명을 입력해 주세요.' }) @MaxLength(60) dealerName!: string;
  @IsOptional() @IsString() @MaxLength(30) managerName?: string;
  @IsOptional() @IsString() @MaxLength(20) managerPhone?: string;
  @IsOptional() @Matches(DATE_PATTERN, { message: '거래시작일은 YYYY-MM-DD 형식이어야 합니다.' }) startedOn?: string | null;

  @IsOptional() @IsString() @MaxLength(30) bank?: string;
  @IsOptional() @IsString() @MaxLength(30) accountHolder?: string;
  @IsOptional() @IsString() @MaxLength(40) accountNumber?: string;

  @IsOptional() @IsString() @MaxLength(30) transferDay?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyFee?: number;
  @IsOptional() @IsString() @MaxLength(60) feeNote?: string;
  @IsOptional() @IsEnum(DealerFeeMethod) method?: DealerFeeMethod;

  @IsOptional() @IsString() @MaxLength(30) autoTransferUntil?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** 수정용 — 등록용을 그대로 쓰면 한 칸만 고치는 요청이 필수값 누락으로 거절된다. */
export class UpdateDealerFeeDto extends CreateDealerFeeDto {
  @IsOptional() @IsString() @MaxLength(60) declare dealerName: string;
}

/** 엑셀에서 붙여넣은 여러 줄을 한 번에 넣는다 */
export class BulkDealerFeeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDealerFeeDto)
  items!: CreateDealerFeeDto[];
}

export class DealerFeeQueryDto {
  @IsOptional() @IsString() q?: string;
  /** 거래 끝난 곳까지 볼지 */
  @IsOptional() @IsString() includeInactive?: string;
}

// ── Service ──────────────────────────────

@Injectable()
export class DealerFeesService {
  private readonly logger = new Logger(DealerFeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  async findAll(params: DealerFeeQueryDto) {
    const where: Prisma.DealerFeeAccountWhereInput = {
      ...(params.includeInactive === 'true' ? {} : { active: true }),
      ...(params.q
        ? {
            OR: [
              { dealerName: { contains: params.q } },
              { managerName: { contains: params.q } },
              { accountHolder: { contains: params.q } },
              { bank: { contains: params.q } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.dealerFeeAccount.findMany({
      where,
      orderBy: [{ active: 'desc' }, { dealerName: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(dto: CreateDealerFeeDto) {
    const row = await this.prisma.dealerFeeAccount.create({
      data: {
        dealerName: dto.dealerName.trim(),
        managerName: dto.managerName?.trim() ?? '',
        managerPhone: dto.managerPhone?.trim() ?? '',
        startedOn: toDateOnlyOrNull(dto.startedOn),
        bank: dto.bank?.trim() ?? '',
        accountHolder: dto.accountHolder?.trim() ?? '',
        accountNumber: dto.accountNumber?.trim() ?? '',
        transferDay: dto.transferDay?.trim() ?? '',
        monthlyFee: dto.monthlyFee ?? 0,
        feeNote: dto.feeNote?.trim() ?? '',
        method: dto.method ?? DealerFeeMethod.AUTO,
        autoTransferUntil: dto.autoTransferUntil?.trim() ?? '',
        note: dto.note?.trim() ?? '',
        memo: dto.memo?.trim() ?? '',
        active: dto.active ?? true,
      },
    });
    return this.toView(row);
  }

  /**
   * 엑셀에서 붙여넣은 줄을 한 번에 넣는다.
   *
   * 이미 있는 업체명은 건너뛴다 — 두 번 붙여넣어도 같은 곳이 겹쳐 생기지 않는다.
   * 고치는 건 표에서 한다.
   */
  async createMany(items: CreateDealerFeeDto[]) {
    const existing = new Set(
      (await this.prisma.dealerFeeAccount.findMany({ select: { dealerName: true } })).map((r) => r.dealerName),
    );

    const added: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const name = item.dealerName.trim();
      if (!name) continue;
      if (existing.has(name)) {
        skipped.push(name);
        continue;
      }
      existing.add(name);
      await this.create(item);
      added.push(name);
    }
    return { added: added.length, skipped };
  }

  async update(id: string, user: AuthUser, dto: UpdateDealerFeeDto) {
    const before = await this.prisma.dealerFeeAccount.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('영업소를 찾을 수 없습니다.');

    const row = await this.prisma.dealerFeeAccount.update({
      where: { id },
      data: {
        ...(dto.dealerName !== undefined ? { dealerName: dto.dealerName.trim() } : {}),
        ...(dto.managerName !== undefined ? { managerName: dto.managerName.trim() } : {}),
        ...(dto.managerPhone !== undefined ? { managerPhone: dto.managerPhone.trim() } : {}),
        ...(dto.startedOn !== undefined ? { startedOn: toDateOnlyOrNull(dto.startedOn) } : {}),
        ...(dto.bank !== undefined ? { bank: dto.bank.trim() } : {}),
        ...(dto.accountHolder !== undefined ? { accountHolder: dto.accountHolder.trim() } : {}),
        ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber.trim() } : {}),
        ...(dto.transferDay !== undefined ? { transferDay: dto.transferDay.trim() } : {}),
        ...(dto.monthlyFee !== undefined ? { monthlyFee: dto.monthlyFee } : {}),
        ...(dto.feeNote !== undefined ? { feeNote: dto.feeNote.trim() } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.autoTransferUntil !== undefined ? { autoTransferUntil: dto.autoTransferUntil.trim() } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    await this.notifyChanges(user, before, row);
    return this.toView(row);
  }

  async remove(id: string) {
    const found = await this.prisma.dealerFeeAccount.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('영업소를 찾을 수 없습니다.');
    await this.prisma.dealerFeeAccount.delete({ where: { id } });
  }

  /**
   * 이체 조건이 바뀌면 사무장과 대표에게 알린다.
   *
   * 무엇이 무엇으로 바뀌었는지까지 적는다 — '바뀌었습니다'만 오면 결국 들어와서
   * 원장을 다시 봐야 한다.
   *
   * 알림이 실패해도 저장은 되돌리지 않는다. 고친 걸 못 남기는 게 더 큰 문제다.
   */
  private async notifyChanges(
    user: AuthUser,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    const changes = WATCHED.filter((w) => before[w.key] !== after[w.key]).map((w) => {
      const show = (v: unknown) => {
        if (w.key === 'method') return METHOD_LABEL[v as DealerFeeMethod];
        if (w.key === 'monthlyFee') return `${Number(v).toLocaleString()}원`;
        return String(v || '없음');
      };
      return `${w.label} ${show(before[w.key])} → ${show(after[w.key])}`;
    });
    if (changes.length === 0) return;

    try {
      const watchers = await this.watchers();
      if (watchers.length === 0) return;

      const message = `${String(after.dealerName)} 상조회비 — ${changes.join(', ')} (${user.name})`;
      await this.prisma.notification.createMany({
        data: watchers.map((id) => ({
          type: NotificationType.DEALER_FEE,
          message,
          employeeId: id,
          date: new Date(`${todayKst()}T00:00:00.000Z`),
        })),
      });

      this.realtime.toEmployees(watchers, REALTIME_EVENT.notification, {
        type: NotificationType.DEALER_FEE,
        message,
        date: todayKst(),
      });
      void this.push.sendToEmployees(watchers, { title: '상조회비 변경', body: message });
    } catch (e) {
      this.logger.warn(`상조회비 변경 알림 실패: ${(e as Error).message}`);
    }
  }

  /**
   * 알림을 받을 사람 — 사무장과 대표.
   *
   * 이름으로 박아두지 않는다. 사람이 바뀌면 코드를 고쳐야 하고, 그 사실을 아무도
   * 기억하지 못한다. 직급으로 찾으면 자리를 물려받은 사람이 그대로 받는다.
   */
  private async watchers(): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        active: true,
        OR: [{ position: { contains: '사무장' } }, { position: { contains: '대표' } }],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private toView<T extends { startedOn: Date | null }>(row: T) {
    return { ...row, startedOn: formatDateOnlyOrNull(row.startedOn) };
  }
}

// ── Controller ──────────────────────────────

/**
 * 신차영업소 상조회비 납부현황.
 *
 * 사무장이 챙기는 대장이라 사무장과 관리자만 본다. 화면에서 메뉴를 감추는 것만으로는
 * 막은 게 아니라 여기서 한 번 더 가린다.
 */
@Controller('dealer-fees')
export class DealerFeesController {
  constructor(private readonly dealerFees: DealerFeesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: DealerFeeQueryDto) {
    assertOfficeManager(user);
    return this.dealerFees.findAll(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDealerFeeDto) {
    assertOfficeManager(user);
    return this.dealerFees.create(dto);
  }

  /** 엑셀에서 붙여넣은 줄을 한 번에 — 이미 있는 업체명은 건너뛴다 */
  @Post('bulk')
  createMany(@CurrentUser() user: AuthUser, @Body() dto: BulkDealerFeeDto) {
    assertOfficeManager(user);
    return this.dealerFees.createMany(dto.items);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDealerFeeDto) {
    assertOfficeManager(user);
    return this.dealerFees.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertOfficeManager(user);
    await this.dealerFees.remove(id);
  }
}

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [DealerFeesController],
  providers: [DealerFeesService],
})
export class DealerFeesModule {}
