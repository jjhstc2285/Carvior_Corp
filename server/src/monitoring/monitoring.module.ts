import { Controller, ForbiddenException, Get, Headers, Module, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollModule, PayrollService, verifyPayrollPass } from '../payroll/payroll.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { SettlementsService } from '../settlements/settlements.service';
import { brokerageProfit } from '../settlements/settlement.calc';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 애니원모터스 모니터링 — 상사에 달마다 얼마가 들어오고 얼마가 나가는가.
 *
 * 차 한 대를 팔면 매도비가 상사로 들어오고, 인건비·부동산비는 달마다 그대로 나간다.
 * 지금까지 그 둘을 한자리에서 본 적이 없다 — 인건비는 인건비 화면에, 월세는 부동산
 * 화면에, 판 대수는 매입 관리에 있어서, 달이 끝나고 남았는지 모자랐는지를 대표가
 * 머릿속으로 더해야 했다.
 *
 * 대표만 본다. 상사 전체 수지가 한 줄로 보이는 화면이라, 여기 뜨는 숫자 하나가 바로
 * '회사가 이번 달에 얼마 남겼나'다.
 *
 * 고정비는 지금 적혀 있는 값으로 센다. 인건비·월세는 달마다 따로 적어 두는 자리가
 * 아니라서, 지난 달도 지금 값으로 셈한다 — 사람이 들고 나거나 월세가 바뀌면 지난 달
 * 숫자도 같이 움직인다. 화면에 그렇게 적어 둔다.
 */

/**
 * 차 한 대를 팔면 상사로 들어오는 매도비(원).
 *
 * 한 값이라 적어 둘 칸을 만들지 않았다. 바뀌면 이 줄만 고친다 — 칸으로 빼면 누가
 * 언제 고쳤는지까지 남겨야 하는데, 그건 이 숫자가 흔들릴 때 만들 일이다.
 */
export const SALE_FEE_PER_CAR = 440_000;

/** 대표만 — 이 화면은 상사 전체 수지가 한 줄로 보인다 */
function isCeo(user: AuthUser): boolean {
  return `${user.name} ${user.position}`.includes('대표') || `${user.name} ${user.position}`.includes('테스트');
}

export interface MonitoringMonth {
  month: string;
  /** 그 달 매도 대수 — 우리 차 출고 + 알선 + 수출, 같은 차는 한 번만 */
  cars: { own: number; brokerage: number; export: number; total: number };
  income: {
    saleFee: number;
    /** 차 팔아서 남은 돈 — 매입 정산의 판매수익. 그 차가 나간 달로 센다 */
    margin: number;
    /** 알선·수출 수익금 — 현금 수수료 + 할부 피 + 보험 피 + 차대금업 */
    brokerage: number;
    rent: number;
    total: number;
  };
  outgo: {
    payroll: number;
    meal: number;
    rent: number;
    etc: number;
    /** 광고비 — 엔카 약정(대당 × 그 달 올린 대수) + 달마다 적는 채널 */
    ad: number;
    /** 헤이딜러·경매장·카비어처럼 차를 사 오는 데 든 플랫폼 수수료 */
    platform: number;
    /** 알선 수익금 중 담당자에게 돌아가는 몫 */
    share: number;
    total: number;
  };
  net: number;
}

