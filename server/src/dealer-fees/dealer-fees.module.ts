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
  OnModuleDestroy,
  OnModuleInit,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { CarviorModule, CarviorService } from '../carvior/carvior.module';
import { formatDateOnly, formatDateOnlyOrNull, todayKst, toDateOnlyOrNull } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { assertOfficeManager, LEDGER_VIEWER_WHERE } from '../auth/office-manager';
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
  { key: 'transferDayOfMonth', label: '이체일' },
  { key: 'monthlyFee', label: '매달 회비' },
  { key: 'feeNote', label: '회비 조건' },
  { key: 'method', label: '자동이체여부' },
  { key: 'autoTransferUntil', label: '자동이체기한' },
  { key: 'accountNumber', label: '자동이체계좌' },
  { key: 'bank', label: '은행' },
];

/**
 * 적힌 문장에서 이체일을 뽑는다.
 *
 * 꼴이 제각각이다 — "매달5일", "13일", "10-01", "매달1일고정", "직접이체".
 * "10-01" 처럼 두 토막이면 뒤가 날이다(앞은 월이라 매달 이체와 상관없다).
 * 못 뽑으면 0으로 두고 화면에서 사람이 채운다. 틀린 날에 알림을 보내느니 안 보내는 게 낫다.
 */
export function parseTransferDay(text: string): number {
  const raw = text.trim();
  if (!raw) return 0;

  const pair = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const day = pair ? Number(pair[2]) : Number(raw.match(/\d+/)?.[0] ?? 0);
  return day >= 1 && day <= 31 ? day : 0;
}

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
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) transferDayOfMonth?: number;
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
    private readonly carvior: CarviorService,
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
        transferDayOfMonth: dto.transferDayOfMonth ?? parseTransferDay(dto.transferDay ?? ''),
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
        ...(dto.transferDay !== undefined
          ? {
              transferDay: dto.transferDay.trim(),
              // 원문을 고치면 이체일도 다시 뽑는다. 따로 넣어준 게 있으면 그게 우선이다.
              ...(dto.transferDayOfMonth === undefined
                ? { transferDayOfMonth: parseTransferDay(dto.transferDay) }
                : {}),
            }
          : {}),
        ...(dto.transferDayOfMonth !== undefined ? { transferDayOfMonth: dto.transferDayOfMonth } : {}),
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
   * 알림을 받을 사람 — 이 장부를 볼 수 있는 사람과 같다.
   *
   * 못 보는 사람에게 알림만 가면 열어볼 수가 없다. 조건을 한 곳(auth/office-manager)에
   * 두고 둘 다 거기서 가져온다.
   */
  private async watchers(): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      where: LEDGER_VIEWER_WHERE,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * 영업소별 실적 — 검차를 몇 건 맡겼고 우리가 몇 대를 사왔는가.
   *
   * 회비는 매달 나가는데 검차도 안 맡기고 차도 안 주는 곳이 있다. 그런 곳을 찾으려면
   * 회비 옆에 실적이 같이 보여야 한다 — 장부만 봐서는 어디가 밑지는지 알 수가 없다.
   *
   * 검차는 카비어에 접수된 건으로 세고, 그중 매입가가 잡힌 건을 거래완료로 본다.
   * 매입은 매입 관리의 매입처로 센다.
   * 영업소 이름과 적어 오는 이름이 달라서(BYD 서초 / byd서초 / BYD서초점) 띄어쓰기를
   * 지우고 소문자로 맞춘 다음, 한쪽이 다른 쪽에 들어 있으면 같은 곳으로 본다.
   *
   * 카비어가 막히면 검차는 0으로 두고 매입만 센다 — 장부 화면이 통째로 막히면 안 된다.
   */
  async activity(): Promise<
    Record<string, { inspected: number; completed: number; purchased: number; lastAt: string | null }>
  > {
    const dealers = await this.prisma.dealerFeeAccount.findMany({
      where: { active: true },
      select: { id: true, dealerName: true },
    });
    if (dealers.length === 0) return {};

    const [contracts, intakes] = await Promise.all([
      this.carvior.findContracts().catch((e: Error) => {
        this.logger.warn(`카비어에서 검차 건수를 못 가져왔습니다: ${e.message}`);
        return [] as Awaited<ReturnType<CarviorService['findContracts']>>;
      }),
      this.prisma.purchaseIntake.findMany({ select: { source: true } }),
    ]);

    const key = (name: string) => name.replace(/\s+/g, '').toLowerCase();
    const matches = (dealer: string, other: string) => {
      const a = key(dealer);
      const b = key(other);
      return a.length > 1 && b.length > 1 && (b.includes(a) || a.includes(b));
    };

    const result: Record<
      string,
      { inspected: number; completed: number; purchased: number; lastAt: string | null }
    > = {};

    for (const d of dealers) {
      const mine = contracts.filter((c) => matches(d.dealerName, c.dealerName ?? ''));
      const last = mine
        .map((c) => c.createdAt)
        .filter(Boolean)
        .sort()
        .at(-1);

      result[d.id] = {
        inspected: mine.length,
        // 매입가가 적힌 건이 실제로 거래가 끝난 건이다.
        completed: mine.filter((c) => (c.purchasePrice ?? 0) > 0).length,
        purchased: intakes.filter((i) => matches(d.dealerName, i.source)).length,
        lastAt: last ? formatDateOnly(new Date(last)) : null,
      };
    }
    return result;
  }

  /** 지금 이 장부를 볼 수 있는 사람 — 화면에서 "누가 보는지"를 확인한다 */
  async viewers() {
    return this.prisma.employee.findMany({
      where: LEDGER_VIEWER_WHERE,
      select: { id: true, name: true, position: true },
      orderBy: { name: 'asc' },
    });
  }

  private toView<T extends { startedOn: Date | null }>(row: T) {
    return { ...row, startedOn: formatDateOnlyOrNull(row.startedOn) };
  }
}

