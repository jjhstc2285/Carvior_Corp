import {
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
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { formatDateOnly, todayKst, toDateOnly } from '../common/date.util';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushService } from '../push/push.service';
import { PushModule } from '../push/push.module';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { AdSpendController, AdSpendService } from './ad-spend';
import { AdReportController, AdReportService } from './ad-report';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 광고를 맡은 팀 — 알림이 이 팀과 관리자에게 가고, 계약을 적는 것도 이 팀이다 */
const AD_TEAM = '광고팀';

// ── DTO ──────────────────────────────

export class CreateAdContractDto {
  @IsString() @IsNotEmpty({ message: '플랫폼을 입력해 주세요.' }) @MaxLength(30) platform!: string;
  @IsOptional() @IsString() @MaxLength(60) productName?: string;

  /** 대당 금액 — 22만원 상품이면 220000 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitFee?: number;
  @IsOptional() @IsString() @MaxLength(4) quotaCycle?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) quotaCount?: number;
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

/**
 * 약정 주기 마감이 이만큼 남았을 때부터 모자란 대수를 알린다.
 *
 * 분기에 90대짜리 약정은 일주일 전에 알려 봐야 손쓸 수가 없다 — 2주는 줘야 한다.
 */
const WARN_DAYS = 14;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
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
    const months = dto.months ?? 12;
    const row = await this.prisma.adContract.create({
      data: {
        platform: dto.platform.trim(),
        productName: dto.productName?.trim() ?? '',
        unitFee: dto.unitFee ?? 0,
        quotaCycle: dto.quotaCycle?.trim() || '분기',
        quotaCount: dto.quotaCount ?? 0,
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
        ...(dto.unitFee !== undefined ? { unitFee: dto.unitFee } : {}),
        ...(dto.quotaCycle !== undefined ? { quotaCycle: dto.quotaCycle.trim() } : {}),
        ...(dto.quotaCount !== undefined ? { quotaCount: dto.quotaCount } : {}),
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
   * 계약 기간을 약정 주기로 끊는다.
   *
   * 분기 약정은 달력 분기로 센다 — "1~4분기별 90대"는 1~3월, 4~6월… 을 말한다.
   * 계약 시작이 분기 중간이어도 그 분기 하나로 본다. 약정이 없는 상품은 달로 끊어
   * 돈만 센다 — 대수는 안 따져도 얼마 나갔는지는 봐야 한다.
   */
  private periodsOf(
    quotaCycle: string,
    quotaCount: number,
    unitFee: number,
    startOn: string,
    endOn: string,
    postings: { postedOn: string }[],
  ) {
    const byQuarter = quotaCycle === '분기';
    const step = byQuarter ? 3 : 1;

    let year = Number(startOn.slice(0, 4));
    // 분기면 그 분기의 첫 달로 내린다 — 5월 시작이면 4월부터가 2분기다
    let month = byQuarter ? Math.floor((Number(startOn.slice(5, 7)) - 1) / 3) * 3 + 1 : Number(startOn.slice(5, 7));

    const out: { label: string; from: string; to: string; quota: number; count: number; fee: number; shortfall: number }[] = [];
    // 10년치를 넘기면 어딘가 잘못된 것이다 — 무한히 돌지 않게 막는다
    for (let guard = 0; guard < 120; guard += 1) {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      if (from > endOn) break;

      let nextYear = year;
      let nextMonth = month + step;
      if (nextMonth > 12) {
        nextYear += 1;
        nextMonth -= 12;
      }
      const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const count = postings.filter((x) => x.postedOn >= from && x.postedOn < to).length;
      const quota = quotaCycle === '없음' ? 0 : quotaCount;
      out.push({
        label: byQuarter ? `${year}년 ${Math.floor((month - 1) / 3) + 1}분기` : `${year}년 ${month}월`,
        from,
        to,
        quota,
        count,
        /** 대당 금액 × 찍은 대수 — 정액이 아니라 쓴 만큼 나간다 */
        fee: unitFee * count,
        shortfall: quota > 0 ? Math.max(0, quota - count) : 0,
      });

      year = nextYear;
      month = nextMonth;
    }
    return out;
  }

  /**
   * 계약 한 건의 진행 상황.
   *
   * 남은 대수만 보여주면 '아직 여유 있네' 하고 넘어간다. 주기 마감까지 남은 날로 나눠
   * '하루에 몇 대를 찍어야 하는지'까지 알려줘야 움직인다.
   */
  private toView(row: {
    id: string;
    platform: string;
    productName: string;
    unitFee: number;
    quotaCycle: string;
    quotaCount: number;
    months: number;
    startOn: Date;
    endOn: Date;
    note: string;
    active: boolean;
    postings?: { id: string; vehicleNumber: string; postedOn: Date; auto: boolean; memo: string }[];
  }) {
    const postings = (row.postings ?? []).map((p) => ({ ...p, postedOn: formatDateOnly(p.postedOn) }));
    const startOn = formatDateOnly(row.startOn);
    const endOn = formatDateOnly(row.endOn);
    const today = todayKst();

    const periods = this.periodsOf(row.quotaCycle, row.quotaCount, row.unitFee, startOn, endOn, postings);

    const used = postings.length;
    const daysLeft = Math.max(0, Math.ceil((row.endOn.getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / 86_400_000));

    /*
      지금이 어느 주기인가 — 이번 분기에 몇 대 남았는지가 실제로 보는 값이다.
      계약이 끝났거나 아직 시작 안 했으면 없다.
    */
    const cur = periods.find((x) => x.from <= today && today < x.to && startOn <= today && today <= endOn) ?? null;
    const curEnd = cur ? new Date(`${cur.to}T00:00:00.000Z`).getTime() : 0;
    // 주기 마감과 계약 마감 중 먼저 오는 쪽까지가 남은 날이다
    const curDaysLeft = cur
      ? Math.max(0, Math.min(Math.ceil((curEnd - new Date(`${today}T00:00:00.000Z`).getTime()) / 86_400_000), daysLeft))
      : 0;

    return {
      ...row,
      startOn,
      endOn,
      postings,
      periods,
      used,
      daysLeft,
      /** 지금까지 실제로 나간 돈 — 대당 금액 × 찍은 대수 */
      totalFee: row.unitFee * used,
      current: cur
        ? {
            label: cur.label,
            quota: cur.quota,
            count: cur.count,
            fee: cur.fee,
            remaining: cur.shortfall,
            daysLeft: curDaysLeft,
            /** 남은 날에 하루 몇 대를 찍어야 약정을 채우는지 */
            perDayNeeded: curDaysLeft > 0 ? Math.ceil(cur.shortfall / curDaysLeft) : cur.shortfall,
          }
        : null,
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
    // 이번 주기(분기)가 얼마 안 남았는데 약정 대수가 모자란 것
    const due = contracts.filter((c) => c.current && c.current.remaining > 0 && c.current.daysLeft <= WARN_DAYS);
    if (due.length === 0) return { count: 0 };

    const watchers = await this.prisma.employee.findMany({
      where: { active: true, OR: [{ department: AD_TEAM }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (watchers.length === 0) return { count: 0 };
    const ids = watchers.map((w) => w.id);

    const lines = due.map((c) =>
      `${c.platform} ${c.productName || ''} ${c.current?.label} ${c.current?.count}/${c.current?.quota}대 — ${c.current?.remaining}대 남음 (${c.current?.daysLeft}일 남음, 하루 ${c.current?.perDayNeeded}대)`.replace(
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
 * 아침에 한 번, 못 쓴 대수를 알린다.
 *
 * 차를 붙이는 건 사람이 [차량 넣기]로 한다 — 기간만 맞으면 모든 계약에 똑같이 붙던
 * 자동 집계를 없앴다. 같은 차가 여러 상품에 중복으로 세어졌기 때문이다.
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
/**
 * 계약을 적을 수 있는 사람 — 광고팀과 관리자.
 *
 * 보는 건 전 직원이다(어느 플랫폼에 몇 대가 남았는지는 매물 올리는 사람이면 다 알아야
 * 한다). 적는 건 다르다 — 금액과 약정 대수가 걸린 문서라 아무나 고칠 일이 아니다.
 *
 * 그동안 화면에서만 단추를 가리고 서버는 누구나 쓸 수 있었다. 주소를 아는 사람은 그대로
 * 보낼 수 있으니 여기서 한 번 더 본다.
 */
function assertAdEditor(user: AuthUser): void {
  if (user.role === Role.ADMIN || user.department === AD_TEAM) return;
  throw new ForbiddenException('광고 계약은 광고팀과 관리자만 등록·수정할 수 있습니다.');
}

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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdContractDto) {
    assertAdEditor(user);
    return this.ads.create(dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAdContractDto) {
    assertAdEditor(user);
    return this.ads.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertAdEditor(user);
    await this.ads.remove(id);
  }

  @Post(':id/postings')
  addPostings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPostingDto) {
    assertAdEditor(user);
    return this.ads.addPostings(id, dto);
  }

  @Delete('postings/:id')
  @HttpCode(204)
  async removePosting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertAdEditor(user);
    await this.ads.removePosting(id);
  }

}

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [AdsController, AdSpendController, AdReportController],
  providers: [AdsService, AdReminderService, AdSpendService, AdReportService],
})
export class AdsModule {}
