import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConsultationStatus, Prisma, VehicleExpenseKind } from "@prisma/client";
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
  RegisterSoldVehicleDto,
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
      soldDate: Date | null;
      firstRegisteredOn: Date | null;
      vehicleNumber?: string;
    },
  >(row: T, soldPlates?: Set<string>) {
    return {
      ...row,
      offerDate: formatDateOnlyOrNull(row.offerDate),
      transferDate: formatDateOnlyOrNull(row.transferDate),
      repayDate: formatDateOnlyOrNull(row.repayDate),
      soldDate: formatDateOnlyOrNull(row.soldDate),
      firstRegisteredOn: formatDateOnlyOrNull(row.firstRegisteredOn),
      /**
       * 출고 예정 — 상담이 판매완료로 찍혔는데 아직 매도일자를 안 적은 차.
       *
       * 저장하지 않고 조회할 때 상담과 맞춰 낸다. 상담 상태는 언제든 바뀌는데
       * 차 쪽에 복사해두면 두 곳이 어긋난다.
       * 목록을 안 거쳐 들어온 경우(단건 조회)에는 알 수 없어 false 로 둔다.
       */
      releasePending:
        row.soldDate == null && (soldPlates?.has(normalizePlate(row.vehicleNumber ?? '')) ?? false),
    };
  }

  /** 상담이 판매완료로 찍힌 차량번호 — 출고 예정을 가리는 데 쓴다. */
  private async soldPlates(): Promise<Set<string>> {
    const rows = await this.prisma.consultation.findMany({
      where: { status: ConsultationStatus.SOLD },
      select: { vehicleNumber: true },
      distinct: ['vehicleNumber'],
    });
    // 차량번호는 사람이 손으로 적는 값이라 띄어쓰기가 섞여 들어온다. 정리한 꼴로 맞춘다.
    return new Set(rows.map((r) => normalizePlate(r.vehicleNumber)));
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
    return Promise.all([
      this.prisma.managedVehicle.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.soldPlates(),
    ]).then(([rows, sold]) => rows.map((r) => this.toView(r, sold)));
  }

  /**
   * 매입했는데 차량 관리에 없는 차.
   *
   * 매입을 적으면 차량 관리에도 같이 올라간다. 그런데 차량번호 형식이 규칙과 다르거나
   * 저장이 막히면 조용히 건너뛴다 — 매입 기록을 못 남기는 것보다는 낫다고 봤기 때문이다.
   * 그 대신 빠진 차가 어디에도 안 보여서 제시 대상에 안 뜨는 일이 생긴다.
   *
   * 여기서 그걸 드러낸다. 왜 빠졌는지도 같이 준다 — 차량번호가 잘못됐으면 매입 관리에서
   * 고쳐야지 여기서 등록만 눌러서는 안 된다.
   */
  async findUnregisteredIntakes() {
    const [intakes, vehicles] = await Promise.all([
      this.prisma.purchaseIntake.findMany({
        select: {
          vehicleNumber: true,
          vehicleName: true,
          modelYear: true,
          mileage: true,
          checkedMileage: true,
          purchaseAmount: true,
          firstRegisteredOn: true,
          fuel: true,
          date: true,
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.managedVehicle.findMany({ select: { vehicleNumber: true } }),
    ]);

    const known = new Set(vehicles.map((v) => normalizePlate(v.vehicleNumber)));
    const seen = new Set<string>();

    return intakes
      .filter((i) => {
        const plate = normalizePlate(i.vehicleNumber);
        // 같은 차를 두 번 매입하는 일이 있다(팔았다 되사오는 경우). 목록에는 한 번만 올린다.
        if (!plate || known.has(plate) || seen.has(plate)) return false;
        seen.add(plate);
        return true;
      })
      .map((i) => ({
        vehicleNumber: i.vehicleNumber,
        vehicleModel: i.vehicleName,
        modelYear: i.modelYear,
        mileage: i.checkedMileage || i.mileage,
        purchasedOn: formatDateOnly(i.date),
        reason: isValidPlate(normalizePlate(i.vehicleNumber))
          ? null
          : '차량번호 형식이 규칙과 달라 등록되지 않았습니다. 매입 관리에서 고쳐 주세요.',
      }));
  }

  /**
   * 그 차를 차량 관리에 올린다.
   *
   * 매입 관리에 적힌 값을 그대로 가져온다 — 제시 가능 여부를 가리는 연식·주행거리까지
   * 같이 넣어야 올리자마자 제시 대상에 뜬다.
   */
  async registerFromIntake(vehicleNumber: string) {
    const plate = this.assertPlate(vehicleNumber);
    const intake = await this.prisma.purchaseIntake.findFirst({
      where: { vehicleNumber: { in: [plate, vehicleNumber] } },
      orderBy: { date: 'desc' },
    });
    if (!intake) throw new NotFoundException('매입 내역을 찾을 수 없습니다.');

    const row = await this.prisma.managedVehicle.upsert({
      where: { vehicleNumber: plate },
      create: {
        vehicleNumber: plate,
        plateTail: plateTailOf(plate),
        vehicleModel: intake.vehicleName.trim(),
        priceManwon: Math.round(intake.purchaseAmount / 10_000),
        fuel: intake.fuel,
        modelYear: intake.modelYear,
        mileage: intake.checkedMileage || intake.mileage,
        firstRegisteredOn: intake.firstRegisteredOn,
      },
      update: {},
    });
    return this.toView(row);
  }

  /**
   * 판매완료로 찍혔는데 차량 관리에 아예 없는 차.
   *
   * 알선처럼 우리가 안 사온 차는 차량 관리에 등록되지 않는다. 그래도 판 건 판 거라
   * 매도 차량으로 남아야 한다 — 언제 무엇을 넘겼는지가 없으면 나중에 맞춰볼 게 없다.
   *
   * 여기서는 알려주기만 한다. 매도일자를 적는 순간 registerSold 가 차를 만든다 —
   * 조회하면서 데이터를 만들어두면 안 쓸 차까지 목록에 쌓인다.
   */
  async findUnregisteredSold() {
    const [consultations, vehicles] = await Promise.all([
      this.prisma.consultation.findMany({
        where: { status: ConsultationStatus.SOLD },
        select: { vehicleNumber: true, vehicleName: true, date: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.managedVehicle.findMany({ select: { vehicleNumber: true } }),
    ]);

    const known = new Set(vehicles.map((v) => normalizePlate(v.vehicleNumber)));
    const seen = new Set<string>();

    return consultations
      .filter((c) => {
        const plate = normalizePlate(c.vehicleNumber);
        // 같은 차로 상담이 여러 번 오는 일이 흔하다. 목록에는 한 번만 올린다.
        if (!plate || known.has(plate) || seen.has(plate)) return false;
        seen.add(plate);
        return true;
      })
      .map((c) => ({
        vehicleNumber: c.vehicleNumber,
        vehicleModel: c.vehicleName,
        soldOn: formatDateOnly(c.date),
      }));
  }

  /**
   * 차량 관리에 없는 차를 매도로 남긴다.
   *
   * 차를 만들고 매도일자를 적는다. 이미 있으면 날짜만 고친다 — 두 번 눌러도 같은 결과다.
   * 매입가·연식 같은 건 비워둔다. 나중에 매입 관리에서 채우면 그대로 이어진다.
   */
  async registerSold(dto: RegisterSoldVehicleDto) {
    const vehicleNumber = this.assertPlate(dto.vehicleNumber);
    const found = await this.prisma.managedVehicle.findFirst({
      where: { vehicleNumber: { in: [vehicleNumber, dto.vehicleNumber] } },
      select: { id: true },
    });

    const soldDate = toDateOnlyOrNull(dto.soldDate);
    const row = found
      ? await this.prisma.managedVehicle.update({ where: { id: found.id }, data: { soldDate } })
      : await this.prisma.managedVehicle.create({
          data: {
            vehicleNumber,
            plateTail: plateTailOf(vehicleNumber),
            vehicleModel: dto.vehicleModel?.trim() || '',
            soldDate,
          },
        });
    return this.toView(row);
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
          ...(dto.cashVehicle !== undefined ? { cashVehicle: dto.cashVehicle } : {}),
          ...(dto.firstRegisteredOn !== undefined
            ? { firstRegisteredOn: toDateOnlyOrNull(dto.firstRegisteredOn) }
            : {}),
          ...(dto.offerDate !== undefined
            ? { offerDate: toDateOnlyOrNull(dto.offerDate) }
            : {}),
          ...(dto.soldDate !== undefined ? { soldDate: toDateOnlyOrNull(dto.soldDate) } : {}),
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
