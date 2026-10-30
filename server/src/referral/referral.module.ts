import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ConsultationKind, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { assertOfficeManager } from '../auth/office-manager';
import { monthRange } from '../common/date.util';
import { brokerageProfit } from '../settlements/settlement.calc';
import { DEFAULT_RULES, computeIncentive, type IncentiveRules } from './incentive.rules';
import { formatDateOnly, toDateOnly } from '../common/date.util';

const MONTH = /^\d{4}-\d{2}$/;

/*
  인센티브 표를 보는 사람.

  자리로는 대표·사무장·본부장이고, 거기에 이름으로 몇을 더 연다 — 알선 실적을 같이
  챙기는 자리인데 직급이 그 셋에 안 드는 사람이 있다.

  회사 순수익은 여기 들지 않는다. 그건 관리자(ADMIN)에게만 간다.
*/
const INCENTIVE_VIEWERS = ['김진후'];

function assertIncentiveViewer(user: AuthUser): void {
  if (INCENTIVE_VIEWERS.includes(user.name.trim())) return;
  assertOfficeManager(user);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 관리자가 창에서 보내 오는 규칙 한 벌 */
interface SaveRuleDto {
  effectiveFrom: string;
  baseSalaryDefault?: number;
  floor?: number;
  tiers?: { tier?: string; from?: number; rate?: number }[];
  tenure?: number[];
  leader?: { baseSalary?: number; defaultRate?: number; targetRate?: number; minPersonalSales?: number };
}

/**
 * 알선 딜러 인센티브.
 *
 * 달마다 사람마다 한 줄이다. 월 알선 총액은 그 달 알선 정산의 '정산받을금액'을 더해
 * 채워 두고, 정산에 안 올라온 건이 있어 손으로 고칠 수 있게 둔다.
 *
 * 계산은 서버에서만 한다. 화면에서도 같은 식을 쓰면 요율표를 고쳤을 때 둘이 어긋나고,
 * 어긋난 쪽이 급여라 사람이 먼저 안다.
 */
@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param withProfit 회사에 얼마가 남는지까지 보여줄지.
   *
   * 딜러가 얼마를 받는지는 정산을 돌리는 사람이 봐야 하지만, 회사에 얼마가 남는지는
   * 경영 숫자다. 화면에서 열만 감추면 주소로 그대로 받아 볼 수 있으니 값 자체를 안 담는다.
   */
  /**
   * 그 달에 살아 있던 규칙.
   *
   * 적용 시작일이 그 달 안에 들어오는 것까지 본다. 한 줄만 두고 고치면 지난 달 급여가
   * 새 요율로 다시 계산되는데, 이미 나간 돈이 화면에서 달라지면 어느 쪽이 맞는지 따질
   * 근거가 사라진다.
   *
   * 아무것도 안 적어 뒀으면 코드에 있는 처음 값을 쓴다 — 표가 비어 보이면 안 된다.
   */
  async rulesAt(month: string): Promise<IncentiveRules & { effectiveFrom: string }> {
    const end = monthRange(month).lt;
    const row = await this.prisma.incentiveRule.findFirst({
      where: { effectiveFrom: { lt: end } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!row) return { ...DEFAULT_RULES, effectiveFrom: '2026-10-01' };
    return {
      baseSalaryDefault: row.baseSalaryDefault,
      floor: row.floor,
      tiers: (row.tiers as { tier: string; from: number; rate: number }[]) ?? DEFAULT_RULES.tiers,
      tenure: (row.tenure as number[]) ?? DEFAULT_RULES.tenure,
      leader: {
        baseSalary: row.leaderBaseSalary,
        defaultRate: row.leaderDefaultRate,
        targetRate: row.leaderTargetRate,
        minPersonalSales: row.leaderMinPersonalSales,
      },
      effectiveFrom: formatDateOnly(row.effectiveFrom),
    };
  }

  /** 적어 둔 규칙 전부 — 고치는 창이 쓴다. 늦은 것부터 */
  async rules() {
    const rows = await this.prisma.incentiveRule.findMany({ orderBy: { effectiveFrom: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      effectiveFrom: formatDateOnly(r.effectiveFrom),
      baseSalaryDefault: r.baseSalaryDefault,
      floor: r.floor,
      tiers: r.tiers as { tier: string; from: number; rate: number }[],
      tenure: r.tenure as number[],
      leader: {
        baseSalary: r.leaderBaseSalary,
        defaultRate: r.leaderDefaultRate,
        targetRate: r.leaderTargetRate,
        minPersonalSales: r.leaderMinPersonalSales,
      },
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * 규칙 한 벌을 적어 둔다 — 같은 시작일이면 덮어쓴다.
   *
   * 숫자는 여기서 한 번 더 다듬는다. 화면에서 막아도 주소로 그대로 보낼 수 있고,
   * 요율이 음수나 1을 넘으면 급여가 이상해진다.
   */
  async saveRule(dto: SaveRuleDto, by: string) {
    const tiers = (dto.tiers ?? [])
      .map((t) => ({
        tier: (t.tier ?? '').trim().slice(0, 20),
        from: Math.max(0, Math.round(t.from ?? 0)),
        rate: Math.min(Math.max(t.rate ?? 0, 0), 1),
      }))
      .filter((t) => !!t.tier)
      .sort((a, b) => a.from - b.from);
    if (tiers.length === 0) throw new BadRequestException('달성 구간을 한 줄 이상 적어 주세요.');

    const tenure = (dto.tenure ?? []).map((n) => Math.max(0, Math.round(n))).slice(0, 21);
    if (tenure.length === 0) throw new BadRequestException('근속 기본급을 한 줄 이상 적어 주세요.');

    const data = {
      baseSalaryDefault: Math.max(0, Math.round(dto.baseSalaryDefault ?? DEFAULT_RULES.baseSalaryDefault)),
      floor: Math.max(0, Math.round(dto.floor ?? DEFAULT_RULES.floor)),
      tiers,
      tenure,
      leaderBaseSalary: Math.max(0, Math.round(dto.leader?.baseSalary ?? DEFAULT_RULES.leader.baseSalary)),
      leaderDefaultRate: Math.min(Math.max(dto.leader?.defaultRate ?? DEFAULT_RULES.leader.defaultRate, 0), 1),
      leaderTargetRate: Math.min(Math.max(dto.leader?.targetRate ?? DEFAULT_RULES.leader.targetRate, 0), 1),
      leaderMinPersonalSales: Math.max(
        0,
        Math.round(dto.leader?.minPersonalSales ?? DEFAULT_RULES.leader.minPersonalSales),
      ),
      updatedBy: by.slice(0, 30),
    };
    const effectiveFrom = toDateOnly(dto.effectiveFrom);
    await this.prisma.incentiveRule.upsert({
      where: { effectiveFrom },
      create: { effectiveFrom, ...data },
      update: data,
    });
    return this.rules();
  }

  /** 잘못 적어 둔 줄을 내린다 — 마지막 한 줄은 안 지운다(표가 통째로 빈다) */
  async removeRule(id: string) {
    const left = await this.prisma.incentiveRule.count();
    if (left <= 1) throw new BadRequestException('규칙이 한 벌뿐입니다. 지우지 말고 고쳐 주세요.');
    await this.prisma.incentiveRule.deleteMany({ where: { id } });
    return this.rules();
  }

  async month(month: string, withProfit: boolean) {
    const range = monthRange(month);
    const rules = await this.rulesAt(month);

    /*
      알선팀은 누구인가.

      타이틀을 단 사람과, 그 달 알선 정산을 올린 사람을 합친다 — 타이틀을 아직 안 단
      사람도 그 달에 뛰었으면 정산을 받아야 한다.
    */
    const [titled, settlements] = await Promise.all([
      this.prisma.employee.findMany({
        where: { active: true, NOT: { referralTitle: '' } },
        select: { id: true, name: true, position: true, referralTitle: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.brokerageSettlement.findMany({
        where: { kind: ConsultationKind.BROKERAGE, date: range },
        select: {
          employeeId: true,
          vehicleNumber: true,
          cashCommission: true,
          installmentFee: true,
          insuranceFee: true,
          etcCost: true,
        },
      }),
    ]);

    /*
      그 달 사람마다 올린 수익금 합계 — 알선만 센다.

      수출은 안 센다. 이 표와는 별개로 가는 돈이라 섞으면 구간이 엉뚱하게 올라간다.

      정산받을금액이 아니라 수익금으로 센다 — 정산받을금액은 이 표가 주는 돈이라,
      그걸로 다시 구간을 고르면 준 돈으로 줄 돈을 정하는 셈이 된다.
      수익금 = 현금 수수료 + 할부 피 + 보험 피 + 차대금업(알선 정산과 같은 식이다).
    */
    const autoSales = new Map<string, number>();
    /*
      몇 대를 팔았나 — 금액 옆에 같이 둔다.

      같은 금액이어도 한 대로 번 것과 열 대로 번 것은 다른 달이다. 금액만 보면 그게
      안 보여서, 구간이 같은 두 사람을 견줄 수가 없었다.

      차량번호로 센다 — 한 차에 정산이 두 줄 올라간 건이 있어서 줄로 세면 부풀어 보인다.
    */
    const cars = new Map<string, Set<string>>();
    for (const s of settlements) {
      autoSales.set(s.employeeId, (autoSales.get(s.employeeId) ?? 0) + brokerageProfit(s));
      const plate = (s.vehicleNumber ?? '').replace(/\s+/g, '').trim();
      if (!plate) continue;
      const seen = cars.get(s.employeeId);
      if (seen) seen.add(plate);
      else cars.set(s.employeeId, new Set([plate]));
    }

    const extraIds = [...autoSales.keys()].filter((id) => !titled.some((t) => t.id === id));
    const extras =
      extraIds.length > 0
        ? await this.prisma.employee.findMany({
            where: { id: { in: extraIds } },
            select: { id: true, name: true, position: true, referralTitle: true },
          })
        : [];

    const people = [...titled, ...extras];
    const saved = await this.prisma.dealerIncentive.findMany({ where: { month } });

    /** 적어 둔 값이 있으면 그것, 없으면 정산에서 더한 값 */
    const salesOf = (id: string) => {
      const row = saved.find((r) => r.employeeId === id);
      return row && row.sales > 0 ? row.sales : (autoSales.get(id) ?? 0);
    };

    /*
      팀장이 받는 관리 수당의 바탕 — 팀원들의 알선 합계.

      팀장 본인 매출은 빼고 센다. 팀장이 여럿이면 서로의 매출은 팀원으로 치지 않는다.
    */
    const teamSales = people
      .filter((p) => p.referralTitle !== 'LEADER')
      .reduce((sum, p) => sum + salesOf(p.id), 0);

    const rows = people.map((p) => {
      const row = saved.find((r) => r.employeeId === p.id);
      const sales = salesOf(p.id);
      const result = computeIncentive({
        sales,
        years: row?.years ?? 0,
        baseSalary: row?.baseSalary ?? 0,
        title: p.referralTitle,
        targetAchieved: row?.targetAchieved ?? false,
        teamSales,
      }, rules);

      const { companyProfit, ...shown } = result;
      return {
        employeeId: p.id,
        name: p.name,
        position: p.position,
        title: p.referralTitle,
        sales,
        /** 정산에서 더한 값 — 손으로 고쳤을 때 원래 값이 무엇이었는지 보여준다 */
        autoSales: autoSales.get(p.id) ?? 0,
        /** 그 달 판매대수 — 알선 정산에 올라온 차 수(같은 차는 한 번만) */
        cars: cars.get(p.id)?.size ?? 0,
        edited: !!row && row.sales > 0,
        years: row?.years ?? 0,
        baseSalaryOverride: row?.baseSalary ?? 0,
        targetAchieved: row?.targetAchieved ?? false,
        memo: row?.memo ?? '',
        ...shown,
        ...(withProfit ? { companyProfit } : {}),
      };
    });

    // 많이 한 사람부터 — 정산표는 실적 순으로 본다
    rows.sort((a, b) => b.sales - a.sales);

    return {
      month,
      teamSales,
      /** 회사에 남는 돈을 담아 보냈는가 — 화면이 열을 띄울지 이걸로 가른다 */
      withProfit,
      rows,
      totals: {
        sales: rows.reduce((s, r) => s + r.sales, 0),
        cars: rows.reduce((s, r) => s + r.cars, 0),
        payout: rows.reduce((s, r) => s + r.payout, 0),
        ...(withProfit
          ? { companyProfit: rows.reduce((s, r) => s + (r.companyProfit ?? 0), 0) }
          : {}),
      },
      rules,
    };
  }

  /** 한 사람 줄을 적어 둔다 — 안 적은 칸은 그대로 둔다 */
  async save(
    month: string,
    withProfit: boolean,
    dto: {
      employeeId: string;
      sales?: number;
      years?: number;
      baseSalary?: number;
      targetAchieved?: boolean;
      memo?: string;
    },
  ) {
    const data = {
      ...(dto.sales !== undefined ? { sales: Math.max(0, Math.round(dto.sales)) } : {}),
      ...(dto.years !== undefined ? { years: Math.min(Math.max(0, Math.trunc(dto.years)), 50) } : {}),
      ...(dto.baseSalary !== undefined ? { baseSalary: Math.max(0, Math.round(dto.baseSalary)) } : {}),
      ...(dto.targetAchieved !== undefined ? { targetAchieved: dto.targetAchieved } : {}),
      ...(dto.memo !== undefined ? { memo: dto.memo.slice(0, 255) } : {}),
    };

    await this.prisma.dealerIncentive.upsert({
      where: { month_employeeId: { month, employeeId: dto.employeeId } },
      update: data,
      create: { month, employeeId: dto.employeeId, ...data },
    });
    return this.month(month, withProfit);
  }
}

@Controller('referral')
export class ReferralController {
  constructor(private readonly referral: ReferralService) {}

  /**
   * 그 달 인센티브 정산.
   *
   * 남의 실수령액이 다 보이는 자리라 돈 장부와 같은 자리까지만 연다 —
   * 대표·사무장·본부장, 테스트 계정, 그리고 이름으로 따로 연 사람(INCENTIVE_VIEWERS).
   */
  @Get('incentive')
  month(@CurrentUser() user: AuthUser, @Query('month') month = '') {
    assertIncentiveViewer(user);
    if (!MONTH.test(month.trim())) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    return this.referral.month(month.trim(), user.role === Role.ADMIN);
  }

  @Post('incentive')
  save(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      month?: string;
      employeeId?: string;
      sales?: number;
      years?: number;
      baseSalary?: number;
      targetAchieved?: boolean;
      memo?: string;
    },
  ) {
    assertIncentiveViewer(user);
    const month = (dto.month ?? '').trim();
    if (!MONTH.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    if (!dto.employeeId) throw new BadRequestException('누구 줄인지 없습니다.');
    return this.referral.save(month, user.role === Role.ADMIN, { ...dto, employeeId: dto.employeeId });
  }

  /**
   * 요율표 — 적어 둔 것 전부.
   *
   * 보는 자리는 인센티브 표와 같다. 남의 실수령액을 보는 사람이면 그 숫자가 어디서
   * 나왔는지도 봐야 한다.
   */
  @Get('incentive-rules')
  rules(@CurrentUser() user: AuthUser) {
    assertIncentiveViewer(user);
    return this.referral.rules();
  }

  /**
   * 요율표를 고친다 — 관리자만.
   *
   * 급여가 걸린 표라 보는 자리보다 좁힌다. 사무장·본부장은 정산을 돌리는 사람이지
   * 요율을 정하는 사람이 아니다.
   */
  @Post('incentive-rules')
  saveRule(@CurrentUser() user: AuthUser, @Body() dto: SaveRuleDto) {
    assertOfficeManager(user);
    if (user.role !== Role.ADMIN) throw new BadRequestException('요율표는 관리자만 고칠 수 있습니다.');
    if (!DATE.test((dto.effectiveFrom ?? '').trim())) {
      throw new BadRequestException('적용 시작일은 YYYY-MM-DD 형식이어야 합니다.');
    }
    return this.referral.saveRule({ ...dto, effectiveFrom: dto.effectiveFrom.trim() }, user.name);
  }

  @Delete('incentive-rules/:id')
  removeRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertOfficeManager(user);
    if (user.role !== Role.ADMIN) throw new BadRequestException('요율표는 관리자만 고칠 수 있습니다.');
    return this.referral.removeRule(id);
  }
}

@Module({ controllers: [ReferralController], providers: [ReferralService] })
export class ReferralModule {}
