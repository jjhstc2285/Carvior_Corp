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
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, todayKst, toDateOnly } from '../common/date.util';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushService } from '../push/push.service';
import { PushModule } from '../push/push.module';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { CarviorModule, CarviorService } from '../carvior/carvior.module';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 광고를 맡은 팀 — 알림이 이 팀과 관리자에게 간다 */
const AD_TEAM = '광고팀';

// ── DTO ──────────────────────────────

export class CreateAdContractDto {
  @IsString() @IsNotEmpty({ message: '플랫폼을 입력해 주세요.' }) @MaxLength(30) platform!: string;
  @IsOptional() @IsString() @MaxLength(60) productName?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyFee?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyQuota?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) months?: number;

  @Matches(DATE_PATTERN, { message: '시작일은 YYYY-MM-DD 형식이어야 합니다.' }) startOn!: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateAdContractDto extends CreateAdContractDto {
  @IsOptional() @IsString() @MaxLength(30) declare platform: string;
  @IsOptional() @Matches(DATE_PATTERN) declare startOn: string;
}

export class AddPostingDto {
  /** 줄바꿈이나 쉼표로 여러 대를 한 번에 넣는다 */
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) vehicleNumbers!: string;
  @IsOptional() @Matches(DATE_PATTERN) postedOn?: string;
}

// ── Service ──────────────────────────────

