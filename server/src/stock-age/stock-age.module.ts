import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  type OnModuleInit,
  Param,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { TelegramService } from '../telegram/telegram.module';
import { formatDateOnly, todayKst, toDateOnly } from '../common/date.util';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 장기 재고 — 들어온 지 오래된 차를 단계마다 한 번씩 알린다.
 *
 * 차는 오래 들고 있을수록 손해다. 자리값이 들고, 시세는 떨어지고, 재고금융 이자가 붙는다.
 * 그런데 매일 보는 목록에서는 오래된 차가 새 차 사이에 섞여 있어 눈에 안 띈다.
 *
 * 단계마다 할 일이 다르다 — 서른 날은 값을 다시 보고, 마흔닷새는 내리고, 예순 날은
 * 도매로 넘길지 정한다. 알림에 그 할 일을 같이 적어 보낸다. "60일 지났습니다"만 가면
 * 받는 사람은 그래서 뭘 하라는 건지 모른다.
 *
 * 금액은 안 보낸다. 공지방은 전 직원이 본다.
 */

/** 넘길 때마다 알리는 단계와, 그때 할 일 */
export const STOCK_STAGES = [
  { days: 30, label: '30일', todo: '값을 다시 봅니다 — 시세가 내려갔는지, 광고가 올라가 있는지' },
  { days: 45, label: '45일', todo: '값을 내립니다 — 그대로 두면 이자만 붙습니다' },
  { days: 60, label: '60일', todo: '도매로 넘길지 정합니다 — 더 들고 있을 이유가 있는지 봅니다' },
] as const;

