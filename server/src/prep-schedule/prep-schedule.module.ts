import { Body, Controller, Get, Injectable, Logger, Module, type OnModuleInit, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.module';
import { formatDateOnly, formatDateOnlyOrNull, todayKst, toDateOnly } from '../common/date.util';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 상품화 일정 — 차가 들어와서 광고에 올라가기까지.
 *
 * 들어온 차를 나흘 안에 광고까지 올리는 것이 목표다. 하루 늦으면 그만큼 재고일수가 늘고,
 * 늘어난 날수는 그대로 이자와 시세 하락이 된다.
 *
 * 단계가 넷이다 — 검차·성능점검(들어온 날), 판금·광택 외주 잡기(이튿날~사흘째),
 * 사진 촬영(나흘째), 매물 등록(나흘째). 날짜를 적는 이유는 '며칠 걸렸나'를 세기
 * 위해서다. 체크만 해 두면 끝났다는 것만 알고 어디서 늦어졌는지는 모른다.
 *
 * 줄은 매입 기록에서 저절로 생긴다. 차가 들어오면 일정이 시작되는 것이지, 누가 따로
 * 만들어야 시작되는 게 아니다.
 */

/** 단계 — 적는 칸과 화면에 적을 말을 한 벌로 둔다 */
export const PREP_STEPS = [
  { key: 'inspectedOn', label: '검차·성능', day: 1, todo: '들어온 날 바로 본다' },
  { key: 'outsourcedOn', label: '판금·광택', day: 3, todo: '외주 일정을 잡는다' },
  { key: 'photographedOn', label: '사진', day: 4, todo: '여섯 방향을 찍는다' },
  { key: 'listedOn', label: '매물 등록', day: 4, todo: '광고에 올린다' },
] as const;

export type PrepStep = (typeof PREP_STEPS)[number]['key'];

/** 들어와서 광고까지 — 이 날수를 넘기면 늦은 것이다 */
export const PREP_TARGET_DAYS = 4;

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class PrepScheduleService implements OnModuleInit {
  private readonly logger = new Logger(PrepScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * 하루에 한 번 — 줄을 채우고, 늦은 차를 알린다.
   *
   * 뜰 때 한 번 먼저 돌린다. 넘어져도 앱은 그대로 떠야 한다.
   */
  onModuleInit(): void {
    const run = () =>
      void this.sweep().catch((e: Error) => this.logger.warn(`상품화 일정 확인에 실패했습니다: ${e.message}`));
    run();
    setInterval(run, DAY).unref();
  }

  /**
   * 매입 기록에서 줄을 만든다 — 아직 광고에 안 올라간 차만.
   *
   * 이미 팔린 차는 만들지 않는다. 지난달에 팔고 나간 차까지 '상품화 안 끝남'으로 뜨면
   * 목록이 끝난 일로 가득 찬다.
   *
   * 차량번호는 손으로 적는 값이라 공백이 섞여 저장돼 있다 — 걷어내서 맞춘다.
   */
  private async ensureRows(): Promise<void> {
    const [intakes, sold, vehicles, rows] = await Promise.all([
      this.prisma.purchaseIntake.findMany({
        select: { vehicleNumber: true, vehicleName: true, date: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.purchaseSettlement.findMany({ where: { salePrice: { gt: 0 } }, select: { vehicleNumber: true } }),
      this.prisma.managedVehicle.findMany({ where: { soldDate: { not: null } }, select: { vehicleNumber: true } }),
      this.prisma.prepSchedule.findMany({ select: { vehicleNumber: true } }),
    ]);

    const gone = new Set<string>();
    for (const r of sold) gone.add(normalizePlate(r.vehicleNumber));
    for (const v of vehicles) gone.add(normalizePlate(v.vehicleNumber));
    const have = new Set(rows.map((r) => r.vehicleNumber));

    // 오래된 것부터 넣어 최근 매입이 덮어쓰게 한다(되사온 차)
    const latest = new Map<string, { name: string; date: Date }>();
    for (const r of intakes) latest.set(normalizePlate(r.vehicleNumber), { name: r.vehicleName, date: r.date });

    const made = [...latest.entries()]
      .filter(([plate]) => !gone.has(plate) && !have.has(plate))
      .map(([plate, v]) => ({ vehicleNumber: plate, vehicleName: v.name, intakeDate: v.date }));

    if (made.length > 0) await this.prisma.prepSchedule.createMany({ data: made, skipDuplicates: true });
  }

  /**
   * 사진은 저절로 채운다.
   *
   * 상품화 사진을 올리면 그게 곧 '사진 찍었다'는 말이다. 같은 일을 두 번 적게 하면
   * 한쪽은 반드시 비어 있게 된다.
   */
  private async fillPhotos(): Promise<void> {
    const sets = await this.prisma.vehiclePhotoSet.findMany({ select: { vehicleNumber: true, shotOn: true } });
    const rows = await this.prisma.prepSchedule.findMany({
      where: { photographedOn: null },
      select: { id: true, vehicleNumber: true },
    });
    if (rows.length === 0) return;

    const shot = new Map<string, Date>();
    for (const s of sets) {
      const plate = normalizePlate(s.vehicleNumber);
      const before = shot.get(plate);
      if (!before || s.shotOn < before) shot.set(plate, s.shotOn);
    }

    for (const row of rows) {
      const day = shot.get(row.vehicleNumber);
      if (day) await this.prisma.prepSchedule.update({ where: { id: row.id }, data: { photographedOn: day } });
    }
  }

  /**
   * 나흘을 넘겼는데 아직 광고에 안 올라간 차를 알린다.
   *
   * 한 번만 알린다 — 매일 같은 차가 올라오면 아무도 안 본다. 어느 단계에서 멈췄는지를
   * 같이 적는다. "늦었습니다"만 가면 받는 사람은 무엇을 해야 하는지 모른다.
   *
   * 금액은 안 보낸다. 공지방은 전 직원이 본다.
   */
  async sweep(): Promise<{ late: number }> {
    await this.ensureRows();
    await this.fillPhotos();

    const today = toDateOnly(todayKst()).getTime();
    const rows = await this.prisma.prepSchedule.findMany({ where: { listedOn: null, lateNotifiedAt: null } });

    const late = rows.filter((r) => Math.floor((today - r.intakeDate.getTime()) / DAY) > PREP_TARGET_DAYS);
    if (late.length === 0) return { late: 0 };

    const lines = [`🛠 <b>상품화 지연</b> — 들어온 지 ${PREP_TARGET_DAYS}일이 넘었는데 광고가 안 올라갔습니다`];
    for (const r of late) {
      const days = Math.floor((today - r.intakeDate.getTime()) / DAY);
      // 멈춘 자리 — 아직 안 찍은 첫 단계다
      const stuck = PREP_STEPS.find((s) => !r[s.key])?.label ?? '매물 등록';
      lines.push(`· ${r.vehicleNumber} ${r.vehicleName} — ${days}일째 · ${stuck}에서 멈춤`);
    }
    this.telegram.notify(lines.join('\n'));

    await this.prisma.prepSchedule.updateMany({
      where: { id: { in: late.map((r) => r.id) } },
      data: { lateNotifiedAt: new Date() },
    });

    this.logger.log(`상품화 지연 ${late.length}대를 알렸습니다.`);
    return { late: late.length };
  }

  /** 아직 광고에 안 올라간 차 — 오래 걸린 차부터 */
  async list() {
    await this.ensureRows();
    await this.fillPhotos();

    const today = toDateOnly(todayKst()).getTime();
    const rows = await this.prisma.prepSchedule.findMany({ where: { listedOn: null }, orderBy: { intakeDate: 'asc' } });

    return rows.map((r) => ({
      id: r.id,
      vehicleNumber: r.vehicleNumber,
      vehicleName: r.vehicleName,
      intakeDate: formatDateOnly(r.intakeDate),
      days: Math.floor((today - r.intakeDate.getTime()) / DAY),
      inspectedOn: formatDateOnlyOrNull(r.inspectedOn),
      outsourcedOn: formatDateOnlyOrNull(r.outsourcedOn),
      photographedOn: formatDateOnlyOrNull(r.photographedOn),
      listedOn: formatDateOnlyOrNull(r.listedOn),
      memo: r.memo,
    }));
  }

  /**
   * 단계를 찍는다 — 누르면 오늘, 다시 누르면 지운다.
   *
   * 날짜를 손으로 고르게 하지 않는다. 끝낸 날 바로 찍는 자리라 거의 늘 오늘이고,
   * 지난 날짜를 적을 일은 드물다 — 드문 쪽에 품을 들이면 매일 쓰는 쪽이 느려진다.
   */
  async stamp(id: string, step: PrepStep, on: boolean) {
    const today = toDateOnly(todayKst());
    return this.prisma.prepSchedule.update({
      where: { id },
      data: { [step]: on ? today : null },
    });
  }

  async saveMemo(id: string, memo: string) {
    return this.prisma.prepSchedule.update({ where: { id }, data: { memo: memo.trim().slice(0, 255) } });
  }
}

@Controller('prep-schedule')
export class PrepScheduleController {
  constructor(private readonly service: PrepScheduleService) {}

  /** 단계와 목표 날수 — 화면이 같은 말을 쓰게 서버에서 내려준다 */
  @Get('rules')
  rules() {
    return { steps: PREP_STEPS, targetDays: PREP_TARGET_DAYS };
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Post(':id/stamp')
  stamp(@Param('id') id: string, @Body() dto: { step?: PrepStep; on?: boolean }) {
    return this.service.stamp(id, dto.step ?? 'inspectedOn', dto.on !== false);
  }

  @Post(':id/memo')
  memo(@Param('id') id: string, @Body() dto: { memo?: string }) {
    return this.service.saveMemo(id, dto.memo ?? '');
  }
}

@Module({ controllers: [PrepScheduleController], providers: [PrepScheduleService] })
export class PrepScheduleModule {}
