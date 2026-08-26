import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStatus, VehicleExpenseKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, toDateOnly } from '../common/date.util';
import {
  EMPTY_VEHICLE_COST,
  brokerageProfit,
  brokerageSaleProfit,
  netProfit,
  prepBreakdown,
  purchaseGrandTotal,
  purchaseGrandTotalWon,
  purchasePrepTotal,
  type PrepCostKind,
  type VehicleCostSummary,
} from './settlement.calc';
import { normalizePlate } from '../vehicles/vehicle.rules';
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
interface PurchaseRow {
  date: Date;
  purchasePrice: number;
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
const COST_FIELD: Record<VehicleExpenseKind, 'fuel' | 'battery' | 'parking' | 'repair'> = {
  [VehicleExpenseKind.FUEL]: 'fuel',
  [VehicleExpenseKind.BATTERY]: 'battery',
  [VehicleExpenseKind.PARKING]: 'parking',
  [VehicleExpenseKind.REPAIR]: 'repair',
};

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

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
      saleProfit: brokerageSaleProfit(r),
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
        vehicleNumber: dto.vehicleNumber,
        vehicleName: dto.vehicleName,
        ...nums,
        // 비워서 보내면 판매 수익을 그대로 정산받을금액으로 잡는다(프론트 폼과 동일한 규칙).
        settlementAmount: dto.settlementAmount ?? brokerageSaleProfit(nums),
        employeeId: dto.employeeId,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        memo: dto.memo ?? '',
      },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), profit: brokerageProfit(row), saleProfit: brokerageSaleProfit(row) };
  }

  async updateBrokerage(id: string, dto: UpdateBrokerageDto) {
    await this.assert('brokerageSettlement', id);
    const row = await this.prisma.brokerageSettlement.update({
      where: { id },
      data: { ...this.stripDate(dto), ...(dto.date ? { date: toDateOnly(dto.date) } : {}) },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), profit: brokerageProfit(row), saleProfit: brokerageSaleProfit(row) };
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

  private toPurchaseView<T extends PurchaseRow>(row: T, cost: VehicleCostSummary | undefined) {
    const vehicleCost = cost ?? EMPTY_VEHICLE_COST;
    // 상품화총비용과 항목별 합계는 명세를 더해서 낸다 — 저장하지 않는다.
    const prepTotal = purchasePrepTotal(row.prepCosts);
    return {
      ...row,
      date: formatDateOnly(row.date),
      prepTotal,
      prepBreakdown: prepBreakdown(row.prepCosts),
      grandTotal: purchaseGrandTotal(row.purchasePrice, prepTotal),
      // 차량관리에서 자동으로 붙는 값 — 저장하지 않고 조회할 때마다 계산한다.
      vehicleCost,
      grandTotalWon: purchaseGrandTotalWon(row.purchasePrice, prepTotal, vehicleCost),
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
        vehicleNumber: dto.vehicleNumber,
        transferFee: dto.transferFee ?? 0,
        purchasePrice,
        brokerFee: dto.brokerFee ?? 0,
        // 비워서 보내면 매입+상품화총비용을 그대로 정산금액으로 잡는다.
        settlementAmount: dto.settlementAmount ?? purchaseGrandTotal(purchasePrice, prepTotal),
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
    await this.assert('purchaseSettlement', id);
    const { prepCosts, ...rest } = dto;

    const row = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: {
        ...this.stripDate(rest),
        ...(dto.date ? { date: toDateOnly(dto.date) } : {}),
        ...(prepCosts ? { prepCosts: { deleteMany: {}, create: normalizePrepCosts(prepCosts) } } : {}),
      },
      include: { ...EMPLOYEE_SELECT, ...PREP_COST_INCLUDE },
    });
    return this.withVehicleCost(row);
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
    await this.assert('purchaseSettlement', id);
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