// ── 이체일 알림 ──────────────────────────────

/**
 * 오늘 이체할 곳을 모아 아침에 한 번 알린다.
 *
 * 영업소마다 따로 울리면 하루에 열 번이 온다. 한 장으로 묶어 "오늘 얼마를 어디에"만
 * 알려주면 그걸 보고 이체하면 된다.
 *
 * 자동이체인 곳도 넣는다 — 빠져나갔는지 확인하는 것도 일이다. 해지한 곳만 뺀다.
 */
@Injectable()
export class DealerFeeReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DealerFeeReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  /** 하루에 한 번만 보낸다 — 30분마다 깨어나므로 보낸 날을 적어둔다 */
  private sentOn = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const hour = Number(this.config.get<string>('DEALER_FEE_REMINDER_HOUR', '9'));
    if (!Number.isFinite(hour) || hour < 0) {
      this.logger.log('DEALER_FEE_REMINDER_HOUR 가 꺼져 있어 이체일 알림을 보내지 않습니다.');
      return;
    }

    // 30분마다 깨어나 '보낼 시간인가'만 본다. 정각에 딱 맞추려 들면 서버가 잠깐 내려가도
    // 그날 알림을 통째로 놓친다.
    this.timer = setInterval(() => void this.tick(hour), 30 * 60 * 1000);
    this.timer.unref?.();
    this.logger.log(`상조회비 이체일 알림 매일 ${hour}시`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(hour: number): Promise<void> {
    const today = todayKst();
    if (this.sentOn === today) return;

    // 서버 시각이 UTC라 한국 시각으로 바꿔 본다.
    const kstHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()),
    );
    if (kstHour < hour) return;

    this.sentOn = today;
    try {
      await this.notifyDue(today);
    } catch (e) {
      this.logger.warn(`이체일 알림 실패: ${(e as Error).message}`);
      this.sentOn = '';
    }
  }

  /** 그날 이체할 곳을 모아 한 장으로 보낸다 */
  async notifyDue(today: string): Promise<{ count: number; total: number }> {
    const day = Number(today.slice(8, 10));

    const dealers = await this.prisma.dealerFeeAccount.findMany({
      where: {
        active: true,
        transferDayOfMonth: day,
        method: { not: DealerFeeMethod.CANCELED },
      },
      orderBy: { dealerName: 'asc' },
    });
    if (dealers.length === 0) return { count: 0, total: 0 };

    const lines: string[] = [];
    let total = 0;

    for (const d of dealers) {
      // 회비를 안 적어둔 곳은 낼 게 없다.
      if (d.monthlyFee <= 0) continue;

      total += d.monthlyFee;
      const how = d.method === DealerFeeMethod.DIRECT ? ' [직접]' : '';
      lines.push(`${d.dealerName} ${d.monthlyFee.toLocaleString()}원${how}`);
    }
    if (lines.length === 0) return { count: 0, total: 0 };

    const watchers = await this.prisma.employee.findMany({ where: LEDGER_VIEWER_WHERE, select: { id: true } });
    if (watchers.length === 0) return { count: lines.length, total };
    const ids = watchers.map((w) => w.id);

    const message = `오늘(${day}일) 상조회비 ${lines.length}곳 · 합계 ${total.toLocaleString()}원 — ${lines.join(', ')}`;

    await this.prisma.notification.createMany({
      data: ids.map((employeeId) => ({
        type: NotificationType.DEALER_FEE,
        message,
        employeeId,
        date: new Date(`${today}T00:00:00.000Z`),
      })),
    });
    this.realtime.toEmployees(ids, REALTIME_EVENT.notification, {
      type: NotificationType.DEALER_FEE,
      message,
      date: today,
    });
    void this.push.sendToEmployees(ids, {
      title: `오늘 상조회비 ${total.toLocaleString()}원`,
      body: `${lines.length}곳 — ${lines.slice(0, 3).join(', ')}${lines.length > 3 ? ' 외' : ''}`,
    });

    this.logger.log(`이체일 알림: ${lines.length}곳 ${total.toLocaleString()}원`);
    return { count: lines.length, total };
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
  constructor(
    private readonly dealerFees: DealerFeesService,
    private readonly reminder: DealerFeeReminderService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: DealerFeeQueryDto) {
    assertOfficeManager(user);
    return this.dealerFees.findAll(query);
  }

  /** 영업소별 검차·매입 실적 — 회비만 나가는 곳을 찾는 데 쓴다. */
  @Get('activity')
  activity(@CurrentUser() user: AuthUser) {
    assertOfficeManager(user);
    return this.dealerFees.activity();
  }

  /** 지금 이 장부를 볼 수 있는 사람 — 화면에서 확인용 */
  @Get('viewers')
  viewers(@CurrentUser() user: AuthUser) {
    assertOfficeManager(user);
    return this.dealerFees.viewers();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDealerFeeDto) {
    assertOfficeManager(user);
    return this.dealerFees.create(dto);
  }

  /** 엑셀에서 붙여넣은 줄을 한 번에 — 이미 있는 업체명은 건너뛴다 */
  /** 오늘 이체할 곳을 지금 바로 알린다 — 시간을 기다리지 않고 확인할 때 */
  @Post('remind-now')
  remindNow(@CurrentUser() user: AuthUser) {
    assertOfficeManager(user);
    return this.reminder.notifyDue(todayKst());
  }

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
  imports: [RealtimeModule, PushModule, CarviorModule],
  controllers: [DealerFeesController],
  providers: [DealerFeesService, DealerFeeReminderService],
})
export class DealerFeesModule {}
