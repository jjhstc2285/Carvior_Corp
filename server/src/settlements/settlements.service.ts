import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsultationKind, NotificationType, Prisma, SettlementStatus, VehicleExpenseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, formatDateOnlyOrNull, monthRange, toDateOnly, todayKst } from '../common/date.util';
import {
  EMPTY_VEHICLE_COST,
  brokerageProfit,
  brokerageSettlementAmount,
  netProfit,
  prepBreakdown,
  profitShareAmount,
  purchaseGrandTotal,
  purchaseGrandTotalWon,
  carviorFeeOf,
  carviorOn,
  transferFeeOf,
  saleProfit,
  type SaleFields,
  purchasePrepTotal,
  type PrepCostKind,
  type VehicleCostSummary,
} from './settlement.calc';
import { normalizePlate } from '../vehicles/vehicle.rules';
import {
  approvalRoleOf,
  canConfirmCash,
  canEditLocked,
  CEO_APPROVER,
  CHIEF_APPROVER,
  isLocked,
  needsChief,
  stageOf,
} from './approvers';
import type { AuthUser } from '../auth/current-user.decorator';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
import { SalePriceService } from '../sale-price/sale-price.service';
import type {
  CreateBrokerageDto,
  PrepCostInput,
  CreatePurchaseDto,
  CreateSettlementDto,
  UpdateBrokerageDto,
  UpdatePurchaseDto,
  UpdateSettlementDto,
} from './dto/settlement.dto';

interface ListParams {
  q?: string;
  status?: SettlementStatus;
  employeeId?: string;
  month?: string;
}

interface BrokerageListParams extends ListParams {
  /*
    남의 '작성 중'은 가린다 — 여기 적힌 사람 것만 빼고.

    아직 안 올린 줄은 적다 만 숫자다. 그게 윗사람 화면에 같이 뜨면 "이건 뭐냐"를
    물어보게 되고, 적던 사람은 다 적기 전에 설명부터 해야 한다 — 확인할 거리만 는다.

    비워 두면 다 보인다(개발 계정).
  */
  mineOnlyDraft?: string;
}

/** 매입 관리에서 붙여 오는 것 — 들어온 날, 검차 리포트, 실차 확인자 */
interface IntakeFacts {
  day: string | null;
  hasReport: boolean;
  inspector: string;
}

const EMPLOYEE_SELECT = { employee: { select: { id: true, name: true, position: true } } };

/** 승인 차례를 가리려면 담당자 이름이 있어야 한다 — 이름에 따라 본부장을 건너뛴다. */
const OWNER_NAME = { employee: { select: { name: true } } } as const;

