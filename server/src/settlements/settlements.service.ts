import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, SettlementStatus, VehicleExpenseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, toDateOnly, todayKst } from '../common/date.util';
import {
  EMPTY_VEHICLE_COST,
  brokerageProfit,
  brokerageSettlementAmount,
  netProfit,
  prepBreakdown,
  purchaseGrandTotal,
  purchaseGrandTotalWon,
  saleProfit,
  type SaleFields,
  purchasePrepTotal,
  type PrepCostKind,
  type VehicleCostSummary,
} from './settlement.calc';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { approvalRoleOf, CEO_APPROVER, CHIEF_APPROVER, isLocked, stageOf } from './approvers';
import type { AuthUser } from '../auth/current-user.decorator';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';
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

const EMPLOYEE_SELECT = { employee: { select: { id: true, name: true, position: true } } };

/** 상품화 비용 명세는 화면에 적은 순서대로 보여준다. */
const PREP_COST_INCLUDE = { prepCosts: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.PurchaseSettlementInclude;

/** 조회 결과에서 파생값 계산에 필요한 최소 모양 */
interface PurchaseRow extends SaleFields {
  date: Date;
  transferFee: number;
  submittedAt: Date | null;
  chiefApprovedAt: Date | null;
  ceoApprovedAt: Date | null;
  purchasePrice: number;
  salePrice: number;
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
const COST_FIELD: Record<VehicleExpenseKind, 'fuel' | 'battery' | 'parking' | 'repair' | 'etc'> = {
  [VehicleExpenseKind.FUEL]: 'fuel',
  [VehicleExpenseKind.BATTERY]: 'battery',
  [VehicleExpenseKind.PARKING]: 'parking',
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

  async removeBasic(id: string) {
    await this.assert('settlement', id);
    await this.prisma.settlement.delete({ where: { id } });
  }

  // ── 알선 정산 ──────────────────────────────

  async findBrokerage(params: ListParams) {
    const where: Prisma.BrokerageSettlementWhereInput = {
      ...this.baseWhere(params),
      ...(params.q
        ? { OR: [{ vehicleNumber: { contains: params.q } }, { vehicleName: { contains: params.q } }] }
        : {}),
    };
    const rows = await this.prisma.brokerageSettlement.findMany({
      where,
      include: EMPLOYEE_SELECT,
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      date: formatDateOnly(r.date),
      profit: brokerageProfit(r),
    }));
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
    };
    const row = await this.prisma.brokerageSettlement.create({
      data: {
        date: toDateOnly(dto.date),
        // 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다. 넣을 때 정리해 둔다 —
        // 찾을 때마다 맞추면 한 군데만 빠뜨려도 다른 화면과 어긋난다.
        vehicleNumber: normalizePlate(dto.vehicleNumber),
        vehicleName: dto.vehicleName,
        ...nums,
        // 비워서 보내면 판매 수익을 그대로 정산받을금액으로 잡는다(프론트 폼과 동일한 규칙).
        // 안 적어 보내면 구간 비율로 낸다. 적어 보내면 그 값이 우선이다 — 예외가 있다.
        settlementAmount: dto.settlementAmount ?? brokerageSettlementAmount(brokerageProfit(nums)),
        employeeId: dto.employeeId,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        memo: dto.memo ?? '',
      },
      include: EMPLOYEE_SELECT,
    });
    void (await this.syncFromBrokerage(row));
    return { ...row, date: formatDateOnly(row.date), profit: brokerageProfit(row) };
  }

  async updateBrokerage(id: string, dto: UpdateBrokerageDto) {
    await this.assert('brokerageSettlement', id);
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
    return { ...row, date: formatDateOnly(row.date), profit: brokerageProfit(row) };
  }

  /**
   * 알선 정산에 적은 값을 매입 정산으로 옮긴다.
   *
   *   실차주입금  →  차량판매가
   *   이전비 + 이전비 잔액  →  이전비 + 추가이전비
   *
   * 같은 차를 두 곳에 적게 하지 않는다 — 얼마에 팔았고 이전비가 얼마 들었는지는
   * 알선팀이 먼저 아는 값이고, 계약팀이 그걸 옮겨 적으면 어느 쪽이 맞는지 알 수 없게 된다.
   *
   * 총 진행 판매금액이 아니라 실차주입금을 쓴다 — 실제로 들어온 돈이 그쪽이다.
   *
   * 둘 다 원 단위라 환산하지 않는다(알선 정산도 원으로 적는다).
   *
   * 승인이 찍힌 정산은 건드리지 않는다. 결재한 뒤에 금액이 저절로 바뀌면
   * 무엇을 보고 찍었는지가 남지 않는다.
   *
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로도 찾는다.
   * 같은 차를 두 번 사고팔았으면 최근 매입 건에 넣는다.
   */
  private async syncFromBrokerage(row: {
    vehicleNumber: string;
    ownerDeposit: number;
    transferFee: number;
    transferFeeBalance: number;
    date: Date;
  }): Promise<'updated' | 'already' | 'noMatch'> {
    // 이전비 잔액이 매입 정산의 '추가이전비' 자리다. 둘을 더해 한 칸에 넣는다.
    const transferFee = row.transferFee + row.transferFeeBalance;
    if (row.ownerDeposit <= 0 && transferFee <= 0) return 'already';

    try {
      const plates = [...new Set([row.vehicleNumber, normalizePlate(row.vehicleNumber)])].filter(Boolean);
      const target = await this.prisma.purchaseSettlement.findFirst({
        where: { vehicleNumber: { in: plates }, chiefApprovedAt: null },
        orderBy: { date: 'desc' },
        select: { id: true, salePrice: true, transferFee: true, date: true },
      });
      if (!target) return 'noMatch';

      /*
       * 정산은 판 달로 잡는다.
       *
       * 7월에 사서 9월에 팔았으면 그건 9월 정산이다. 매입일에 머물러 있으면 이번 달
       * 목록에 안 보이고, 지난 달을 뒤져야 나온다 — 정산은 판 다음에 하는 일이다.
       * 매입일은 매입 관리에 그대로 남아 있으니 여기서 또 들고 있을 필요가 없다.
       */
      const sold = row.ownerDeposit > 0;

      // 0으로 덮어써서 이미 적어둔 값을 지우지 않는다 — 안 적은 칸은 그대로 둔다.
      const data = {
        ...(sold && target.salePrice !== row.ownerDeposit ? { salePrice: row.ownerDeposit } : {}),
        ...(transferFee > 0 && target.transferFee !== transferFee ? { transferFee } : {}),
        ...(sold && formatDateOnly(target.date) !== formatDateOnly(row.date) ? { date: row.date } : {}),
      };
      if (Object.keys(data).length === 0) return 'already';

      await this.prisma.purchaseSettlement.update({ where: { id: target.id }, data });
      this.logger.log(`${row.vehicleNumber} 매입 정산에 알선 값을 옮겼습니다: ${JSON.stringify(data)}`);
      return 'updated';
    } catch (e) {
      // 옮기지 못해도 알선 정산은 그대로 저장된다 — 손으로 적으면 된다.
      this.logger.warn(`알선 값을 옮기지 못했습니다(${row.vehicleNumber}): ${(e as Error).message}`);
      return 'noMatch';
    }
  }

  /**
   * 이미 적어둔 알선 정산을 한 번에 끌어온다.
   *
   * 옮기는 건 알선 정산을 저장할 때 일어난다. 그 전에 적어둔 건은 아무 일도 안 일어나서
   * "한 대도 안 넘어왔다"가 된다. 여기서 지난 것까지 한 번 훑는다.
   *
   * 못 찾은 건수도 같이 돌려준다 — 안 넘어온 게 짝이 없어서인지 이미 같은 값이어서인지
   * 알아야 다음에 무엇을 볼지 정할 수 있다.
   */
  async syncAllFromBrokerage() {
    const rows = await this.prisma.brokerageSettlement.findMany({
      select: {
        vehicleNumber: true,
        ownerDeposit: true,
        transferFee: true,
        transferFeeBalance: true,
        date: true,
      },
      orderBy: { date: 'asc' },
    });

    let updated = 0;
    let already = 0;
    const missing: string[] = [];

    for (const row of rows) {
      const result = await this.syncFromBrokerage(row);
      if (result === 'updated') updated += 1;
      else if (result === 'already') already += 1;
      else missing.push(row.vehicleNumber);
    }

    /*
     * 어디서 끊겼는지 같이 돌려준다.
     *
     * '0건 가져옴'만 보면 왜 안 됐는지 알 수가 없다. 알선 정산이 아예 없는 건지,
     * 판매금액을 안 적은 건지, 차량번호가 매입 정산과 안 겹치는 건지 —
     * 셋은 고칠 방법이 완전히 다르다.
     */
    const withAmount = rows.filter((r) => r.ownerDeposit > 0).length;
    const purchasePlates = new Set(
      (await this.prisma.purchaseSettlement.findMany({ select: { vehicleNumber: true } })).map((p) =>
        normalizePlate(p.vehicleNumber),
      ),
    );

    this.logger.log(
      `알선 → 매입 정산 옮기기: 알선 ${rows.length}건(금액 적힌 것 ${withAmount}건) / ` +
        `매입 정산 ${purchasePlates.size}대 / ${updated}건 옮김 / ${already}건 그대로 / ${missing.length}건 짝 없음`,
    );

    return {
      updated,
      already,
      noMatch: missing.length,
      missingPlates: missing.slice(0, 10),
      // 점검용 — 양쪽에 무엇이 있는지
      brokerageCount: rows.length,
      brokerageWithAmount: withAmount,
      purchaseCount: purchasePlates.size,
      brokeragePlates: rows.slice(0, 5).map((r) => r.vehicleNumber),
      purchasePlates: [...purchasePlates].slice(0, 5),
    };
  }

  async removeBrokerage(id: string) {
    await this.assert('brokerageSettlement', id);
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

    const costs = await this.vehicleCostsByPlate(rows.map((r) => r.vehicleNumber));
    return rows.map((r) => this.toPurchaseView(r, costs.get(normalizePlate(r.vehicleNumber))));
  }

  /**
   * 차량번호로 차량관리의 주유·배터리·주차 이력을 모아온다.
   *
   * 목록 한 번에 두 번의 조회로 끝낸다(정산 건마다 조회하면 N+1이 된다).
   * 매입 정산의 차량번호는 자유 입력이라 공백만 걷어내고 정확히 일치하는 것만 붙인다 —
   * 차량관리에 없는 번호면 0원으로 나온다.
   */
  private async vehicleCostsByPlate(vehicleNumbers: string[]): Promise<Map<string, VehicleCostSummary>> {
    const plates = [...new Set(vehicleNumbers.map(normalizePlate).filter(Boolean))];
    if (plates.length === 0) return new Map();

    const vehicles = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { in: plates } },
      select: { id: true, vehicleNumber: true },
    });
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
   */
  private async assertEditable(id: string): Promise<void> {
    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    if (isLocked(stageOf(row))) {
      throw new ForbiddenException('승인된 정산은 고칠 수 없습니다. 승인을 먼저 취소해 주세요.');
    }
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
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true, vehicleNumber: true, vehicleName: true },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    if (isLocked(stageOf(row))) throw new ForbiddenException('이미 승인된 정산입니다.');

    const updated = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: { submittedAt: new Date() },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    void this.notifyApprover(CHIEF_APPROVER, `${row.vehicleNumber} ${row.vehicleName} 정산이 올라왔습니다.`, user.name);
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
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true, vehicleNumber: true, vehicleName: true },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const stage = stageOf(row);

    if (role === 'CHIEF') {
      if (stage !== 'SUBMITTED') {
        throw new ForbiddenException(
          stage === 'DRAFT' ? '아직 올라오지 않은 정산입니다.' : '이미 승인한 정산입니다.',
        );
      }
    } else if (stage !== 'CHIEF') {
      throw new ForbiddenException(
        stage === 'DONE' ? '이미 확정된 정산입니다.' : '본부장 승인이 먼저입니다.',
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

  /** 승인을 취소한다. 자기가 찍은 것만 되돌린다 — 대표가 찍은 걸 본부장이 지울 수는 없다. */
  async revokePurchase(id: string, user: AuthUser) {
    const role = approvalRoleOf(user.name);
    if (!role) throw new ForbiddenException('정산을 승인할 수 있는 계정이 아닙니다.');

    const row = await this.prisma.purchaseSettlement.findUnique({
      where: { id },
      select: { submittedAt: true, chiefApprovedAt: true, ceoApprovedAt: true },
    });
    if (!row) throw new NotFoundException('정산 내역을 찾을 수 없습니다.');
    const stage = stageOf(row);

    if (role === 'CEO') {
      if (stage !== 'DONE') throw new ForbiddenException('취소할 승인이 없습니다.');
    } else {
      if (stage !== 'CHIEF') {
        throw new ForbiddenException(
          stage === 'DONE' ? '대표 승인이 먼저 취소돼야 합니다.' : '취소할 승인이 없습니다.',
        );
      }
    }

    const updated = await this.prisma.purchaseSettlement.update({
      where: { id },
      data:
        role === 'CEO'
          ? { ceoApprovedAt: null, ceoApprover: '', status: SettlementStatus.IN_PROGRESS }
          : { chiefApprovedAt: null, chiefApprover: '' },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    return this.withVehicleCost(updated);
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

  private toPurchaseView<T extends PurchaseRow>(row: T, cost: VehicleCostSummary | undefined) {
    const vehicleCost = cost ?? EMPTY_VEHICLE_COST;
    // 상품화총비용과 항목별 합계는 명세를 더해서 낸다 — 저장하지 않는다.
    const prepTotal = purchasePrepTotal(row.prepCosts);
    return {
      ...row,
      date: formatDateOnly(row.date),
      prepTotal,
      prepBreakdown: prepBreakdown(row.prepCosts),
      grandTotal: purchaseGrandTotal(row.purchasePrice, prepTotal, row.transferFee, row.brokerFee),
      // 차량관리에서 자동으로 붙는 값 — 저장하지 않고 조회할 때마다 계산한다.
      vehicleCost,
      grandTotalWon: purchaseGrandTotalWon(row.purchasePrice, prepTotal, vehicleCost, row.transferFee, row.brokerFee),
      // 판 값. 아직 안 팔았으면 전부 0이라 판매수익도 0으로 나온다.
      submittedAt: row.submittedAt?.toISOString() ?? null,
      chiefApprovedAt: row.chiefApprovedAt?.toISOString() ?? null,
      ceoApprovedAt: row.ceoApprovedAt?.toISOString() ?? null,
      stage: stageOf(row),
      locked: isLocked(stageOf(row)),
      saleProfit: saleProfit(
        row.salePrice,
        purchaseGrandTotalWon(row.purchasePrice, prepTotal, vehicleCost, row.transferFee, row.brokerFee),
      ),
    };
  }

  /** 단건 응답도 목록과 같은 모양이 되게 차량비용을 붙여준다. */
  private async withVehicleCost<T extends PurchaseRow & { vehicleNumber: string }>(row: T) {
    const costs = await this.vehicleCostsByPlate([row.vehicleNumber]);
    return this.toPurchaseView(row, costs.get(normalizePlate(row.vehicleNumber)));
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
        ...(dto.brokerFeePayout ? { brokerFeePayout: dto.brokerFeePayout } : {}),
        salePrice: dto.salePrice ?? 0,
        cashCommission: dto.cashCommission ?? 0,
        installmentFee: dto.installmentFee ?? 0,
        insuranceFee: dto.insuranceFee ?? 0,
        dealerLoanFee: dto.dealerLoanFee ?? 0,
        // 비워서 보내면 매입+상품화총비용을 그대로 정산금액으로 잡는다.
        settlementAmount: dto.settlementAmount ?? purchaseGrandTotal(purchasePrice, prepTotal, dto.transferFee ?? 0, dto.brokerFee ?? 0),
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
  async updatePurchase(id: string, dto: UpdatePurchaseDto) {
    await this.assertEditable(id);
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