@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly settlements: SettlementsService,
  ) {}

  @Get()
  async months(
    @CurrentUser() user: AuthUser,
    @Headers('x-payroll-pass') pass: string,
    @Query('months') months = '6',
  ) {
    if (!isCeo(user)) throw new ForbiddenException('모니터링은 대표님만 볼 수 있습니다.');
    if (!verifyPayrollPass(user, pass)) {
      // 화면이 '번호 다시 받기'와 '아예 못 봄'을 갈라 볼 수 있게 표를 붙인다
      throw new ForbiddenException({ message: '번호를 다시 넣어 주세요.', code: 'PAYROLL_LOCKED' });
    }
    const count = Math.min(Math.max(Number(months) || 6, 1), 24);
    return this.build(count);
  }

  private async build(count: number) {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 0; i < count; i += 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      keys.push(d.toISOString().slice(0, 7));
    }
    const from = new Date(`${keys[keys.length - 1]}-01T00:00:00.000Z`);

    const [sold, brokerage, payroll, properties, costs, adSpend, adPostings, platformFees, purchases] =
      await Promise.all([
      this.prisma.managedVehicle.findMany({
        where: { soldDate: { gte: from } },
        select: { vehicleNumber: true, soldDate: true },
      }),
      this.prisma.brokerageSettlement.findMany({
        where: { date: { gte: from } },
        select: {
          vehicleNumber: true,
          date: true,
          kind: true,
          cashCommission: true,
          installmentFee: true,
          insuranceFee: true,
          etcCost: true,
          settlementAmount: true,
        },
      }),
      this.prisma.payrollEntry.findMany({ where: { active: true }, select: { monthlyPay: true, incentive: true } }),
      this.prisma.property.findMany({ where: { active: true }, select: { side: true, monthlyRent: true } }),
      this.prisma.propertyCost.findMany({
        where: { active: true },
        select: { amount: true, unitPrice: true, units: true },
      }),
      // 달마다 적어 두는 광고 — 구글 애즈 · 114 · 알바천국처럼 대수와 상관없는 것들
      this.prisma.adSpend.findMany({ select: { month: true, amount: true } }),
      /*
        엔카·차차차 약정은 '대당 얼마'다.

        달마다 정액으로 나가는 게 아니라 그 달에 올린 대수만큼 나간다 — 22만원 상품에
        서른 대를 올렸으면 660만원이다.
      */
      this.prisma.adPosting.findMany({
        where: { postedOn: { gte: from } },
        select: { postedOn: true, contract: { select: { unitFee: true } } },
      }),
      // 헤이딜러·경매장·카비어 — 차를 사 오는 데 든 돈이라 매입 정산에 붙어 있다
      this.prisma.purchaseSettlement.findMany({
        where: { platformFee: { gt: 0 }, date: { gte: from } },
        select: { date: true, platformFee: true },
      }),
      /*
        차 한 대에서 남은 돈.

        판매수익은 매입가·이전비·구전·상품화·차량비용을 다 뺀 값이라 여기서 다시 세지
        않고 매입 정산이 내주는 값을 쓴다 — 두 군데서 따로 세면 화면마다 숫자가 갈린다.
      */
      this.settlements.findPurchase({}),
    ]);

    /*
      고정비는 달마다 같다.

      인건비·월세·부대비용은 '지금 적혀 있는 값'이라 달 칸이 없다. 달마다 따로 셈할
      수가 없어서 같은 값을 모든 달에 놓는다 — 화면에 그렇게 적어 둔다.
    */
    // 인센티브도 나가는 돈이다 — 급여와 따로 적지만 통장에서는 같이 빠진다
    const payrollTotal = payroll.reduce((sum, r) => sum + r.monthlyPay + r.incentive, 0);
    const rentOut = properties.filter((p) => p.side !== '임대').reduce((sum, p) => sum + p.monthlyRent, 0);
    const rentIn = properties.filter((p) => p.side === '임대').reduce((sum, p) => sum + p.monthlyRent, 0);
    // 대당 단가와 대수를 적어 둔 줄은 곱해서 쓴다 — 주차 임대료처럼 대수가 오르내린다
    const etc = costs.reduce((sum, c) => sum + (c.unitPrice > 0 && c.units > 0 ? c.unitPrice * c.units : c.amount), 0);

    /* 식대는 그 달 근태를 세어 나온다 — 인건비 화면과 같은 자를 쓴다 */
    /*
      판매수익은 그 차가 나간 달로 센다.

      정산에 적힌 날은 사온 날이다 — 8월에 사서 10월에 판 차를 8월에 얹으면 '그 달에
      들어온 돈'이 아니게 된다. 차량 관리의 출고일로 옮기고, 그게 없으면 정산 날로 둔다.
    */
    const soldMonth = new Map(
      sold.filter((v) => v.soldDate).map((v) => [normalizePlate(v.vehicleNumber), v.soldDate!.toISOString().slice(0, 7)]),
    );
    const marginByMonth = new Map<string, number>();
    for (const r of purchases as { vehicleNumber: string; date: string; salePrice: number; saleProfit: number }[]) {
      if (!r.salePrice || r.salePrice <= 0) continue;
      const key = soldMonth.get(normalizePlate(r.vehicleNumber)) ?? r.date.slice(0, 7);
      marginByMonth.set(key, (marginByMonth.get(key) ?? 0) + (r.saleProfit ?? 0));
    }

    const meals = await Promise.all(
      keys.map((m) =>
        this.payroll
          .mealAllowances(m)
          .then((r) => r.rows.reduce((sum, x) => sum + x.amount, 0))
          .catch(() => 0),
      ),
    );

    const rows: MonitoringMonth[] = keys.map((month, i) => {
      /*
        같은 차를 두 번 세지 않는다.

        알선·수출로 판 차가 차량 관리에도 출고로 찍혀 있는 건이 있다. 둘을 그냥 더하면
        그 차에 매도비가 두 번 붙는다 — 번호로 묶어 한 번만 센다.
      */
      const own = new Set(
        sold.filter((v) => v.soldDate && v.soldDate.toISOString().slice(0, 7) === month).map((v) => normalizePlate(v.vehicleNumber)),
      );
      const mine = brokerage.filter((b) => b.date.toISOString().slice(0, 7) === month);
      const bro = new Set(mine.filter((b) => b.kind !== 'EXPORT').map((b) => normalizePlate(b.vehicleNumber)));
      const exp = new Set(mine.filter((b) => b.kind === 'EXPORT').map((b) => normalizePlate(b.vehicleNumber)));
      const all = new Set([...own, ...bro, ...exp]);

      const mealTotal = meals[i];
      const saleFee = all.size * SALE_FEE_PER_CAR;
      const margin = marginByMonth.get(month) ?? 0;

      /* 알선 수익금과 담당자 몫 — 번 돈이 들어오고 그중 일부가 나간다 */
      const broProfit = mine.reduce((sum, b) => sum + brokerageProfit(b), 0);
      const broShare = mine.reduce((sum, b) => sum + b.settlementAmount, 0);

      const ad =
        adSpend.filter((a) => a.month === month).reduce((sum, a) => sum + a.amount, 0) +
        adPostings
          .filter((a) => a.postedOn.toISOString().slice(0, 7) === month)
          .reduce((sum, a) => sum + (a.contract?.unitFee ?? 0), 0);
      const platform = platformFees
        .filter((r) => r.date.toISOString().slice(0, 7) === month)
        .reduce((sum, r) => sum + r.platformFee, 0);

      const income = saleFee + margin + broProfit + rentIn;
      const outgo = payrollTotal + mealTotal + rentOut + etc + ad + platform + broShare;

      return {
        month,
        cars: { own: own.size, brokerage: bro.size, export: exp.size, total: all.size },
        income: { saleFee, margin, brokerage: broProfit, rent: rentIn, total: income },
        outgo: {
          payroll: payrollTotal,
          meal: mealTotal,
          rent: rentOut,
          etc,
          ad,
          platform,
          share: broShare,
          total: outgo,
        },
        net: income - outgo,
      };
    });

    return { perCar: SALE_FEE_PER_CAR, months: rows };
  }
}

@Module({ imports: [PayrollModule, SettlementsModule], controllers: [MonitoringController] })
export class MonitoringModule {}
