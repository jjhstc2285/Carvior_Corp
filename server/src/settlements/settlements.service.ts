import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly, monthRange, toDateOnly } from '../common/date.util';
import {
  brokerageProfit,
  brokerageSaleProfit,
  netProfit,
  purchaseGrandTotal,
  purchasePrepTotal,
} from './settlement.calc';
import type {
  CreateBrokerageDto,
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
      include: EMPLOYEE_SELECT,
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      date: formatDateOnly(r.date),
      prepTotal: purchasePrepTotal(r),
      grandTotal: purchaseGrandTotal(r),
    }));
  }

  async createPurchase(dto: CreatePurchaseDto) {
    const nums = {
      transferFee: dto.transferFee ?? 0,
      purchasePrice: dto.purchasePrice ?? 0,
      polishWashCost: dto.polishWashCost ?? 0,
      dentCost: dto.dentCost ?? 0,
      performanceCost: dto.performanceCost ?? 0,
      deliveryCost: dto.deliveryCost ?? 0,
      repairCost: dto.repairCost ?? 0,
      brokerFee: dto.brokerFee ?? 0,
      diagnosisCost: dto.diagnosisCost ?? 0,
    };
    const row = await this.prisma.purchaseSettlement.create({
      data: {
        date: toDateOnly(dto.date),
        vehicleName: dto.vehicleName,
        vehicleNumber: dto.vehicleNumber,
        ...nums,
        // 비워서 보내면 매입+상품화총비용을 그대로 정산금액으로 잡는다.
        settlementAmount: dto.settlementAmount ?? purchaseGrandTotal(nums),
        newCarName: dto.newCarName ?? '',
        employeeId: dto.employeeId,
        status: dto.status ?? SettlementStatus.IN_PROGRESS,
        memo: dto.memo ?? '',
      },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), prepTotal: purchasePrepTotal(row), grandTotal: purchaseGrandTotal(row) };
  }

  async updatePurchase(id: string, dto: UpdatePurchaseDto) {
    await this.assert('purchaseSettlement', id);
    const row = await this.prisma.purchaseSettlement.update({
      where: { id },
      data: { ...this.stripDate(dto), ...(dto.date ? { date: toDateOnly(dto.date) } : {}) },
      include: EMPLOYEE_SELECT,
    });
    return { ...row, date: formatDateOnly(row.date), prepTotal: purchasePrepTotal(row), grandTotal: purchaseGrandTotal(row) };
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
