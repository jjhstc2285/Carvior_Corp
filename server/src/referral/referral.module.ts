import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ConsultationKind, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { assertOfficeManager } from '../auth/office-manager';
import { monthRange } from '../common/date.util';
import { brokerageProfit } from '../settlements/settlement.calc';
import {
  BASE_SALARY_DEFAULT,
  INCENTIVE_EFFECTIVE_FROM,
  INCENTIVE_TIERS,
  TEAM_LEADER,
  TENURE_BASE_SALARY,
  computeIncentive,
} from './incentive.rules';

const MONTH = /^\d{4}-\d{2}$/;

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
  async month(month: string, withProfit: boolean) {
    const range = monthRange(month);

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
    for (const s of settlements) {
      autoSales.set(s.employeeId, (autoSales.get(s.employeeId) ?? 0) + brokerageProfit(s));
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
      });

      const { companyProfit, ...shown } = result;
      return {
        employeeId: p.id,
        name: p.name,
        position: p.position,
        title: p.referralTitle,
        sales,
        /** 정산에서 더한 값 — 손으로 고쳤을 때 원래 값이 무엇이었는지 보여준다 */
        autoSales: autoSales.get(p.id) ?? 0,
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
        payout: rows.reduce((s, r) => s + r.payout, 0),
        ...(withProfit
          ? { companyProfit: rows.reduce((s, r) => s + (r.companyProfit ?? 0), 0) }
          : {}),
      },
      rules: {
        effectiveFrom: INCENTIVE_EFFECTIVE_FROM,
        baseSalaryDefault: BASE_SALARY_DEFAULT,
        tiers: INCENTIVE_TIERS,
        tenure: TENURE_BASE_SALARY,
        leader: TEAM_LEADER,
      },
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
   * 대표·사무장·본부장, 그리고 테스트 계정.
   */
  @Get('incentive')
  month(@CurrentUser() user: AuthUser, @Query('month') month = '') {
    assertOfficeManager(user);
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
    assertOfficeManager(user);
    const month = (dto.month ?? '').trim();
    if (!MONTH.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    if (!dto.employeeId) throw new BadRequestException('누구 줄인지 없습니다.');
    return this.referral.save(month, user.role === Role.ADMIN, { ...dto, employeeId: dto.employeeId });
  }
}

@Module({ controllers: [ReferralController], providers: [ReferralService] })
export class ReferralModule {}