/** 계약 끝이 이만큼 남았을 때부터 못 쓴 대수를 알린다 */
const WARN_DAYS = 7;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carvior: CarviorService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /** 시작일 + 개월 수. 3개월 계약이면 시작일로부터 3개월 뒤 하루 전까지다. */
  private endOf(startOn: string, months: number): Date {
    const [y, m, d] = startOn.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1 + months, d));
    end.setUTCDate(end.getUTCDate() - 1);
    return end;
  }

  async findAll(includeEnded: boolean) {
    const rows = await this.prisma.adContract.findMany({
      where: includeEnded ? {} : { active: true },
      include: { postings: { orderBy: { postedOn: 'desc' } } },
      orderBy: [{ active: 'desc' }, { endOn: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(dto: CreateAdContractDto) {
    const months = dto.months ?? 1;
    const row = await this.prisma.adContract.create({
      data: {
        platform: dto.platform.trim(),
        productName: dto.productName?.trim() ?? '',
        monthlyFee: dto.monthlyFee ?? 0,
        monthlyQuota: dto.monthlyQuota ?? 0,
        months,
        startOn: toDateOnly(dto.startOn),
        endOn: this.endOf(dto.startOn, months),
        note: dto.note?.trim() ?? '',
        active: dto.active ?? true,
      },
      include: { postings: true },
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpdateAdContractDto) {
    const before = await this.prisma.adContract.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('광고 계약을 찾을 수 없습니다.');

    // 시작일이나 개월 수가 바뀌면 마감일도 따라가야 한다 — 따로 두면 둘이 어긋난다.
    const startOn = dto.startOn ?? formatDateOnly(before.startOn);
    const months = dto.months ?? before.months;

    const row = await this.prisma.adContract.update({
      where: { id },
      data: {
        ...(dto.platform !== undefined ? { platform: dto.platform.trim() } : {}),
        ...(dto.productName !== undefined ? { productName: dto.productName.trim() } : {}),
        ...(dto.monthlyFee !== undefined ? { monthlyFee: dto.monthlyFee } : {}),
        ...(dto.monthlyQuota !== undefined ? { monthlyQuota: dto.monthlyQuota } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.startOn !== undefined || dto.months !== undefined
          ? { startOn: toDateOnly(startOn), months, endOn: this.endOf(startOn, months) }
          : {}),
      },
      include: { postings: { orderBy: { postedOn: 'desc' } } },
    });
    return this.toView(row);
  }

  async remove(id: string) {
    const found = await this.prisma.adContract.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('광고 계약을 찾을 수 없습니다.');
    await this.prisma.adContract.delete({ where: { id } });
  }

  /** 손으로 넣기 — 줄바꿈·쉼표로 여러 대를 한 번에. 이미 있는 차는 건너뛴다. */
  async addPostings(contractId: string, dto: AddPostingDto) {
    const contract = await this.prisma.adContract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('광고 계약을 찾을 수 없습니다.');

    const plates = [
      ...new Set(
        dto.vehicleNumbers
          .split(/[\n,]/)
          .map((v) => normalizePlate(v.trim()))
          .filter(Boolean),
      ),
    ];

    const created = await this.prisma.adPosting.createMany({
      data: plates.map((vehicleNumber) => ({
        contractId,
        vehicleNumber,
        postedOn: toDateOnly(dto.postedOn || todayKst()),
        auto: false,
      })),
      skipDuplicates: true,
    });
    return { added: created.count, skipped: plates.length - created.count };
  }

  async removePosting(id: string) {
    await this.prisma.adPosting.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('등록 내역을 찾을 수 없습니다.');
    });
  }

  /**
   * 진단완료된 차를 계약에 붙인다.
   *
   * 광고 상품은 진단 건수로 소진된다 — 진단서가 나온 건이 곧 한 건이다.
   * 계약만 잡히고 진단이 안 나간 건은 약정을 쓴 게 아니라서 뺀다.
   *
   * 계약 기간 안에 잡힌 것만 본다. 같은 차가 여러 번 있으면 한 건으로 세고 처음 날을 쓴다.
   * 손으로 넣은 건은 그대로 둔다 — 사람이 넣은 걸 자동 집계가 덮으면 왜 사라졌는지 알 수 없다.
   *
   * 카비어가 죽어 있어도 화면은 그대로 써야 하므로 실패하면 0건으로 돌린다.
   */
  async syncFromCarvior(contractId?: string) {
    const contracts = await this.prisma.adContract.findMany({
      where: { active: true, ...(contractId ? { id: contractId } : {}) },
    });
    if (contracts.length === 0) return { added: 0 };

    let diagnosed: { carNumber: string; createdAt: string }[];
    try {
      // 진단서가 나온 건만 약정을 쓴 것으로 본다.
      diagnosed = (await this.carvior.findContracts()).filter((c) => c.reportUrl);
    } catch (e) {
      this.logger.warn(`카비어 조회 실패: ${(e as Error).message}`);
      return { added: 0 };
    }

    let added = 0;
    for (const c of contracts) {
      const from = c.startOn.getTime();
      const to = c.endOn.getTime() + 86_400_000;

      const first = new Map<string, Date>();
      for (const item of diagnosed) {
        const at = new Date(item.createdAt);
        if (at.getTime() < from || at.getTime() >= to) continue;

        const plate = normalizePlate(item.carNumber ?? '');
        if (!plate) continue;
        const seen = first.get(plate);
        if (!seen || at < seen) first.set(plate, at);
      }

      const res = await this.prisma.adPosting.createMany({
        data: [...first].map(([vehicleNumber, at]) => ({
          contractId: c.id,
          vehicleNumber,
          postedOn: toDateOnly(formatDateOnly(at)),
          auto: true,
        })),
        skipDuplicates: true,
      });
      added += res.count;
    }
    return { added };
  }

  /**
   * 계약 한 건의 진행 상황.
   *
   * 남은 대수만 보여주면 '아직 여유 있네' 하고 넘어간다. 남은 기간으로 나눠
   * '하루에 몇 대를 올려야 하는지'까지 알려줘야 움직인다.
   */
  private toView(row: {
    id: string;
    platform: string;
    productName: string;
    monthlyFee: number;
    monthlyQuota: number;
    months: number;
    startOn: Date;
    endOn: Date;
    note: string;
    active: boolean;
    postings?: { id: string; vehicleNumber: string; postedOn: Date; auto: boolean; memo: string }[];
  }) {
    const postings = (row.postings ?? []).map((p) => ({ ...p, postedOn: formatDateOnly(p.postedOn) }));

    const totalQuota = row.monthlyQuota * row.months;
    const used = postings.length;
    const today = new Date(`${todayKst()}T00:00:00.000Z`);
    const daysLeft = Math.max(0, Math.ceil((row.endOn.getTime() - today.getTime()) / 86_400_000));

    const remaining = Math.max(0, totalQuota - used);
    // 계약이 끝났으면 남은 대수가 곧 날아간 돈이다.
    const wastedFee = daysLeft === 0 && totalQuota > 0
      ? Math.round((row.monthlyFee * row.months * remaining) / totalQuota)
      : 0;

    /*
     * 월별로 접는다 — "9월에 몇 건 하고 광고비 얼마 썼나"가 실제로 보는 단위다.
     * 계약이 달 중간에 시작해도 시작일 기준으로 한 달씩 끊는다(9/15 시작이면 9/15~10/14).
     */
    const monthly = Array.from({ length: row.months }, (_, i) => {
      const from = new Date(row.startOn);
      from.setUTCMonth(from.getUTCMonth() + i);
      const to = new Date(row.startOn);
      to.setUTCMonth(to.getUTCMonth() + i + 1);

      const fromStr = formatDateOnly(from);
      const toStr = formatDateOnly(to);
      const count = postings.filter((p) => p.postedOn >= fromStr && p.postedOn < toStr).length;

      return {
        label: `${from.getUTCFullYear()}년 ${from.getUTCMonth() + 1}월`,
        from: fromStr,
        quota: row.monthlyQuota,
        count,
        fee: row.monthlyFee,
        /** 그 달에 못 쓴 건수만큼의 광고비 */
        wasted: row.monthlyQuota > 0 ? Math.round((row.monthlyFee * Math.max(0, row.monthlyQuota - count)) / row.monthlyQuota) : 0,
      };
    });

    return {
      ...row,
      startOn: formatDateOnly(row.startOn),
      endOn: formatDateOnly(row.endOn),
      postings,
      monthly,
      totalQuota,
      used,
      remaining,
      daysLeft,
      /** 남은 기간에 하루 몇 대를 올려야 다 쓰는지 */
      perDayNeeded: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining,
      totalFee: row.monthlyFee * row.months,
      wastedFee,
    };
  }

  /**
   * 못 쓴 대수가 남았는데 기간이 얼마 안 남았으면 광고팀과 관리자에게 알린다.
   *
   * 하루에 한 번만 보낸다. 계약마다 따로 울리면 여러 건일 때 알림이 도배된다 —
   * 한 장으로 묶어 어느 계약이 몇 대 남았는지만 알려준다.
   */
  async notifyShortfall(today: string): Promise<{ count: number }> {
    const contracts = await this.findAll(false);
    const due = contracts.filter((c) => c.remaining > 0 && c.daysLeft <= WARN_DAYS);
    if (due.length === 0) return { count: 0 };

    const watchers = await this.prisma.employee.findMany({
      where: { active: true, OR: [{ department: AD_TEAM }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (watchers.length === 0) return { count: 0 };
    const ids = watchers.map((w) => w.id);

    const lines = due.map(
      (c) =>
        `${c.platform} ${c.productName || ''} ${c.used}/${c.totalQuota}대 — ${c.remaining}대 남음 (${c.daysLeft}일 남음, 하루 ${c.perDayNeeded}대)`.replace(
          /\s+/g,
          ' ',
        ),
    );
    const message = `광고 약정 소진 확인 — ${lines.join(' / ')}`;

    await this.prisma.notification.createMany({
      data: ids.map((employeeId) => ({
        type: NotificationType.AD_QUOTA,
        message,
        employeeId,
        date: new Date(`${today}T00:00:00.000Z`),
      })),
    });
    this.realtime.toEmployees(ids, REALTIME_EVENT.notification, {
      type: NotificationType.AD_QUOTA,
      message,
      date: today,
    });
    void this.push.sendToEmployees(ids, {
      title: '광고 약정이 남았습니다',
      body: lines.slice(0, 2).join(' / ') + (lines.length > 2 ? ' 외' : ''),
    });

    this.logger.log(`광고 약정 알림: ${due.length}건`);
    return { count: due.length };
  }
}

// ── 매일 확인 ──────────────────────────────

/**
 * 아침에 한 번, 카비어에서 진단 나간 건을 계약에 붙이고 못 쓴 대수를 알린다.
 *
 * 30분마다 깨어나 보낼 시간인지만 본다 — 정각에 맞추면 서버가 잠깐 내려갔을 때
 * 그날을 통째로 놓친다.
 */
@Injectable()
export class AdReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private ranOn = '';

  constructor(
    private readonly ads: AdsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const hour = Number(this.config.get<string>('AD_REMINDER_HOUR', '10'));
    if (!Number.isFinite(hour) || hour < 0) {
      this.logger.log('AD_REMINDER_HOUR 가 꺼져 있어 광고 알림을 보내지 않습니다.');
      return;
    }
    this.timer = setInterval(() => void this.tick(hour), 30 * 60 * 1000);
    this.timer.unref?.();
    this.logger.log(`광고 약정 확인 매일 ${hour}시`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(hour: number): Promise<void> {
    const today = todayKst();
    if (this.ranOn === today) return;

    const kstHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()),
    );
    if (kstHour < hour) return;

    this.ranOn = today;
    try {
      // 세기 전에 먼저 붙인다 — 안 붙이고 세면 실제보다 적게 나온다.
      await this.ads.syncFromCarvior();
      await this.ads.notifyShortfall(today);
    } catch (e) {
      this.logger.warn(`광고 약정 확인 실패: ${(e as Error).message}`);
      this.ranOn = '';
    }
  }
}

// ── Controller ──────────────────────────────

/**
 * 광고 관리.
 *
 * 전 직원이 본다 — 어느 플랫폼에 몇 대가 남았는지는 매물을 올리는 사람이면 다 알아야 한다.
 * 알림은 광고팀과 관리자에게 간다.
 */
@Controller('ads')
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly reminder: AdReminderService,
  ) {}

  @Get()
  findAll() {
    return this.ads.findAll(false);
  }

  @Get('all')
  findAllIncludingEnded() {
    return this.ads.findAll(true);
  }

  @Post()
  create(@Body() dto: CreateAdContractDto) {
    return this.ads.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdContractDto) {
    return this.ads.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.ads.remove(id);
  }

  @Post(':id/postings')
  addPostings(@Param('id') id: string, @Body() dto: AddPostingDto) {
    return this.ads.addPostings(id, dto);
  }

  @Delete('postings/:id')
  @HttpCode(204)
  async removePosting(@Param('id') id: string) {
    await this.ads.removePosting(id);
  }

  /** 진단완료된 차를 지금 붙인다 — 아침을 기다리지 않고 확인할 때 */
  @Post('sync')
  sync() {
    return this.ads.syncFromCarvior();
  }
}

@Module({
  imports: [RealtimeModule, PushModule, CarviorModule],
  controllers: [AdsController],
  providers: [AdsService, AdReminderService],
})
export class AdsModule {}
