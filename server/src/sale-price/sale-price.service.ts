import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 차가 얼마에 나갔나 — 한 값, 네 자리.
 *
 * 같은 숫자를 네 곳에 적는다:
 *
 *   상담 등록          차량판매가        Consultation.salePrice
 *   제시 금융          매도금액          ManagedVehicle.salePrice
 *   알선·수출 정산     실차주입금        BrokerageSettlement.ownerDeposit
 *   매입 정산          차량판매가        PurchaseSettlement.salePrice
 *
 * 적는 사람이 다 다르다. TM 이 전화로 듣고, 사무장이 제시 금융에서 보고, 알선팀이
 * 정산에 적고, 계약팀이 매입 정산에 적는다. 그래서 화면마다 다른 숫자가 떴고,
 * 어느 쪽이 맞는지 아무도 몰랐다.
 *
 * 한 곳에 적으면 나머지 셋에 그대로 들어간다. 나중에 적은 사람이 이긴다 —
 * 가장 최근에 그 차를 본 사람이 아는 값이고, 못 고치게 막으면 틀린 채로 남는다.
 *
 * 알선 정산에서는 실차주입금이 그 자리다. 옆에 '실 차량판매가' 칸이 따로 있지만 적는
 * 사람이 거의 안 쓴다 — 실제로 보고 적는 숫자가 실차주입금이라 그쪽에 맞춘다.
 *
 * 수수료는 안 건드린다. 실차주입금은 정산 계산에 안 들어가고(settlement.calc 가 안
 * 읽는다) 표에 그대로 보여 주는 값이라, 맞춰 넣어도 받을 돈이 바뀌지 않는다.
 *
 * 방에는 안 띄운다. 값을 고칠 때마다 입금확인방으로 쪽지가 나갔는데, 한 대를 두세 번
 * 고치면 그만큼 줄이 늘어 정작 봐야 할 입금 이야기가 밀렸다 — 맞추는 일만 한다.
 */

/** 어느 화면에서 적었나 — 적은 자리는 다시 안 건드린다 */
export type SalePriceSource = 'consultation' | 'vehicle' | 'brokerage' | 'purchase';

export interface SpreadResult {
  consultation: number;
  vehicle: number;
  brokerage: number;
  purchase: number;
}

const EMPTY: SpreadResult = { consultation: 0, vehicle: 0, brokerage: 0, purchase: 0 };