/** 상품화 비용 명세는 화면에 적은 순서대로 보여준다. */
const PREP_COST_INCLUDE = { prepCosts: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.PurchaseSettlementInclude;

/** 조회 결과에서 파생값 계산에 필요한 최소 모양 */
interface PurchaseRow extends SaleFields {
  date: Date;
  employee?: { name: string } | null;
  transferFee: number;
  submittedAt: Date | null;
  chiefApprovedAt: Date | null;
  ceoApprovedAt: Date | null;
  purchasePrice: number;
  salePrice: number;
  /** 플랫폼 수수료 — 헤이딜러·엔카 경매장에서 사오면 내는 돈 */
  platformFee: number;
  /** 매도정산 배분 — NEW(신차 30%) / PERSON(개인 50%) / 빈 글자(안 정함) */
  profitShare: string;
  /** 매도정산을 이미 받았는가 */
  profitSharePaid: boolean;
  /** 상사 정산서의 실제지급액 — 0이면 안 적은 것이다 */
  payoutAmount: number;
  /** 견적 본 사람 — 비어 있으면 매입 관리의 실차 확인자를 대신 쓴다 */
  appraiser: string;
  /** 카비어 수수료를 무는가 — null 이면 검차 리포트가 있는 건만 문다 */
  carvior: boolean | null;
  prepCosts: { kind: PrepCostKind; amount: number }[];
}

/**
 * 화면에서 온 명세를 저장할 모양으로 다듬는다.
 *
 * 0원짜리는 버린다 — 항목을 눌러만 보고 안 적은 줄이 그대로 넘어오기 때문이다.
 * 순서는 배열 순서를 그대로 쓴다(화면에서 끌어 옮긴 순서가 곧 보고 싶은 순서다).
 */
function normalizePrepCosts(costs: PrepCostInput[] | undefined) {
  return (costs ?? [])
    .filter((c) => (c.amount ?? 0) > 0)
    .map((c, sortOrder) => ({
      kind: c.kind,
      vendor: (c.vendor ?? '').trim(),
      amount: c.amount ?? 0,
      memo: (c.memo ?? '').trim(),
      sortOrder,
    }));
}

/**
 * 차량비용 종류를 요약의 어느 칸에 더할지.
 *
 * Record로 못박아서 종류가 늘면 여기서 컴파일 에러가 나게 한다 —
 * 예전에는 "나머지는 주차"로 처리해서, 수리비를 추가하면 조용히 주차비에 섞였다.
 */
const COST_FIELD: Record<VehicleExpenseKind, 'fuel' | 'battery' | 'parking' | 'wash' | 'repair' | 'etc'> = {
  [VehicleExpenseKind.FUEL]: 'fuel',
  [VehicleExpenseKind.BATTERY]: 'battery',
  [VehicleExpenseKind.PARKING]: 'parking',
  // 외부 주차장 세차. 주차비에 섞지 않는다 — 자리값과 닦는 값은 따로 흥정하는 돈이다
  [VehicleExpenseKind.WASH]: 'wash',
  [VehicleExpenseKind.REPAIR]: 'repair',
  [VehicleExpenseKind.ETC]: 'etc',
};

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
    // 판매가는 네 곳에 같이 들어간다 — 퍼뜨리는 일은 sale-price 한 곳에서 한다
    private readonly salePrice: SalePriceService,
  ) {}

  /** 목록 공통 필터 — 날짜 범위 + 상태 + 담당자 */
  private baseWhere(params: ListParams) {
    return {
      ...(params.status ? { status: params.status } : {}),
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      ...(params.month ? { date: monthRange(params.month) } : {}),
    };
  }

  // ── 간편 정산 ──────────────────────────────

  async findBasic(params: ListParams) {
    const where: Prisma.SettlementWhereInput = {
      ...this.baseWhere(params),
      ...(params.q ? { vehicleInfo: { contains: params.q } } : {}),
    };
    const rows = await this.prisma.settlement.findMany({
      where,
      include: EMPLOYEE_SELECT,
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => ({ ...r, date: formatDateOnly(r.date), netProfit: netProfit(r) }));
  }

  async createBasic(dto: CreateSettlementDto) {
    const row = await this.prisma.settlement.create({
      data: {
        employeeId: dto.employeeId,
        vehicleInfo: dto.vehicleInfo,
        purchaseCost: dto.purchaseCost ?? 0,
        prepCost: dto.prepCost ?? 0,
        saleAmount: dto.saleAmount ?? 0,
        feeAmount: dto.feeAmount ?? 0,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        date: toDateOnly(dto.date),
        memo: dto.memo ?? '',
      },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), netProfit: netProfit(row) };
  }

  async updateBasic(id: string, dto: UpdateSettlementDto) {
    await this.assert('settlement', id);
    const row = await this.prisma.settlement.update({
      where: { id },
      data: { ...this.stripDate(dto), ...(dto.date ? { date: toDateOnly(dto.date) } : {}) },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), netProfit: netProfit(row) };
  }


  /**
   * 판금집 청구서를 매입 정산에 꽂는다.
   *
   * 대산에서 달마다 엑셀로 청구서를 보낸다 — 날짜·차명·차량번호·판수·작업내용·금액이
   * 한 줄씩 서른 줄쯤 온다. 지금은 그걸 보면서 정산을 한 건씩 열어 판금 금액을 옮겨
   * 친다. 서른 번을 옮기면 몇 건은 빠지고, 빠진 건 원가가 낮게 잡힌 채로 결재까지 간다.
   *
   * 차량번호로 맞춰 붙인다. 못 찾은 줄은 붙이지 않고 그대로 돌려준다 — 비슷한 차에
   * 억지로 붙이면 남의 차 원가에 남의 판금비가 얹힌다.
   *
   * 이미 결재가 올라간 건은 건드리지 않는다. 승인한 뒤에 금액이 바뀌면 무엇을 보고
   * 찍었는지가 남지 않는다.
   */
  async applyPanelInvoice(
    vendor: string,
    rows: { vehicleNumber: string; vehicleName?: string; panelCount?: number; work?: string; amount: number }[],
    /** 어느 칸에 꽂을지 — 광택 청구서를 넣었는데 판금 칸에 들어가면 안 된다 */
    kind: PrepCostKind = 'DENT',
  ) {
    const wanted = rows.filter((r) => r.amount > 0 && (r.vehicleNumber ?? '').trim());
    if (wanted.length === 0) return { applied: [], skipped: [], locked: [] };

    // 전체 번호로 먼저, 안 되면 뒤 네 자리로 — 뒤 네 자리가 둘 이상 걸리면 붙이지 않는다
    const settlements = await this.prisma.purchaseSettlement.findMany({
      // 잠김 여부는 저장된 값이 아니라 결재 시각으로 낸다 — 고치는 규칙을 한 곳에만 둔다
      select: {
        id: true,
        vehicleNumber: true,
        vehicleName: true,
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        ...OWNER_NAME,
      },
    });
    const byPlate = new Map(settlements.map((s) => [normalizePlate(s.vehicleNumber), s]));
    const byTail = new Map<string, typeof settlements>();
    for (const s of settlements) {
      const tail = normalizePlate(s.vehicleNumber).slice(-4);
      if (tail.length === 4) byTail.set(tail, [...(byTail.get(tail) ?? []), s]);
    }

    const applied: { vehicleNumber: string; vehicleName: string; amount: number }[] = [];
    const skipped: { vehicleNumber: string; reason: string }[] = [];
    const locked: { vehicleNumber: string }[] = [];

    for (const row of wanted) {
      const plate = normalizePlate(row.vehicleNumber);
      const exact = byPlate.get(plate);
      const tailHits = byTail.get(plate.slice(-4)) ?? [];
      const found = exact ?? (tailHits.length === 1 ? tailHits[0] : null);

      if (!found) {
        skipped.push({
          vehicleNumber: row.vehicleNumber,
          reason: tailHits.length > 1 ? '뒤 4자리가 같은 차가 여럿입니다' : '매입 정산에 없는 차입니다',
        });
        continue;
      }
      if (isLocked(stageOf(found, needsChief(found.employee?.name)))) {
        locked.push({ vehicleNumber: found.vehicleNumber });
        continue;
      }

      /*
        같은 업체의 판금 줄이 이미 있으면 갈아끼운다.

        청구서를 다시 받아 두 번 넣는 일이 있다(수정 청구서가 온다). 더하면 두 배가
        되고, 두 배가 된 건 결재까지 가서야 눈에 띈다.
      */
      const memo = [row.work, row.panelCount ? `판 ${row.panelCount}` : ''].filter(Boolean).join(' · ').slice(0, 191);
      const mine = await this.prisma.purchasePrepCost.findFirst({
        where: { settlementId: found.id, kind, vendor },
      });

      if (mine) {
        await this.prisma.purchasePrepCost.update({
          where: { id: mine.id },
          data: { amount: row.amount, memo },
        });
      } else {
        const last = await this.prisma.purchasePrepCost.findFirst({
          where: { settlementId: found.id },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        await this.prisma.purchasePrepCost.create({
          data: {
            settlementId: found.id,
            kind,
            vendor,
            amount: row.amount,
            memo,
            sortOrder: (last?.sortOrder ?? -1) + 1,
          },
        });
      }
      applied.push({ vehicleNumber: found.vehicleNumber, vehicleName: found.vehicleName, amount: row.amount });
    }

    return { applied, skipped, locked };
  }


  /**
   * 올린 청구서 원본을 적어 둔다.
   *
   * 엑셀로 오는 달도 있고 카톡 사진으로 오는 달도 있다. 넣고 나면 파일은 각자 컴퓨터에만
   * 남아서, 나중에 "그 달 청구서 원본 어디 있냐"는 말이 나오면 찾을 데가 없다.
   */
  async savePanelInvoiceFiles(
    month: string,
    vendor: string,
    writer: string,
    files: { url: string; name: string; mime: string; size: number }[],
  ) {
    if (files.length === 0) return [];
    await this.prisma.panelInvoiceFile.createMany({
      data: files.map((f) => ({
        month,
        vendor,
        writer,
        url: f.url,
        name: f.name.slice(0, 120),
        mime: f.mime.slice(0, 80),
        size: f.size,
      })),
    });
    return this.panelInvoiceFiles(month);
  }

  /** 그 달에 올려 둔 청구서 원본 — 최근 것부터 */
  async panelInvoiceFiles(month: string) {
    return this.prisma.panelInvoiceFile.findMany({
      where: { month },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 잘못 올린 파일을 내린다.
   *
   * 디스크의 파일까지 지우지는 않는다 — 지우다 실패하면 목록에는 없는데 주소로는 열리는
   * 상태가 된다. 목록에서 내리는 것으로 충분하다.
   */
  async removePanelInvoiceFile(id: string) {
    await this.prisma.panelInvoiceFile.deleteMany({ where: { id } });
  }

  /**
   * 청구서 총액을 적어 둔다.
   *
   * 줄 합계와 청구서 총액이 안 맞는 달이 있다. 맞추자고 차액을 남의 차에 얹으면 그 차
   * 원가와 순이익이 틀어진 채로 결재까지 간다 — 그래서 차에는 나눠 붙이지 않는다.
   * 받은 총액을 그대로 적어 두고, 판금·덴트 합계는 화면에서 이 값으로 덮어쓴다.
   *
   * 0을 적으면 지운다 — 잘못 적은 달을 되돌릴 방법이 있어야 한다.
   */
  async savePanelInvoiceTotal(
    month: string,
    vendor: string,
    amount: number,
    writer: string,
    kind = 'DENT',
    count = 0,
  ) {
    /*
      달·업체·항목으로 한 줄이다.

      업체만으로 찾으면 같은 집에 판금과 광택을 같이 맡겼을 때 뒤에 적은 것이 앞의 것을
      갈아끼운다 — 한 줄을 적을 때마다 앞 줄이 하나씩 사라진다. 지울 때도 같다:
      항목을 안 따지면 광택 총액을 비웠는데 그 집 판금 총액까지 날아간다.
    */
    const key = { month_vendor_kind: { month, vendor, kind } };

    if (amount <= 0) {
      await this.prisma.panelInvoiceTotal.deleteMany({ where: { month, vendor, kind } });
      return { month, vendor, kind, amount: 0, count: 0 };
    }

    return this.prisma.panelInvoiceTotal.upsert({
      where: key,
      update: { amount, writer, count },
      create: { month, vendor, amount, writer, kind, count },
    });
  }

  /** 그 달에 적어 둔 청구서 총액 — 업체마다 한 줄이다 */
  async panelInvoiceTotals(month: string) {
    return this.prisma.panelInvoiceTotal.findMany({
      where: { month },
      orderBy: { vendor: 'asc' },
      select: { month: true, vendor: true, kind: true, amount: true, count: true, writer: true, updatedAt: true },
    });
  }

  /**
   * 매입 정산에 붙는 식대 — 달마다 한 사람에 한 줄.
   *
   * 몇 줄 안 되는 표라 달로 안 끊고 다 내준다. 화면이 고른 달로 추려 쓴다 — 전체 기간을
   * 보는 화면이 있어서, 달로 끊어 주면 그 화면이 달마다 다시 물어봐야 한다.
   */
  async settlementMeals() {
    return this.prisma.settlementMeal.findMany({
      orderBy: [{ month: 'desc' }],
      select: { month: true, employeeId: true, amount: true, writer: true, updatedAt: true },
    });
  }

  /** 한 사람 한 달치를 적어 둔다 — 0을 적으면 0으로 남는다(지우는 것과 같다) */
  async saveSettlementMeal(month: string, employeeId: string, amount: number, writer: string) {
    const data = { amount: Math.max(0, Math.round(amount)), writer: writer.slice(0, 30) };
    await this.prisma.settlementMeal.upsert({
      where: { month_employeeId: { month, employeeId } },
      update: data,
      create: { month, employeeId, ...data },
    });
    return this.settlementMeals();
  }

  /**
   * 이미 적어둔 성능비 줄을 훑어 본다.
   *
   * 성능비는 부가세를 따로 붙여 청구해 오는데, 그동안 공급가만 적힌 건이 쌓였다.
   * 한꺼번에 곱해 버리면 이미 부가세가 붙은 건이 두 배가 되고, 그건 결재까지 가서야
   * 눈에 띈다 — 그래서 고치지 않고 보여주기만 한다. 무엇을 고칠지는 사람이 고른다.
   *
   * 결재가 끝난 건은 아예 내려주지 않는다. 골라 봐야 못 고친다.
   */
  async performanceCosts() {
    const costs = await this.prisma.purchasePrepCost.findMany({
      where: { kind: 'PERFORMANCE', amount: { gt: 0 } },
      include: {
        settlement: {
          select: {
            vehicleNumber: true,
            vehicleName: true,
            date: true,
            submittedAt: true,
            chiefApprovedAt: true,
            ceoApprovedAt: true,
            ...OWNER_NAME,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return costs
      .filter((c) => !isLocked(stageOf(c.settlement, needsChief(c.settlement.employee?.name))))
      .map((c) => ({
        id: c.id,
        vehicleNumber: c.settlement.vehicleNumber,
        vehicleName: c.settlement.vehicleName,
        date: formatDateOnly(c.settlement.date),
        vendor: c.vendor,
        memo: c.memo,
        amount: c.amount,
        // 부가세를 붙인 값 — 화면이 견줘 보여준다
        withVat: Math.round(c.amount * 1.1),
      }));
  }

  /**
   * 고른 성능비 줄에 부가세를 올린다.
   *
   * 무엇을 했는지 메모에 남긴다. 남기지 않으면 나중에 청구서와 견줄 때 이 건이 원래
   * 그 값이었는지 우리가 올린 값인지 알 수가 없다.
   */
  async applyPerformanceVat(ids: string[]) {
    if (ids.length === 0) return { updated: 0 };

    const costs = await this.prisma.purchasePrepCost.findMany({
      where: { id: { in: ids }, kind: 'PERFORMANCE' },
      select: { id: true, amount: true, memo: true },
    });

    let updated = 0;
    for (const c of costs) {
      await this.prisma.purchasePrepCost.update({
        where: { id: c.id },
        data: {
          amount: Math.round(c.amount * 1.1),
          memo: [c.memo, '부가세 반영'].filter(Boolean).join(' · ').slice(0, 191),
        },
      });
      updated += 1;
    }
    return { updated };
  }

  async removeBasic(id: string) {
    await this.assert('settlement', id);
    await this.prisma.settlement.delete({ where: { id } });
  }

  // ── 알선 정산 ──────────────────────────────

  /**
   * 알선 정산 한 줄을 화면이 쓰는 모양으로.
   *
   * 날짜 꼴·수익금·결재 단계를 한 곳에서 낸다 — 흩어 두면 화면마다 다르게 나온다.
   */
  private brokerageView<
    T extends {
      date: Date;
      cashConfirmedAt?: Date | null;
      submittedAt?: Date | null;
      chiefApprovedAt?: Date | null;
      ceoApprovedAt?: Date | null;
      employee?: { name: string } | null;
      cashCommission: number;
      installmentFee: number;
      insuranceFee: number;
      etcCost: number;
      realSalePrice: number;
    },
  >(
    row: T,
    /** 그 차를 얼마에 사 왔고 구전을 얼마 줬나 — 매입 관리에서 붙인다. 없으면 0 */
    intake?: { purchaseAmount: number; brokerFee: number },
  ) {
    const withChief = needsChief(row.employee?.name);
    const stage = stageOf(
      {
        submittedAt: row.submittedAt ?? null,
        chiefApprovedAt: row.chiefApprovedAt ?? null,
        ceoApprovedAt: row.ceoApprovedAt ?? null,
      },
      withChief,
    );
    return {
      ...row,
      date: formatDateOnly(row.date),
      cashConfirmedAt: row.cashConfirmedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      chiefApprovedAt: row.chiefApprovedAt?.toISOString() ?? null,
      ceoApprovedAt: row.ceoApprovedAt?.toISOString() ?? null,
      stage,
      locked: isLocked(stage),
      chiefRequired: withChief,
      profit: brokerageProfit(row),
      /**
       * 그 차를 얼마에 사 왔고, 구전을 얼마 줬나.
       *
       * 수출은 사 온 값을 같이 놓고 봐야 남는 게 보인다 — 수수료만 봐서는 그 차가
       * 얼마짜리였는지 알 수가 없다. 매입 관리가 원본이라 차량번호로 붙여만 온다.
       */
      purchaseAmount: intake?.purchaseAmount ?? 0,
      intakeBrokerFee: intake?.brokerFee ?? 0,
    };
  }

  /**
   * 차량번호로 매입 기록을 모아온다 — 얼마에 샀고 구전을 얼마 줬나.
   *
   * 차량번호는 손으로 적는 값이라 '124도 7252' 처럼 공백이 섞여 저장돼 있다. 공백을
   * 걷어낸 번호로 바로 물으면 저장된 글자와 달라 한 건도 안 걸린다 — 읽어와서 맞춘다.
   *
   * 같은 차를 두 번 사 오는 일이 있다. 그때는 최근 것이 맞다.
   */
  private async intakesByPlate(vehicleNumbers: string[]): Promise<Map<string, { purchaseAmount: number; brokerFee: number }>> {
    const want = new Set(vehicleNumbers.map(normalizePlate).filter(Boolean));
    const out = new Map<string, { purchaseAmount: number; brokerFee: number }>();
    if (want.size === 0) return out;

    try {
      const rows = await this.prisma.purchaseIntake.findMany({
        select: { vehicleNumber: true, purchaseAmount: true, brokerFee: true },
        // 오래된 것부터 넣어 최근 것이 덮어쓰게 한다
        orderBy: { date: 'asc' },
      });
      for (const r of rows) {
        const plate = normalizePlate(r.vehicleNumber);
        if (want.has(plate)) out.set(plate, { purchaseAmount: r.purchaseAmount, brokerFee: r.brokerFee });
      }
    } catch (e) {
      this.logger.warn(`매입금액을 붙이지 못했습니다: ${(e as Error).message}`);
    }
    return out;
  }

  async findBrokerage(params: BrokerageListParams) {
    const where: Prisma.BrokerageSettlementWhereInput = {
      ...this.baseWhere(params),
      ...(params.q
        ? { OR: [{ vehicleNumber: { contains: params.q } }, { vehicleName: { contains: params.q } }] }
        : {}),
      /*
        올리지 않은 줄은 적은 사람만 본다.

        '작성 중'은 결재를 올리기 전이다(submittedAt 이 비어 있다). 올린 뒤에는
        누구 차례든 다 보인다 — 봐야 결재를 한다.
      */
      ...(params.mineOnlyDraft
        ? { NOT: { AND: [{ submittedAt: null }, { employeeId: { not: params.mineOnlyDraft } }] } }
        : {}),
    };
    const rows = await this.prisma.brokerageSettlement.findMany({
      where,
      include: EMPLOYEE_SELECT,
      orderBy: { date: 'desc' },
    });
    const intakes = await this.intakesByPlate(rows.map((r) => r.vehicleNumber));
    return rows.map((r) => this.brokerageView(r, intakes.get(normalizePlate(r.vehicleNumber))));
  }

  async createBrokerage(dto: CreateBrokerageDto) {
    const nums = {
      totalSaleAmount: dto.totalSaleAmount ?? 0,
      ownerDeposit: dto.ownerDeposit ?? 0,
      transferFee: dto.transferFee ?? 0,
      transferFeeBalance: dto.transferFeeBalance ?? 0,
      cashCommission: dto.cashCommission ?? 0,
      installmentFee: dto.installmentFee ?? 0,
      insuranceFee: dto.insuranceFee ?? 0,
      etcCost: dto.etcCost ?? 0,
      realSalePrice: dto.realSalePrice ?? 0,
    };
    const row = await this.prisma.brokerageSettlement.create({
      data: {
        date: toDateOnly(dto.date),
        // 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다. 넣을 때 정리해 둔다 —
        // 찾을 때마다 맞추면 한 군데만 빠뜨려도 다른 화면과 어긋난다.
        vehicleNumber: normalizePlate(dto.vehicleNumber),
        vehicleName: dto.vehicleName,
        platform: (dto.platform ?? '').trim(),
        ...nums,
        // 비워서 보내면 판매 수익을 그대로 정산받을금액으로 잡는다(프론트 폼과 동일한 규칙).
        // 안 적어 보내면 구간 비율로 낸다. 적어 보내면 그 값이 우선이다 — 예외가 있다.
        settlementAmount: dto.settlementAmount ?? brokerageSettlementAmount(brokerageProfit(nums)),
        employeeId: dto.employeeId,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        memo: dto.memo ?? '',
        contractPhotos: dto.contractPhotos ?? '',
        kind: dto.kind ?? ConsultationKind.BROKERAGE,
      },
      include: EMPLOYEE_SELECT,
    });
    void (await this.syncFromBrokerage(row));
    return this.brokerageView(row);
  }

  async updateBrokerage(id: string, dto: UpdateBrokerageDto, user?: AuthUser) {
    await this.assertBrokerageEditable(id, user);
    const row = await this.prisma.brokerageSettlement.update({
      where: { id },
      data: {
        ...this.stripDate(dto),
        ...(dto.date ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: normalizePlate(dto.vehicleNumber) } : {}),
      },
      include: EMPLOYEE_SELECT,
    });
    void (await this.syncFromBrokerage(row));
    return this.brokerageView(row);
  }

  /**
   * 알선 정산에 적은 값을 매입 정산으로 옮긴다.
   *
   *   실차주입금  →  차량판매가
   *
   * 같은 차를 두 곳에 적게 하지 않는다 — 얼마에 팔았는지는 알선팀이 먼저 아는 값이고,
   * 계약팀이 그걸 옮겨 적으면 어느 쪽이 맞는지 알 수 없게 된다.
   *
   * 총 진행 판매금액이 아니라 실차주입금을 쓴다 — 실제로 들어온 돈이 그쪽이다.
   *
   * 이전비는 안 가져온다. 매입 정산의 이전비는 매입가로 정해지는 값이라(상사 이전비 +
   * 추가이전비) 알선 쪽 이전비로 덮으면 계산해 둔 값이 어긋난다.
   *
   * 둘 다 원 단위라 환산하지 않는다(알선 정산도 원으로 적는다).
   *
   * 승인이 찍힌 정산은 건드리지 않는다. 결재한 뒤에 금액이 저절로 바뀌면
   * 무엇을 보고 찍었는지가 남지 않는다.
   *
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로도 찾는다.
   * 같은 차를 두 번 사고팔았으면 최근 매입 건에 넣는다.
   */
  /**
   * 알선 정산에 적은 판매금액을 매입 정산의 차량판매가로 옮긴다.
   *
   * 실 차량판매가가 먼저다 — 차가 실제로 얼마에 나갔는지 적어 둔 값이다.
   *
   * 안 적혀 있으면 실차주입금을 쓴다. 다만 그건 세금을 떼고 들어온 돈이라 판매가보다
   * 적다 — 차대금업으로 따로 받은 몫이 있으면 같이 더한다.
   *
   * 그것도 없으면 총 진행 판매금액을 쓴다. 출고는 했는데 입금 확인을 아직 못 적은 건이
   * 많은데, 그때마다 차량판매가가 비어 매입 관리의 매도금액이 0으로 남았다. 나중에
   * 제대로 적으면 그 값으로 덮인다.
   */
  private async syncFromBrokerage(row: {
    vehicleNumber: string;
    ownerDeposit: number;
    etcCost: number;
    realSalePrice: number;
    totalSaleAmount: number;
    date: Date;
  }): Promise<'updated' | 'already' | 'noMatch'> {
    const amount = this.salePrice.brokerageAmount(row);
    if (amount <= 0) return 'already';
    /*
      제시 금융의 매도금액과 상담의 차량판매가에도 같이 넣는다 — 같은 값이다.
      매입 정산은 날짜까지 옮겨야 해서(판 달로 잡는다) 아래 applySalePrice 가 따로 한다.
    */
    void (await this.salePrice.spread(row.vehicleNumber, amount, 'brokerage'));
    return this.applySalePrice(row.vehicleNumber, amount, row.date, '알선');
  }

  /**
   * 그 차의 매입 정산에 차량판매가를 적는다.
   *
   * 승인이 찍힌 정산에도 차량판매가는 넣는다. 결재가 지키는 건 우리가 얼마를 들였느냐지
   * 얼마에 팔렸느냐가 아니다 — 판매가는 찍은 뒤에 차가 팔려야 생기는 값이라, 막아 두면
   * 9월에 결재가 끝난 차는 판매가를 영영 못 적고 판매수익이 거짓으로 남는다.
   *
   * 다만 날짜는 안 옮긴다. 결재된 줄을 다른 달로 옮기면 그 달 합계가 결재한 뒤에
   * 바뀐다 — 그건 무엇을 보고 찍었는지를 건드리는 일이다.
   *
   * 아직 결재 안 된 줄이 있으면 그쪽이 먼저다. 같은 차를 두 번 사고팔았으면 이번 건이
   * 아직 안 끝난 쪽이다.
   *
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로도 찾는다.
   */
  private async applySalePrice(
    vehicleNumber: string,
    amount: number,
    soldOn: Date | null,
    from: string,
  ): Promise<'updated' | 'already' | 'noMatch'> {
    try {
      const plates = [...new Set([vehicleNumber, normalizePlate(vehicleNumber)])].filter(Boolean);
      const found = await this.prisma.purchaseSettlement.findMany({
        where: { vehicleNumber: { in: plates } },
        orderBy: { date: 'desc' },
        select: { id: true, salePrice: true, date: true, chiefApprovedAt: true },
      });
      // 아직 안 끝난 줄이 먼저 — 같은 차를 두 번 샀으면 이번 건이 그쪽이다
      const target = found.find((r) => r.chiefApprovedAt === null) ?? found[0];
      if (!target) return 'noMatch';

      /*
       * 정산은 판 달로 잡는다.
       *
       * 7월에 사서 9월에 팔았으면 그건 9월 정산이다. 매입일에 머물러 있으면 이번 달
       * 목록에 안 보이고, 지난 달을 뒤져야 나온다 — 정산은 판 다음에 하는 일이다.
       * 매입일은 매입 관리에 그대로 남아 있으니 여기서 또 들고 있을 필요가 없다.
       */
      // 0으로 덮어써서 이미 적어둔 값을 지우지 않는다 — 안 적은 칸은 그대로 둔다.
      const data = {
        ...(target.salePrice !== amount ? { salePrice: amount } : {}),
        // 결재된 줄은 달을 안 옮긴다 — 찍은 뒤에 그 달 합계가 바뀌면 안 된다
        ...(target.chiefApprovedAt === null &&
        soldOn &&
        formatDateOnly(target.date) !== formatDateOnly(soldOn)
          ? { date: soldOn }
          : {}),
      };
      if (Object.keys(data).length === 0) return 'already';

      await this.prisma.purchaseSettlement.update({ where: { id: target.id }, data });
      this.logger.log(`${vehicleNumber} 매입 정산에 ${from} 값을 옮겼습니다: ${JSON.stringify(data)}`);
      return 'updated';
    } catch (e) {
      // 옮기지 못해도 적은 쪽은 그대로 저장된다 — 손으로 적으면 된다.
      this.logger.warn(`${from} 값을 옮기지 못했습니다(${vehicleNumber}): ${(e as Error).message}`);
      return 'noMatch';
    }
  }

  // ── 계약 목표 ──────────────────────────────

  /**
   * 그 달 계약 목표.
   *
   * 적어 둔 적이 없으면 스무 건으로 본다 — 처음 여는 사람에게 0 을 보여 주면 달성률이
   * 셀 수 없는 값이 되고, 아무도 적지 않으면 그 자리가 영영 비어 있다.
   */
  async contractGoal(month: string) {
    const row = await this.prisma.contractGoal.findUnique({ where: { month } });
    return { month, target: row?.target ?? 20, updatedBy: row?.updatedBy ?? '' };
  }

  async setContractGoal(month: string, target: number, user: AuthUser) {
    const value = Math.max(0, Math.round(target));
    const row = await this.prisma.contractGoal.upsert({
      where: { month },
      create: { month, target: value, updatedBy: user.name },
      update: { target: value, updatedBy: user.name },
    });
    return { month, target: row.target, updatedBy: row.updatedBy };
  }

  /**
   * 알선 정산 결재 — 매입 정산과 같은 흐름이다.
   *
   * 결재하는 규칙(누가 찍는가, 순서, 잠기는 시점)을 매입 쪽과 같은 함수로 낸다.
   * 두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽이 어긋난다.
   */
  async submitBrokerage(id: string, user: AuthUser) {
    const row = await this.prisma.brokerageSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    if (isLocked(stageOf(row, withChief))) throw new ForbiddenException('이미 승인된 정산입니다.');

    const updated = await this.prisma.brokerageSettlement.update({
      where: { id },
      data: { submittedAt: new Date() },
      include: EMPLOYEE_SELECT,
    });
    void this.notifyApprover(
      withChief ? CHIEF_APPROVER : CEO_APPROVER,
      `${row.vehicleNumber} ${row.vehicleName} 알선 정산이 올라왔습니다.`,
      user.name,
    );
    return this.brokerageView(updated);
  }

  async approveBrokerage(id: string, user: AuthUser) {
    const role = approvalRoleOf(user.name);
    if (!role) throw new ForbiddenException('정산을 승인할 수 있는 계정이 아닙니다.');

    const row = await this.prisma.brokerageSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        employeeId: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    const stage = stageOf(row, withChief);

    if (role === 'CHIEF' && !withChief) throw new ForbiddenException('이 정산은 대표만 승인합니다.');
    if (role === 'CHIEF') {
      if (stage !== 'SUBMITTED') {
        throw new ForbiddenException(stage === 'DRAFT' ? '아직 올라오지 않은 정산입니다.' : '이미 승인한 정산입니다.');
      }
    } else if (stage !== (withChief ? 'CHIEF' : 'SUBMITTED')) {
      throw new ForbiddenException(
        stage === 'DONE' ? '이미 확정된 정산입니다.' : withChief ? '본부장 승인이 먼저입니다.' : '아직 올라오지 않은 정산입니다.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.brokerageSettlement.update({
      where: { id },
      data:
        role === 'CHIEF'
          ? { chiefApprovedAt: now, chiefApprover: user.name }
          : { ceoApprovedAt: now, ceoApprover: user.name, status: SettlementStatus.COMPLETED },
      include: EMPLOYEE_SELECT,
    });

    const car = `${row.vehicleNumber} ${row.vehicleName}`.trim();
    if (role === 'CHIEF') {
      void this.notifyApprover(CEO_APPROVER, `${car} 알선 정산을 본부장이 승인했습니다.`, user.name);
    } else {
      void this.notifyEmployee(row.employeeId, `${car} 알선 정산이 확정됐습니다.`);
    }
    return this.brokerageView(updated);
  }

  /**
   * 반려 — 한 단계 아래로 돌려보낸다.
   *
   * 본부장이 누르면 담당자에게, 대표가 누르면 본부장에게 간다.
   *
   * 아직 안 찍고 돌려보내는 것(반려)과 이미 찍은 걸 되돌리는 것(승인 취소)을 따로 두지
   * 않는다 — 누르는 사람에게는 둘 다 "이건 아니다, 다시"이고 가는 곳도 같다.
   *
   * 대표가 되돌리면 본부장 승인까지 같이 지운다. 안 그러면 대표가 아니라고 한 건이
   * 본부장 쪽에는 '이미 본 건'으로 남아, 아무도 다시 안 보고 그대로 올라온다.
   *
   * 본부장을 안 거치는 건은 대표가 담당자에게 바로 돌려보낸다 — 중간에 아무도 없다.
   */
  async revokeBrokerage(id: string, user: AuthUser) {
    const role = approvalRoleOf(user.name);
    if (!role) throw new ForbiddenException('정산을 승인할 수 있는 계정이 아닙니다.');

    const row = await this.prisma.brokerageSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        employeeId: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    const stage = stageOf(row, withChief);
    const back = this.revokeStep(role, stage, withChief);

    const updated = await this.prisma.brokerageSettlement.update({
      where: { id },
      data: { ...back.data, status: SettlementStatus.IN_PROGRESS },
      include: EMPLOYEE_SELECT,
    });

    const car = `${row.vehicleNumber} ${row.vehicleName}`.trim();
    if (back.to === 'CHIEF') {
      void this.notifyApprover(CHIEF_APPROVER, `${car} 알선 정산을 대표가 반려했습니다.`, user.name);
    } else {
      void this.notifyEmployee(row.employeeId, `${car} 알선 정산이 반려됐습니다. 고쳐서 다시 올려 주세요. (${user.name})`);
    }
    return this.brokerageView(updated);
  }

  /** 승인을 기다리는 알선 정산 — 관리자 대시보드의 승인함에 같이 띄운다. */
  async pendingBrokerage() {
    const rows = await this.prisma.brokerageSettlement.findMany({
      where: { submittedAt: { not: null }, ceoApprovedAt: null },
      include: EMPLOYEE_SELECT,
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map((r) => this.brokerageView(r));
  }

  /**
   * 승인을 기다리는 매입 정산 — 관리자 대시보드의 승인함에 띄운다.
   *
   * 정산 화면은 달로 걸러 보는 곳이라, 지난 달에 올라온 건이 눈에 안 띈다.
   * 결재할 게 있으면 대시보드에서 바로 보이게 따로 모아 준다.
   *
   * 담당자 이름에 따라 본부장을 건너뛰는 건이 있어 단계는 여기서 다시 낸다.
   */
  async pendingPurchase() {
    const rows = await this.prisma.purchaseSettlement.findMany({
      where: { submittedAt: { not: null }, ceoApprovedAt: null },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
      orderBy: { submittedAt: 'asc' },
    });

    const plates = rows.map((r) => r.vehicleNumber);
    const [costs, offers] = await Promise.all([this.vehicleCostsByPlate(plates), this.intakeDatesOf(plates)]);
    return rows.map((r) =>
      this.toPurchaseView(r, costs.get(normalizePlate(r.vehicleNumber)), offers.get(normalizePlate(r.vehicleNumber))),
    );
  }

  /**
   * 차가 들어온 날(입고일) — 매입 관리의 매입일을 차량번호로 붙인다.
   *
   * 매입 관리가 원본이다. 정산에 따로 적지 않는다 — 두 군데 적으면 어긋나고, 어긋나면
   * 어느 쪽이 맞는지 아무도 모른다.
   *
   * 매입 기록이 없으면 재고 금융의 제시일자로 대신한다. 제시일자는 캐피탈에 제시한
   * 날이라 차가 들어온 날보다 며칠 뒤지만, 없는 것보다는 낫다 — 재고를 언제부터
   * 들고 있었는지를 세는 자리다. (제시일자는 사무장이 재고 금융 화면에서 적는다)
   *
   * 같은 차를 두 번 사 오는 일이 있다(팔았다 되사오는 경우). 그때는 최근 것이 맞다.
   *
   * 못 붙여도 목록은 그대로 나와야 한다 — 날짜 하나 때문에 정산이 안 보이면 그게 더 큰 일이다.
   */
  private async intakeDatesOf(vehicleNumbers: string[]): Promise<Map<string, IntakeFacts>> {
    const wanted = new Set(vehicleNumbers.map(normalizePlate).filter(Boolean));
    const out = new Map<string, IntakeFacts>();
    if (wanted.size === 0) return out;

    try {
      /*
        번호로 바로 묻지 않는다.

        차량번호는 손으로 적는 값이라 '124도 7252' 처럼 공백이 섞여 저장돼 있다. 공백을
        걷어낸 번호로 in 질의를 걸면 저장된 글자와 달라 한 건도 안 걸린다 — 재고 금융에
        날짜를 다 적어 뒀는데도 한 줄도 안 올라온 이유가 이것이다.

        번호와 날짜만 읽어와서 공백을 걷어낸 뒤 맞춘다.
      */
      const [intakes, vehicles] = await Promise.all([
        this.prisma.purchaseIntake.findMany({
          // 검차 리포트 주소는 카비어가 달아 준다 — 그게 있으면 카비어를 쓴 건이다
          select: { vehicleNumber: true, date: true, reportUrl: true, inspector: true },
          // 오래된 것부터 넣어 최근 것이 덮어쓰게 한다(되사온 차는 최근 매입일이 맞다)
          orderBy: { date: 'asc' },
        }),
        this.prisma.managedVehicle.findMany({ select: { vehicleNumber: true, offerDate: true } }),
      ]);

      for (const v of vehicles) {
        const plate = normalizePlate(v.vehicleNumber);
        const day = formatDateOnlyOrNull(v.offerDate);
        if (day && wanted.has(plate)) out.set(plate, { day, hasReport: false, inspector: '' });
      }
      // 매입일이 있으면 그게 맞다 — 제시일자를 덮어쓴다
      for (const r of intakes) {
        const plate = normalizePlate(r.vehicleNumber);
        if (!wanted.has(plate)) continue;
        /*
          리포트는 어느 매입 줄에든 붙어 있으면 있는 것으로 본다.

          같은 차를 두 번 사 온 건이 있는데, 날짜는 최근 것이 맞지만 리포트는 둘 중
          하나에만 붙어 있어도 카비어를 쓴 것이다.
        */
        const had = out.get(plate)?.hasReport ?? false;
        // 실차 확인자는 적힌 줄이 이긴다 — 빈 줄로 덮으면 적어 둔 이름이 사라진다
        const who = r.inspector?.trim() || out.get(plate)?.inspector || '';
        out.set(plate, {
          day: formatDateOnly(r.date),
          hasReport: had || !!r.reportUrl?.trim(),
          inspector: who,
        });
      }
    } catch (e) {
      this.logger.warn(`입고일자를 붙이지 못했습니다: ${(e as Error).message}`);
    }
    return out;
  }

  /**
   * 현금 수수료를 받았는지 대표가 찍는다.
   *
   * 적어둔 금액과 손에 들어온 돈이 다를 수 있어 한 건씩 확인한다.
   * 언제 찍었는지를 같이 남긴다 — 확인 여부만 남기면 나중에 언제 받은 건지 알 수가 없다.
   *
   * 대표만 찍는다. 받은 사람이 스스로 '받았다'고 찍으면 확인하는 뜻이 없다.
   */
  async confirmCash(id: string, user: AuthUser, confirmed: boolean) {
    if (!canConfirmCash(user)) {
      throw new ForbiddenException('현금 수수료 확인은 대표만 할 수 있습니다.');
    }
    await this.assert('brokerageSettlement', id);

    const row = await this.prisma.brokerageSettlement.update({
      where: { id },
      data: { cashConfirmedAt: confirmed ? new Date() : null },
      include: EMPLOYEE_SELECT,
    });
    return this.brokerageView(row);
  }

  /**
   * 승인이 찍힌 알선 정산은 못 고친다 — 매입 정산과 같은 규칙이다.
   *
   * 승인한 뒤에 금액이 바뀌면 무엇을 보고 찍었는지가 남지 않는다. 고쳐야 하면 승인을 먼저 취소한다.
   */
  private async assertBrokerageEditable(id: string, user?: AuthUser): Promise<void> {
    const row = await this.prisma.brokerageSettlement.findUnique({
      where: { id },
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true, ...OWNER_NAME },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    // 모르고 찍어 버린 건을 되돌릴 사람이 하나는 있어야 한다(approvers.ts)
    if (user && canEditLocked(user)) return;
    if (isLocked(stageOf(row, needsChief(row.employee?.name)))) {
      throw new ForbiddenException('승인된 정산은 고칠 수 없습니다. 승인을 먼저 취소해 주세요.');
    }
  }

  async removeBrokerage(id: string) {
    await this.assertBrokerageEditable(id);
    await this.prisma.brokerageSettlement.delete({ where: { id } });
  }

  // ── 매입 정산 ──────────────────────────────

  async findPurchase(params: ListParams) {
    const where: Prisma.PurchaseSettlementWhereInput = {
      ...this.baseWhere(params),
      ...(params.q
        ? { OR: [{ vehicleNumber: { contains: params.q } }, { vehicleName: { contains: params.q } }] }
        : {}),
    };
    const rows = await this.prisma.purchaseSettlement.findMany({
      where,
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
      orderBy: { date: 'desc' },
    });

    const plates = rows.map((r) => r.vehicleNumber);
    const [costs, intakeDates] = await Promise.all([
      this.vehicleCostsByPlate(plates),
      this.intakeDatesOf(plates),
    ]);
    return rows.map((r) => {
      const plate = normalizePlate(r.vehicleNumber);
      return this.toPurchaseView(r, costs.get(plate), intakeDates.get(plate));
    });
  }

  /**
   * 차량번호로 차량관리의 주유·배터리·주차 이력을 모아온다.
   *
   * 목록 한 번에 두 번의 조회로 끝낸다(정산 건마다 조회하면 N+1이 된다).
   * 매입 정산의 차량번호는 자유 입력이라 공백만 걷어내고 정확히 일치하는 것만 붙인다 —
   * 차량관리에 없는 번호면 0원으로 나온다.
   */
  private async vehicleCostsByPlate(vehicleNumbers: string[]): Promise<Map<string, VehicleCostSummary>> {
    const plates = new Set(vehicleNumbers.map(normalizePlate).filter(Boolean));
    if (plates.size === 0) return new Map();

    /*
      띄어쓰기 때문에 번호로 바로 못 묻는다.

      차량번호는 사람이 손으로 적는 값이라 '124도 7252' 처럼 공백이 섞여 저장돼 있다.
      공백을 걷어낸 번호로 in 질의를 걸면 저장된 쪽과 글자가 달라 한 대도 안 걸린다 —
      그래서 이력이 통째로 안 붙었다.

      번호만 다 읽어와서 공백을 걷어낸 뒤 맞춘다. 두 칸짜리 조회라 가볍다.
    */
    const all = await this.prisma.managedVehicle.findMany({ select: { id: true, vehicleNumber: true } });
    const vehicles = all.filter((v) => plates.has(normalizePlate(v.vehicleNumber)));
    if (vehicles.length === 0) return new Map();

    const grouped = await this.prisma.vehicleExpenseLog.groupBy({
      by: ['vehicleId', 'kind'],
      where: { vehicleId: { in: vehicles.map((v) => v.id) } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const byVehicleId = new Map<string, VehicleCostSummary>();
    for (const g of grouped) {
      const entry = byVehicleId.get(g.vehicleId) ?? { ...EMPTY_VEHICLE_COST };
      const amount = g._sum.amount ?? 0;

      entry[COST_FIELD[g.kind]] += amount;
      entry.total += amount;
      entry.count += g._count._all;
      byVehicleId.set(g.vehicleId, entry);
    }

    return new Map(
      vehicles
        .map((v) => [v.vehicleNumber, byVehicleId.get(v.id)] as const)
        .filter((pair): pair is readonly [string, VehicleCostSummary] => pair[1] !== undefined),
    );
  }

  /**
   * 결재 단계에 따라 고칠 수 있는지 본다.
   *
   * 본부장이 찍은 다음부터는 못 고친다 — 승인한 뒤에 금액이 바뀌면 무엇을 보고 찍었는지가
   * 남지 않는다. 고쳐야 하면 승인을 먼저 취소한다.
   *
   * 차량판매가만 빼 준다(salePriceOnly). 결재가 지키는 건 우리가 얼마를 들였느냐다 —
   * 매입가·상품화 비용·이전비가 그것이고, 본부장과 대표가 보고 찍은 것도 그 숫자다.
   * 차량판매가는 그 뒤에 차가 팔려야 생기는 값이라 찍을 때 있지도 않았다.
   *
   * 막아 두니 9월에 결재가 끝난 차가 10월에 팔리면 판매가를 영영 못 적는다. 지금
   * 결재된 정산 110건 중 91건이 판매가가 빈 채로 남아 있고, 그 줄의 판매수익은 전부
   * 거짓이다. 알선·수출 정산에서 저절로 넘어오던 값도 같이 막혀 있었다.
   */
  private async assertEditable(id: string, user?: AuthUser, salePriceOnly = false): Promise<void> {
    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true, ...OWNER_NAME },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    // 모르고 찍어 버린 건을 되돌릴 사람이 하나는 있어야 한다(approvers.ts)
    if (user && canEditLocked(user)) return;
    if (salePriceOnly) return;
    if (isLocked(stageOf(row, needsChief(row.employee?.name)))) {
      throw new ForbiddenException('승인된 정산은 고칠 수 없습니다. 승인을 먼저 취소해 주세요.');
    }
  }

  /** 그 매입 정산이 어느 차인가 — 판매가를 퍼뜨릴 때 차량번호가 필요하다 */
  private async plateOfPurchase(id: string): Promise<string | null> {
    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: { vehicleNumber: true },
    });
    return row?.vehicleNumber ?? null;
  }

  /**
   * 이번 수정이 차량판매가 하나뿐인가.
   *
   * 다른 칸이 하나라도 같이 오면 잠금을 그대로 건다 — 판매가에 얹어서 매입가를 바꾸면
   * 무엇을 보고 결재했는지가 또 사라진다.
   */
  private static salePriceOnly(dto: UpdatePurchaseDto): boolean {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdatePurchaseDto] !== undefined);
    return keys.length === 1 && keys[0] === 'salePrice';
  }

  /**
   * 계약팀이 다 채워 올린다.
   *
   * 여기서부터 본부장이 볼 차례다. 올렸다고 잠기지는 않는다 —
   * 본부장이 보기 전에 빠진 걸 발견하면 그냥 고치면 된다.
   */
  async submitPurchase(id: string, user: AuthUser) {
    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    if (isLocked(stageOf(row, withChief))) throw new ForbiddenException('이미 승인된 정산입니다.');

    const updated = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: { submittedAt: new Date() },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    // 본부장을 안 거치는 건은 올리자마자 대표 차례다.
    void this.notifyApprover(
      withChief ? CHIEF_APPROVER : CEO_APPROVER,
      `${row.vehicleNumber} ${row.vehicleName} 정산이 올라왔습니다.`,
      user.name,
    );
    return this.withVehicleCost(updated);
  }

  /**
   * 승인한다.
   *
   * 본부장 → 대표 순서다. 본부장이 안 찍었는데 대표가 먼저 찍을 수는 없다 —
   * 순서를 건너뛰면 본부장이 무엇을 보고 넘겼는지가 없어진다.
   */
  async approvePurchase(id: string, user: AuthUser) {
    const role = approvalRoleOf(user.name);
    if (!role) throw new ForbiddenException('정산을 승인할 수 있는 계정이 아닙니다.');

    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    const stage = stageOf(row, withChief);

    if (role === 'CHIEF' && !withChief) {
      throw new ForbiddenException('이 정산은 대표만 승인합니다.');
    }

    if (role === 'CHIEF') {
      if (stage !== 'SUBMITTED') {
        throw new ForbiddenException(
          stage === 'DRAFT' ? '아직 올라오지 않은 정산입니다.' : '이미 승인한 정산입니다.',
        );
      }
    } else if (stage !== (withChief ? 'CHIEF' : 'SUBMITTED')) {
      throw new ForbiddenException(
        stage === 'DONE'
          ? '이미 확정된 정산입니다.'
          : withChief
            ? '본부장 승인이 먼저입니다.'
            : '아직 올라오지 않은 정산입니다.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.purchaseSettlement.update({
      where: { id },
      data:
        role === 'CHIEF'
          ? { chiefApprovedAt: now, chiefApprover: user.name }
          : { ceoApprovedAt: now, ceoApprover: user.name, status: SettlementStatus.COMPLETED },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });

    const car = `${row.vehicleNumber} ${row.vehicleName}`.trim();
    if (role === 'CHIEF') {
      void this.notifyApprover(CEO_APPROVER, `${car} 정산을 본부장이 승인했습니다.`, user.name);
    } else {
      void this.notifyEmployee(updated.employeeId, `${car} 정산이 확정됐습니다.`);
    }
    return this.withVehicleCost(updated);
  }

  /**
   * 반려 — 한 단계 아래로 돌려보낸다.
   *
   * 본부장이 누르면 담당자에게, 대표가 누르면 본부장에게 간다.
   *
   * 아직 안 찍고 돌려보내는 것(반려)과 이미 찍은 걸 되돌리는 것(승인 취소)을 따로 두지
   * 않는다 — 누르는 사람에게는 둘 다 "이건 아니다, 다시"이고 가는 곳도 같다.
   *
   * 대표가 되돌리면 본부장 승인까지 같이 지운다. 안 그러면 대표가 아니라고 한 건이
   * 본부장 쪽에는 '이미 본 건'으로 남아, 아무도 다시 안 보고 그대로 올라온다.
   *
   * 본부장을 안 거치는 건은 대표가 담당자에게 바로 돌려보낸다 — 중간에 아무도 없다.
   */
  async revokePurchase(id: string, user: AuthUser) {
    const role = approvalRoleOf(user.name);
    if (!role) throw new ForbiddenException('정산을 승인할 수 있는 계정이 아닙니다.');

    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: {
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        vehicleNumber: true,
        vehicleName: true,
        employeeId: true,
        ...OWNER_NAME,
      },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const withChief = needsChief(row.employee?.name);
    const stage = stageOf(row, withChief);
    const back = this.revokeStep(role, stage, withChief);

    const updated = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: { ...back.data, status: SettlementStatus.IN_PROGRESS },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });

    const car = `${row.vehicleNumber} ${row.vehicleName}`.trim();
    if (back.to === 'CHIEF') {
      void this.notifyApprover(CHIEF_APPROVER, `${car} 매입 정산을 대표가 반려했습니다.`, user.name);
    } else {
      void this.notifyEmployee(row.employeeId, `${car} 매입 정산이 반려됐습니다. 고쳐서 다시 올려 주세요. (${user.name})`);
    }
    return this.withVehicleCost(updated);
  }

  /**
   * 누가 어느 자리에서 되돌릴 수 있고, 어디로 가는가.
   *
   * 알선·매입이 같은 규칙이라 한 곳에 둔다 — 두 벌로 두면 한쪽만 고쳐 놓고 왜 다르게
   * 도는지 한참 찾게 된다.
   */
  private revokeStep(
    role: 'CHIEF' | 'CEO',
    stage: ReturnType<typeof stageOf>,
    withChief: boolean,
  ): { to: 'CHIEF' | 'OWNER'; data: Record<string, null | string> } {
    if (role === 'CHIEF') {
      if (!withChief) throw new ForbiddenException('이 정산은 대표만 결재합니다.');
      if (stage !== 'SUBMITTED' && stage !== 'CHIEF') {
        throw new ForbiddenException(
          stage === 'DONE' ? '대표가 먼저 되돌려야 합니다.' : '아직 올라오지 않은 정산입니다.',
        );
      }
      // 담당자에게 — 올린 것까지 지운다. 고쳐서 다시 올려야 한다
      return { to: 'OWNER', data: { submittedAt: null, chiefApprovedAt: null, chiefApprover: '' } };
    }

    const mine = withChief ? ['CHIEF', 'DONE'] : ['SUBMITTED', 'DONE'];
    if (!mine.includes(stage)) throw new ForbiddenException('아직 올라오지 않은 정산입니다.');

    return withChief
      ? // 본부장에게 — 본부장 승인까지 지운다. 안 지우면 아무도 다시 안 본다
        { to: 'CHIEF', data: { ceoApprovedAt: null, ceoApprover: '', chiefApprovedAt: null, chiefApprover: '' } }
      : // 본부장을 안 거치는 건은 담당자에게 바로 간다
        { to: 'OWNER', data: { ceoApprovedAt: null, ceoApprover: '', submittedAt: null } };
  }

  /** 이름으로 찾아 알린다. 그 이름을 가진 직원이 없으면 조용히 넘어간다. */
  private async notifyApprover(name: string, message: string, from: string): Promise<void> {
    const found = await this.prisma.employee.findFirst({
      where: { active: true, name },
      select: { id: true },
    });
    if (!found) {
      this.logger.warn(`정산 결재자 '${name}' 를 직원과 못 맞췄습니다.`);
      return;
    }
    await this.notifyEmployee(found.id, `${message} (${from})`);
  }

  private async notifyEmployee(employeeId: string, message: string): Promise<void> {
    try {
      const today = todayKst();
      await this.prisma.notification.create({
        data: {
          type: NotificationType.APPROVAL,
          message,
          employeeId,
          date: new Date(`${today}T00:00:00.000Z`),
        },
      });
      this.realtime.toEmployees([employeeId], REALTIME_EVENT.notification, {
        type: NotificationType.APPROVAL,
        message,
        date: today,
      });
      void this.push.sendToEmployees([employeeId], { title: '매입 정산', body: message });
    } catch (e) {
      this.logger.warn(`정산 알림을 보내지 못했습니다: ${(e as Error).message}`);
    }
  }

  private toPurchaseView<T extends PurchaseRow>(
    row: T,
    cost: VehicleCostSummary | undefined,
    /** 차가 들어온 날(입고일) — 매입 관리에서 붙인다. 없으면 null */
    intake?: IntakeFacts,
  ) {
    const vehicleCost = cost ?? EMPTY_VEHICLE_COST;
    const carviorFee = carviorFeeOf(row.carvior, intake?.hasReport ?? false);
    // 상품화총비용과 항목별 합계는 명세를 더해서 낸다 — 저장하지 않는다.
    const prepTotal = purchasePrepTotal(row.prepCosts);
    /*
     * 이전비는 늘 매입가로 낸다 — 저장된 값을 안 쓴다.
     *
     * 상사 이전비(매입가의 1%)와 추가이전비(취득세의 15%)를 더한 값이라 매입가만 있으면
     * 정해진다. 예전에 알선 정산에서 가져다 넣은 값이 남아 있는데, 그건 알선 쪽 이전비라
     * 여기 쓸 값이 아니다. 저장값을 살려두면 그게 계속 덮어씌워진다.
     */
    const transferFee = transferFeeOf(row.purchasePrice);
    // 담당자에 따라 본부장을 거치는지가 갈린다.
    const withChief = needsChief(row.employee?.name);
    const profit = saleProfit(
      row.salePrice,
      purchaseGrandTotalWon(
        row.purchasePrice,
        prepTotal,
        vehicleCost,
        transferFee,
        row.brokerFee,
        row.platformFee,
        row.payoutAmount,
        carviorFee,
      ),
      row.payoutAmount,
      row.purchasePrice,
    );
    return {
      ...row,
      transferFee,
      date: formatDateOnly(row.date),
      prepTotal,
      prepBreakdown: prepBreakdown(row.prepCosts),
      // 실제지급액을 적었으면 이전비는 안 더한다 — 상사가 먼저 뗀 돈이다
      grandTotal: purchaseGrandTotal(
        row.purchasePrice,
        prepTotal,
        transferFee,
        row.brokerFee,
        row.platformFee,
        row.payoutAmount,
        carviorFee,
      ),
      // 차량관리에서 자동으로 붙는 값 — 저장하지 않고 조회할 때마다 계산한다.
      vehicleCost,
      grandTotalWon: purchaseGrandTotalWon(
        row.purchasePrice,
        prepTotal,
        vehicleCost,
        transferFee,
        row.brokerFee,
        row.platformFee,
        row.payoutAmount,
        carviorFee,
      ),
      // 판 값. 아직 안 팔았으면 전부 0이라 판매수익도 0으로 나온다.
      submittedAt: row.submittedAt?.toISOString() ?? null,
      chiefApprovedAt: row.chiefApprovedAt?.toISOString() ?? null,
      ceoApprovedAt: row.ceoApprovedAt?.toISOString() ?? null,
      stage: stageOf(row, withChief),
      locked: isLocked(stageOf(row, withChief)),
      /** 본부장을 안 거치는 건 — 화면에서 '대표 승인 대기'로 적는다 */
      chiefRequired: withChief,
      saleProfit: profit,
      /**
       * 차가 들어온 날 — 재고를 언제부터 들고 있었는지의 기점이다.
       *
       * 매입 관리의 매입일을 차량번호로 붙인다(없으면 재고 금융의 제시일자). 정산에 따로
       * 적지 않는다 — 두 군데 적으면 어긋나고, 어느 쪽이 맞는지 아무도 모른다.
       */
      intakeDate: intake?.day ?? null,
      /*
        카비어 수수료.

        검차 리포트가 붙은 차는 저절로 문다 — 리포트를 카비어가 달아 주기 때문이다.
        손으로 켜고 끈 건은 그 값이 이긴다(carvior 가 null 이 아니면 그쪽).

        무는지(carviorOn)와 얼마인지(carviorFee)를 둘 다 보낸다. 화면이 체크를 그리고
        금액을 적어야 하는데, 금액만 보내면 0원인 건이 '안 뭄'인지 '0원'인지 모른다.
      */
      hasReport: intake?.hasReport ?? false,
      /*
        견적 본 사람.

        정산에 적어 둔 이름이 먼저다. 안 적었으면 매입 관리의 실차 확인자를 보여 준다 —
        거기 적어 둔 건이 이미 있어서, 안 쓰면 그 이름이 어디에도 안 보인다.
      */
      appraiser: row.appraiser?.trim() || intake?.inspector || '',
      /** 매입 관리에 적힌 실차 확인자 — 정산 칸이 비었을 때 어디서 온 이름인지 보여 준다 */
      inspector: intake?.inspector ?? '',
      carviorOn: carviorOn(row.carvior, intake?.hasReport ?? false),
      carviorFee,
      /** 그 사람이 가져가는 몫 — 안 정한 건은 0이다 */
      shareAmount: profitShareAmount(profit, row.profitShare),
    };
  }

  /** 단건 응답도 목록과 같은 모양이 되게 차량비용을 붙여준다. */
  private async withVehicleCost<T extends PurchaseRow & { vehicleNumber: string }>(row: T) {
    const [costs, offers] = await Promise.all([
      this.vehicleCostsByPlate([row.vehicleNumber]),
      this.intakeDatesOf([row.vehicleNumber]),
    ]);
    const plate = normalizePlate(row.vehicleNumber);
    return this.toPurchaseView(row, costs.get(plate), offers.get(plate));
  }

  async createPurchase(dto: CreatePurchaseDto) {
    const prepCosts = normalizePrepCosts(dto.prepCosts);
    const purchasePrice = dto.purchasePrice ?? 0;
    const prepTotal = purchasePrepTotal(prepCosts);

    const row = await this.prisma.purchaseSettlement.create({
      data: {
        date: toDateOnly(dto.date),
        vehicleName: dto.vehicleName,
        vehicleNumber: normalizePlate(dto.vehicleNumber),
        transferFee: dto.transferFee ?? 0,
        purchasePrice,
        brokerFee: dto.brokerFee ?? 0,
        platformFee: dto.platformFee ?? 0,
        ...(dto.brokerFeePayout ? { brokerFeePayout: dto.brokerFeePayout } : {}),
        profitShare: dto.profitShare ?? '',
        profitSharePaid: dto.profitSharePaid ?? false,
        payoutAmount: dto.payoutAmount ?? 0,
        appraiser: (dto.appraiser ?? '').trim(),
        // 안 보내면 null 로 둔다 — 검차 리포트가 있는 차만 저절로 문다
        carvior: dto.carvior ?? null,
        contractPhotos: dto.contractPhotos ?? '',
        salePrice: dto.salePrice ?? 0,
        cashCommission: dto.cashCommission ?? 0,
        installmentFee: dto.installmentFee ?? 0,
        insuranceFee: dto.insuranceFee ?? 0,
        dealerLoanFee: dto.dealerLoanFee ?? 0,
        // 비워서 보내면 매입+상품화총비용을 그대로 정산금액으로 잡는다.
        settlementAmount:
          dto.settlementAmount ??
          purchaseGrandTotal(purchasePrice, prepTotal, dto.transferFee ?? 0, dto.brokerFee ?? 0, dto.platformFee ?? 0),
        newCarName: dto.newCarName ?? '',
        employeeId: dto.employeeId,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        memo: dto.memo ?? '',
        prepCosts: { create: prepCosts },
      },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    return this.withVehicleCost(row);
  }

  /**
   * 수정.
   * 명세는 통째로 갈아끼운다 — 줄 단위로 맞춰가며 고치는 것보다 화면에서 온 목록이 정답이다.
   * 명세를 아예 안 보내면 건드리지 않는다(다른 칸만 고치는 경우).
   */
  async updatePurchase(id: string, dto: UpdatePurchaseDto, user?: AuthUser) {
    await this.assertEditable(id, user, SettlementsService.salePriceOnly(dto));
    /*
      차량판매가를 적었으면 나머지 세 곳에도 같이 넣는다 — 제시 금융의 매도금액,
      알선 정산의 실 차량판매가, 상담의 차량판매가가 다 같은 값이다.
    */
    if ((dto.salePrice ?? 0) > 0) {
      const plate = dto.vehicleNumber ?? (await this.plateOfPurchase(id));
      if (plate) void (await this.salePrice.spread(plate, dto.salePrice as number, 'purchase'));
    }
    const { prepCosts, ...rest } = dto;

    const row = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: {
        ...this.stripDate(rest),
        ...(dto.date ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.vehicleNumber !== undefined ? { vehicleNumber: normalizePlate(dto.vehicleNumber) } : {}),
        ...(prepCosts ? { prepCosts: { deleteMany: {}, create: normalizePrepCosts(prepCosts) } } : {}),
      },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    return this.withVehicleCost(row);
  }

  /**
   * 그 달 매입 정산을 한 번에 지운다.
   *
   * 이 화면이 생기기 전에 따로 정산을 끝낸 달이 있다. 그런 달은 여기 남아 있어봐야
   * 끝난 일이 할 일처럼 보인다. 손으로 수십 건을 지우게 두지 않는다.
   *
   * 승인이 찍힌 건은 안 지운다 — 그건 누가 무엇을 보고 결재했는지가 남아야 하는 기록이다.
   * 지우려면 승인을 먼저 취소해야 한다.
   */
  async removePurchaseMonth(month: string): Promise<{ deleted: number; kept: number }> {
    const where = { date: monthRange(month) };
    const [total, approved] = await Promise.all([
      this.prisma.purchaseSettlement.count({ where }),
      this.prisma.purchaseSettlement.count({ where: { ...where, chiefApprovedAt: { not: null } } }),
    ]);

    const { count } = await this.prisma.purchaseSettlement.deleteMany({
      where: { ...where, chiefApprovedAt: null },
    });
    this.logger.log(`${month} 매입 정산 ${count}건을 지웠습니다(승인된 ${approved}건은 남김, 전체 ${total}건).`);
    return { deleted: count, kept: approved };
  }

  /**
   * 정산이 올라온 차량번호를 모아 준다.
   *
   * 알선·수출 정산은 줄이 있으면 올라온 것이고, 매입 정산은 차량판매가가 적혀야 판 것이다 —
   * 매입만 적어 둔 줄은 아직 안 판 차다.
   */
  async settledPlates(): Promise<string[]> {
    const [brokerage, purchase] = await Promise.all([
      this.prisma.brokerageSettlement.findMany({
        where: { vehicleNumber: { not: '' } },
        select: { vehicleNumber: true },
      }),
      this.prisma.purchaseSettlement.findMany({
        where: { vehicleNumber: { not: '' }, salePrice: { gt: 0 } },
        select: { vehicleNumber: true },
      }),
    ]);
    return [...new Set([...brokerage, ...purchase].map((r) => normalizePlate(r.vehicleNumber)).filter(Boolean))];
  }

  /**
   * 차량번호별 알선·수출 — 매입 정산의 '판매 경로' 칸이 쓴다.
   *
   * 차량번호와 종류만 보낸다. 어디로 나갔는지만 알면 되는 칸이라 금액까지 열지 않는다.
   */
  async brokerageChannels(): Promise<{ vehicleNumber: string; kind: ConsultationKind }[]> {
    return this.prisma.brokerageSettlement.findMany({
      where: { vehicleNumber: { not: '' } },
      select: { vehicleNumber: true, kind: true },
    });
  }

  /** 자동완성용 — 지금까지 쓴 업체·카테고리 이름. 항목별로 나눠서 준다. */
  async prepVendors(): Promise<Record<string, string[]>> {
    const rows = await this.prisma.purchasePrepCost.findMany({
      where: { vendor: { not: '' } },
      select: { kind: true, vendor: true },
      distinct: ['kind', 'vendor'],
      orderBy: { vendor: 'asc' },
    });

    const byKind: Record<string, string[]> = {};
    for (const r of rows) (byKind[r.kind] ??= []).push(r.vendor);
    return byKind;
  }

  async removePurchase(id: string) {
    await this.assertEditable(id);
    await this.prisma.purchaseSettlement.delete({ where: { id } });
  }

  // ── 공통 ──────────────────────────────

  /** date는 문자열이라 그대로 넘기면 안 되므로 분리해서 처리한다. */
  private stripDate<T extends { date?: string }>(dto: T): Omit<T, 'date'> {
    const { date: _date, ...rest } = dto;
    return rest;
  }

  private async assert(
    model: 'settlement' | 'brokerageSettlement' | 'purchaseSettlement',
    id: string,
  ): Promise<void> {
    const delegate = this.prisma[model] as { findUnique: (a: unknown) => Promise<unknown> };
    const found = await delegate.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
  }
}
