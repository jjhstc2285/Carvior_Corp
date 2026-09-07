import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, VehicleExpenseKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  formatDateOnly,
  formatDateOnlyOrNull,
  monthRange,
  toDateOnly,
  toDateOnlyOrNull,
  todayKst,
} from "../common/date.util";
import {
  PLATE_DUPLICATE_MESSAGE,
  PLATE_FORMAT_MESSAGE,
  PLATE_NOT_FOUND_MESSAGE,
  isValidPlate,
  normalizePlate,
  plateTailOf,
} from "./vehicle.rules";
import type {
  CreateVehicleDto,
  CreateVehicleExpenseDto,
  UpdateVehicleDto,
  UpdateVehicleExpenseDto,
} from "./dto/vehicle.dto";

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 날짜를 YYYY-MM-DD 로 내려보낸다.
   *
   * 그냥 두면 ISO 시각(2026-09-03T00:00:00.000Z)으로 나가는데, 화면의 날짜 입력칸이
   * 그걸 못 읽어 빈칸으로 보인다. 다른 화면(근태·매입)도 같은 방식이다.
   */
  private toView<
    T extends {
      offerDate: Date | null;
      transferDate: Date | null;
      repayDate: Date | null;
    },
  >(row: T) {
    return {
      ...row,
      offerDate: formatDateOnlyOrNull(row.offerDate),
      transferDate: formatDateOnlyOrNull(row.transferDate),
      repayDate: formatDateOnlyOrNull(row.repayDate),
    };
  }

  // ── 외부 이동 차량 리스트 ──────────────────────────────

  findAll(params: { q?: string }) {
    const where: Prisma.ManagedVehicleWhereInput = params.q
      ? {
          OR: [
            { vehicleNumber: { contains: params.q } },
            { vehicleModel: { contains: params.q } },
          ],
        }
      : {};

    // 어느 리스트에 뜰지는 체크박스 조합으로 화면에서 정한다(vehicle.rules 참고).
    return this.prisma.managedVehicle
      .findMany({ where, orderBy: { createdAt: "desc" } })
      .then((rows) => rows.map((r) => this.toView(r)));
  }

  /** 뒤 4자리로 찾기 — 여러 대면 화면에서 선택박스를 띄운다. */
  findByTail(tail: string) {
    return this.prisma.managedVehicle.findMany({
      where: { plateTail: tail },
      orderBy: { vehicleNumber: "asc" },
    });
  }

  async create(dto: CreateVehicleDto) {
    const vehicleNumber = this.assertPlate(dto.vehicleNumber);
    await this.assertNotDuplicated(vehicleNumber);

    return this.prisma.managedVehicle
      .create({
        data: {
          vehicleNumber,
          plateTail: plateTailOf(vehicleNumber),
          vehicleModel: dto.vehicleModel.trim(),
        },
      })
      .then((row) => this.toView(row));
  }

  async update(id: string, dto: UpdateVehicleDto) {
    const current = await this.findOne(id);

    const vehicleNumber =
      dto.vehicleNumber !== undefined
        ? this.assertPlate(dto.vehicleNumber)
        : undefined;
    if (vehicleNumber && vehicleNumber !== current.vehicleNumber) {
      await this.assertNotDuplicated(vehicleNumber);
    }

    // 광고완료는 화면에서 뺐다(상품화 하나로 합쳤다). 다만 칸은 남아 있어서, 예전 값이
    // 상품화 없이 켜져 있는 채로 남지 않게 상품화를 끄면 같이 꺼둔다.
    const prepared = dto.prepared ?? current.prepared;
    const advertised = prepared
      ? (dto.advertised ?? current.advertised)
      : false;

    return this.prisma.managedVehicle
      .update({
        where: { id },
        data: {
          ...(vehicleNumber
            ? { vehicleNumber, plateTail: plateTailOf(vehicleNumber) }
            : {}),
          ...(dto.vehicleModel !== undefined
            ? { vehicleModel: dto.vehicleModel.trim() }
            : {}),
          ...(dto.prepared !== undefined ? { prepared } : {}),
          ...(dto.prepared !== undefined || dto.advertised !== undefined
            ? { advertised }
            : {}),
          ...(dto.moveBlocked !== undefined
            ? { moveBlocked: dto.moveBlocked }
            : {}),
          ...(dto.priceManwon !== undefined
            ? { priceManwon: dto.priceManwon }
            : {}),
          ...(dto.fuel !== undefined ? { fuel: dto.fuel.trim() } : {}),
          ...(dto.bodyType !== undefined ? { bodyType: dto.bodyType } : {}),
          ...(dto.saleType !== undefined ? { saleType: dto.saleType } : {}),
          ...(dto.isTaxi !== undefined ? { isTaxi: dto.isTaxi } : {}),
          ...(dto.modelYear !== undefined
            ? { modelYear: dto.modelYear.trim() }
            : {}),
          ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
          ...(dto.offerDate !== undefined
            ? { offerDate: toDateOnlyOrNull(dto.offerDate) }
            : {}),
          ...(dto.transferDate !== undefined
            ? { transferDate: toDateOnlyOrNull(dto.transferDate) }
            : {}),
          ...(dto.repayDate !== undefined
            ? { repayDate: toDateOnlyOrNull(dto.repayDate) }
            : {}),
          ...(dto.stockCapital !== undefined
            ? { stockCapital: dto.stockCapital.trim() }
            : {}),
          ...(dto.adCost !== undefined ? { adCost: dto.adCost } : {}),
          ...(dto.stockAmount !== undefined
            ? { stockAmount: dto.stockAmount }
            : {}),
        },
      })
      .then((row) => this.toView(row));
  }

  /** 차량을 지우면 그 차의 주유·배터리 이력도 함께 사라진다(FK Cascade). */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.managedVehicle.delete({ where: { id } });
  }

  async findOne(id: string) {
    const row = await this.prisma.managedVehicle.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(PLATE_NOT_FOUND_MESSAGE);
    return row;
  }

  // ── 주유 · 배터리 이력 ────────────────────────────────

  private readonly expenseInclude = {
    vehicle: { select: { id: true, vehicleNumber: true, vehicleModel: true } },
    employee: { select: { id: true, name: true } },
  };

  private toExpenseView<T extends { date: Date }>(row: T) {
    return { ...row, date: formatDateOnly(row.date) };
  }

  async findExpenses(params: {
    kind?: VehicleExpenseKind;
    vehicleId?: string;
    month?: string;
  }) {
    const where: Prisma.VehicleExpenseLogWhereInput = {
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
      ...(params.month ? { date: monthRange(params.month) } : {}),
    };

    const rows = await this.prisma.vehicleExpenseLog.findMany({
      where,
      include: this.expenseInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => this.toExpenseView(r));
  }

  async createExpense(employeeId: string, dto: CreateVehicleExpenseDto) {
    await this.findOne(dto.vehicleId);
    this.assertNoteAllowed(dto.kind, dto.note);

    const row = await this.prisma.vehicleExpenseLog.create({
      data: {
        vehicleId: dto.vehicleId,
        kind: dto.kind,
        amount: dto.amount,
        // 날짜를 안 주면 등록 시점(서버 기준 오늘, KST)으로 남긴다.
        date: toDateOnly(dto.date ?? todayKst()),
        note: dto.note ?? null,
        memo: dto.memo?.trim() ?? "",
        employeeId,
      },
      include: this.expenseInclude,
    });
    return this.toExpenseView(row);
  }

  async updateExpense(id: string, dto: UpdateVehicleExpenseDto) {
    const current = await this.findExpense(id);
    this.assertNoteAllowed(current.kind, dto.note);

    const row = await this.prisma.vehicleExpenseLog.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date !== undefined ? { date: toDateOnly(dto.date) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
      },
      include: this.expenseInclude,
    });
    return this.toExpenseView(row);
  }

  async removeExpense(id: string) {
    await this.findExpense(id);
    await this.prisma.vehicleExpenseLog.delete({ where: { id } });
  }

  private async findExpense(id: string) {
    const row = await this.prisma.vehicleExpenseLog.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("등록된 이력을 찾을 수 없습니다.");
    return row;
  }

  /** 비고(상품중/시승중/판매완료)는 주유에만 있다. */
  private assertNoteAllowed(
    kind: VehicleExpenseKind,
    note?: string | null,
  ): void {
    // 주유가 아닌 것을 하나씩 나열하면 종류가 늘 때마다 빠뜨린다 — 주유만 통과시킨다.
    if (note && kind !== VehicleExpenseKind.FUEL) {
      throw new BadRequestException("주유 등록에만 비고를 쓸 수 있습니다.");
    }
  }

  private assertPlate(value: string): string {
    const vehicleNumber = normalizePlate(value);
    if (!isValidPlate(vehicleNumber))
      throw new BadRequestException(PLATE_FORMAT_MESSAGE);
    return vehicleNumber;
  }

  private async assertNotDuplicated(vehicleNumber: string): Promise<void> {
    const existing = await this.prisma.managedVehicle.findUnique({
      where: { vehicleNumber },
      select: { id: true },
    });
    if (existing) throw new ConflictException(PLATE_DUPLICATE_MESSAGE);
  }
}