@Injectable()
export class SalePriceService {
  private readonly logger = new Logger(SalePriceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 적은 값을 나머지 세 곳에 퍼뜨린다.
   *
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로도 찾는다.
   * 이미 같은 값이면 아무것도 안 한다. 그래서 몇 번을 불러도 결과가 같다.
   *
   * 0 은 안 퍼뜨린다. 아직 안 적은 칸을 지우는 일이 되어서, 한 사람이 빈칸으로 저장하면
   * 다른 세 곳에 적어 둔 값이 같이 날아간다.
   */
  async spread(vehicleNumber: string, amount: number, from: SalePriceSource): Promise<SpreadResult> {
    if (!vehicleNumber || amount <= 0) return EMPTY;
    const plates = this.platesOf(vehicleNumber);
    if (plates.length === 0) return EMPTY;

    const done = { ...EMPTY };
    try {
      if (from !== 'vehicle') done.vehicle = await this.writeVehicle(plates, amount);
      if (from !== 'purchase') done.purchase = await this.writePurchase(plates, amount);
      if (from !== 'brokerage') done.brokerage = await this.writeBrokerage(plates, amount);
      if (from !== 'consultation') done.consultation = await this.writeConsultation(plates, amount);

      const moved = done.vehicle + done.purchase + done.brokerage + done.consultation;
      if (moved > 0) {
        this.logger.log(`${vehicleNumber} 판매가 ${amount.toLocaleString()}원을 ${moved}곳에 맞췄습니다(${from}에서).`);
      }
    } catch (e) {
      // 못 퍼뜨려도 적은 쪽은 저장된 뒤다 — 다음 바퀴에 다시 해 본다
      this.logger.warn(`${vehicleNumber} 판매가를 못 맞췄습니다: ${(e as Error).message}`);
    }
    return done;
  }

  /**
   * 빈칸만 채운다 — 돌면서 훑을 때 쓴다.
   *
   * 퍼뜨리기와 다르다. 한 차에 서로 다른 값이 적혀 있으면 건드리지 않는다. 어느 쪽이
   * 최근인지 모른 채로 한쪽을 고르면, 사람이 방금 고친 값을 뒤에서 되돌리게 된다 —
   * 그러면 "분명히 고쳤는데 되돌아간다"가 된다.
   *
   * 적힌 값이 하나뿐일 때만 나머지를 그 값으로 채운다.
   */
  async fillBlanks(): Promise<{ filled: number; conflicts: string[] }> {
    const known = new Map<string, Map<number, SalePriceSource>>();
    const add = (plate: string, amount: number, from: SalePriceSource) => {
      if (!plate || amount <= 0) return;
      const key = normalizePlate(plate);
      if (!key) return;
      const seen = known.get(key) ?? new Map<number, SalePriceSource>();
      if (!seen.has(amount)) seen.set(amount, from);
      known.set(key, seen);
    };

    const [vehicles, purchases, brokerages, consultations] = await Promise.all([
      this.prisma.managedVehicle.findMany({ select: { vehicleNumber: true, salePrice: true } }),
      this.prisma.purchaseSettlement.findMany({ select: { vehicleNumber: true, salePrice: true } }),
      this.prisma.brokerageSettlement.findMany({
        select: { vehicleNumber: true, realSalePrice: true, ownerDeposit: true, etcCost: true, totalSaleAmount: true },
      }),
      this.prisma.consultation.findMany({
        where: { salePrice: { gt: 0 } },
        select: { vehicleNumber: true, salePrice: true },
      }),
    ]);

    for (const v of vehicles) add(v.vehicleNumber, v.salePrice, 'vehicle');
    for (const p of purchases) add(p.vehicleNumber, p.salePrice, 'purchase');
    for (const b of brokerages) add(b.vehicleNumber, this.brokerageAmount(b), 'brokerage');
    for (const c of consultations) add(c.vehicleNumber, c.salePrice, 'consultation');

    let filled = 0;
    const conflicts: string[] = [];
    for (const [plate, seen] of known) {
      // 값이 둘 이상이면 어느 쪽이 맞는지 모른다 — 사람이 봐야 한다
      if (seen.size !== 1) {
        conflicts.push(plate);
        continue;
      }
      const [[amount, from]] = [...seen];
      const done = await this.spread(plate, amount, from);
      filled += done.vehicle + done.purchase + done.brokerage + done.consultation;
    }
    return { filled, conflicts };
  }

  /**
   * 알선·수출 정산이 말하는 판매가.
   *
   * 실차주입금이 먼저다 — 맞춰 넣는 자리가 거기라, 다른 칸을 먼저 보면 방금 맞춘 값이
   * 아니라 옛 값을 도로 퍼뜨리게 된다.
   *
   * 없으면 실 차량판매가, 그것도 없으면 총 진행 판매금액으로 대중을 잡는다 — 지난
   * 자료에는 실차주입금이 빈 건이 있다.
   */
  brokerageAmount(row: {
    realSalePrice: number;
    ownerDeposit: number;
    etcCost: number;
    totalSaleAmount: number;
  }): number {
    if (row.ownerDeposit > 0) return row.ownerDeposit;
    if (row.realSalePrice > 0) return row.realSalePrice;
    return row.totalSaleAmount;
  }

  /** 띄어쓰기가 섞여 들어온다 — 적힌 꼴과 정리한 꼴을 둘 다 본다 */
  private platesOf(vehicleNumber: string): string[] {
    return [...new Set([vehicleNumber.trim(), normalizePlate(vehicleNumber)])].filter(Boolean);
  }

  private async writeVehicle(plates: string[], amount: number): Promise<number> {
    const { count } = await this.prisma.managedVehicle.updateMany({
      where: { vehicleNumber: { in: plates }, salePrice: { not: amount } },
      data: { salePrice: amount },
    });
    return count;
  }

  /**
   * 매입 정산에 넣는다.
   *
   * 결재가 끝난 줄에도 넣는다. 결재가 지키는 건 우리가 얼마를 들였느냐지 얼마에
   * 팔렸느냐가 아니다 — 판매가는 찍은 뒤에 차가 팔려야 생기는 값이다.
   *
   * 같은 차를 두 번 사고팔았으면 아직 결재가 안 끝난 쪽이 이번 건이다.
   */
  private async writePurchase(plates: string[], amount: number): Promise<number> {
    const found = await this.prisma.purchaseSettlement.findMany({
      where: { vehicleNumber: { in: plates } },
      orderBy: { date: 'desc' },
      select: { id: true, salePrice: true, chiefApprovedAt: true },
    });
    const target = found.find((r) => r.chiefApprovedAt === null) ?? found[0];
    if (!target || target.salePrice === amount) return 0;
    await this.prisma.purchaseSettlement.update({ where: { id: target.id }, data: { salePrice: amount } });
    return 1;
  }

  /**
   * 알선·수출 정산의 실차주입금에 넣는다.
   *
   * '실 차량판매가' 칸은 안 건드린다. 적는 사람이 거의 안 쓰는 칸이라 거기 넣어 봐야
   * 보는 자리가 아니었고, 둘 다 쓰면 한 정산에 판매가가 두 개로 적힌다.
   */
  private async writeBrokerage(plates: string[], amount: number): Promise<number> {
    const { count } = await this.prisma.brokerageSettlement.updateMany({
      where: { vehicleNumber: { in: plates }, ownerDeposit: { not: amount } },
      data: { ownerDeposit: amount },
    });
    return count;
  }

  /**
   * 상담에 넣는다.
   *
   * 한 차에 상담이 여럿이다. 판 건이 궁금한 값이라 최근 것에 적는다 — 처음 문의한
   * 사람에게 판 게 아니다.
   */
  private async writeConsultation(plates: string[], amount: number): Promise<number> {
    const target = await this.prisma.consultation.findFirst({
      where: { vehicleNumber: { in: plates } },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      select: { id: true, salePrice: true },
    });
    if (!target || target.salePrice === amount) return 0;
    await this.prisma.consultation.update({ where: { id: target.id }, data: { salePrice: amount } });
    return 1;
  }
}