/** 조치 — 알린 뒤에 무엇을 했는가 */
export const STOCK_ACTIONS = ['가격인하', '도매전환', '보류'] as const;

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class StockAgeService implements OnModuleInit {
  private readonly logger = new Logger(StockAgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * 하루에 한 번 훑는다.
   *
   * 뜰 때 한 번 먼저 돌린다 — 상자가 밤에 꺼져 있다 아침에 켜지면 정해진 시각이
   * 지나가 버린다. 훑다 넘어져도 앱은 그대로 떠야 한다(재고 알림 때문에 전산이 멈추면 안 된다).
   */
  onModuleInit(): void {
    const run = () =>
      void this.sweep().catch((e: Error) => this.logger.warn(`장기 재고 확인에 실패했습니다: ${e.message}`));
    run();
    setInterval(run, DAY).unref();
  }

  /**
   * 아직 안 나간 차와 그 재고일수.
   *
   * 입고일은 매입 관리가 원본이다. 같은 차를 두 번 사 왔으면 최근 매입이 맞다.
   *
   * 나간 차는 뺀다 — 매입 정산에 차량판매가가 적혔거나, 재고금융에 매도일자가 적힌 차다.
   * 둘 중 하나만 봐서는 샌다: 판매가를 아직 안 적은 차가 있고, 매도일자를 안 적은 차도 있다.
   *
   * 차량번호는 손으로 적는 값이라 '124도 7252'처럼 공백이 섞여 저장돼 있다. 공백을 걷어낸
   * 번호로 바로 물으면 저장된 글자와 달라 한 건도 안 걸린다 — 읽어와서 맞춘다.
   */
  private async inStock(): Promise<{ plate: string; name: string; intakeDate: Date; days: number }[]> {
    const [intakes, settlements, vehicles] = await Promise.all([
      this.prisma.purchaseIntake.findMany({
        select: { vehicleNumber: true, vehicleName: true, date: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.purchaseSettlement.findMany({
        where: { salePrice: { gt: 0 } },
        select: { vehicleNumber: true },
      }),
      this.prisma.managedVehicle.findMany({
        where: { soldDate: { not: null } },
        select: { vehicleNumber: true },
      }),
    ]);

    const gone = new Set<string>();
    for (const r of settlements) gone.add(normalizePlate(r.vehicleNumber));
    for (const v of vehicles) gone.add(normalizePlate(v.vehicleNumber));

    // 오래된 것부터 넣어 최근 매입이 덮어쓰게 한다
    const latest = new Map<string, { name: string; intakeDate: Date }>();
    for (const r of intakes) {
      latest.set(normalizePlate(r.vehicleNumber), { name: r.vehicleName, intakeDate: r.date });
    }

    const today = toDateOnly(todayKst()).getTime();
    return [...latest.entries()]
      .filter(([plate]) => !gone.has(plate))
      .map(([plate, v]) => ({
        plate,
        name: v.name,
        intakeDate: v.intakeDate,
        days: Math.floor((today - v.intakeDate.getTime()) / DAY),
      }))
      .filter((r) => r.days >= STOCK_STAGES[0].days);
  }

  /**
   * 넘긴 단계를 알린다 — 단계마다 한 번씩.
   *
   * 한 차가 하루 사이에 두 단계를 넘기는 일은 없지만, 처음 켜는 날에는 예순 날 넘은 차가
   * 세 단계를 한꺼번에 넘고 있다. 그때는 제일 높은 단계만 알린다 — 같은 차로 세 줄이
   * 가면 읽는 사람이 세 대인 줄 안다. 나머지 단계는 보낸 것으로 적어 둔다.
   */
  async sweep(): Promise<{ notified: number }> {
    const rows = await this.inStock();
    if (rows.length === 0) return { notified: 0 };

    const already = await this.prisma.stockAgeAlert.findMany({
      select: { vehicleNumber: true, intakeDate: true, stage: true },
    });
    const seen = new Set(already.map((a) => `${a.vehicleNumber}|${formatDateOnly(a.intakeDate)}|${a.stage}`));

    /** 이번에 알릴 것 — 단계별로 묶어 한 통으로 보낸다 */
    const fresh: { stage: number; plate: string; name: string; days: number }[] = [];
    const made: { vehicleNumber: string; vehicleName: string; intakeDate: Date; stage: number; days: number }[] = [];

    for (const row of rows) {
      const passed = STOCK_STAGES.filter((s) => row.days >= s.days).map((s) => s.days);
      const fresher = passed.filter((stage) => !seen.has(`${row.plate}|${formatDateOnly(row.intakeDate)}|${stage}`));
      if (fresher.length === 0) continue;

      for (const stage of fresher) {
        made.push({
          vehicleNumber: row.plate,
          vehicleName: row.name,
          intakeDate: row.intakeDate,
          stage,
          days: row.days,
        });
      }
      // 제일 높은 단계만 알린다
      fresh.push({ stage: Math.max(...fresher), plate: row.plate, name: row.name, days: row.days });
    }

    if (made.length === 0) return { notified: 0 };

    await this.prisma.stockAgeAlert.createMany({ data: made, skipDuplicates: true });

    // 금액은 안 보낸다 — 공지방은 전 직원이 본다
    const lines: string[] = ['📦 <b>장기 재고</b>'];
    for (const stage of [...STOCK_STAGES].reverse()) {
      const list = fresh.filter((f) => f.stage === stage.days);
      if (list.length === 0) continue;
      lines.push(`\n<b>${stage.label} 넘김</b> (${list.length}대) — ${stage.todo}`);
      for (const f of list) lines.push(`· ${f.plate} ${f.name} — ${f.days}일`);
    }
    this.telegram.notify(lines.join('\n'));

    this.logger.log(`장기 재고 ${fresh.length}대를 알렸습니다.`);
    return { notified: fresh.length };
  }

  /**
   * 지금 장기 재고인 차 — 아직 안 나간 차만.
   *
   * 알림 기록이 아니라 지금 상태를 낸다. 팔린 차의 지난 알림까지 같이 보이면 할 일 목록이
   * 아니라 지난 기록이 된다.
   */
  async list() {
    const rows = await this.inStock();
    const alerts = await this.prisma.stockAgeAlert.findMany({ orderBy: { stage: 'desc' } });

    return rows
      .map((row) => {
        const day = formatDateOnly(row.intakeDate);
        const mine = alerts.filter((a) => a.vehicleNumber === row.plate && formatDateOnly(a.intakeDate) === day);
        // 조치는 제일 높은 단계에 적어 둔 것을 쓴다 — 마지막으로 무엇을 했는지가 궁금한 값이다
        const latest = mine.sort((a, b) => b.stage - a.stage)[0];
        const stage = STOCK_STAGES.filter((s) => row.days >= s.days).at(-1)?.days ?? 0;

        return {
          id: latest?.id ?? '',
          vehicleNumber: row.plate,
          vehicleName: row.name,
          intakeDate: day,
          days: row.days,
          stage,
          action: latest?.action ?? '',
          actionNote: latest?.actionNote ?? '',
          actionBy: latest?.actionBy ?? '',
          actionAt: latest?.actionAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }

  /** 무엇을 했는지 적어 둔다 — 적은 사람과 때는 서버가 박는다 */
  async saveAction(id: string, user: AuthUser, action: string, note: string) {
    const clean = action.trim().slice(0, 20);
    return this.prisma.stockAgeAlert.update({
      where: { id },
      data: {
        action: clean,
        actionNote: note.trim().slice(0, 255),
        actionBy: clean || note.trim() ? user.name : '',
        actionAt: clean || note.trim() ? new Date() : null,
      },
    });
  }
}

@Controller('stock-age')
export class StockAgeController {
  constructor(private readonly service: StockAgeService) {}

  /** 단계와 할 일 — 화면이 같은 말을 쓰게 서버에서 내려준다 */
  @Get('rules')
  rules() {
    return { stages: STOCK_STAGES, actions: STOCK_ACTIONS };
  }

  @Get()
  list() {
    return this.service.list();
  }

  /** 손으로 한 번 돌려본다 — 하루에 한 번 도는 것과 같은 일이다 */
  @Post('sweep')
  sweep() {
    return this.service.sweep();
  }

  @Post(':id/action')
  action(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { action?: string; note?: string },
  ) {
    return this.service.saveAction(id, user, dto.action ?? '', dto.note ?? '');
  }
}

@Module({ controllers: [StockAgeController], providers: [StockAgeService] })
export class StockAgeModule {}
