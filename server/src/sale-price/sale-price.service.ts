import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { TelegramService } from '../telegram/telegram.module';
import { saleCardText, type SaleCard } from './sale-price-card';

/**
 * 차가 얼마에 나갔나 — 한 값, 네 자리.
 *
 * 같은 숫자를 네 곳에 적는다:
 *
 *   상담 등록          차량판매가        Consultation.salePrice
 *   제시 금융          매도금액          ManagedVehicle.salePrice
 *   알선·수출 정산     실 차량판매가     BrokerageSettlement.realSalePrice
 *   매입 정산          차량판매가        PurchaseSettlement.salePrice
 *
 * 적는 사람이 다 다르다. TM 이 전화로 듣고, 사무장이 제시 금융에서 보고, 알선팀이
 * 정산에 적고, 계약팀이 매입 정산에 적는다. 그래서 화면마다 다른 숫자가 떴고,
 * 어느 쪽이 맞는지 아무도 몰랐다.
 *
 * 한 곳에 적으면 나머지 셋에 그대로 들어간다. 나중에 적은 사람이 이긴다 —
 * 가장 최근에 그 차를 본 사람이 아는 값이고, 못 고치게 막으면 틀린 채로 남는다.
 *
 * 실차주입금(ownerDeposit)은 안 건드린다. 그건 세금을 떼고 실제로 들어온 돈이라
 * 차가 나간 값과 다른 숫자다 — 알선 정산 화면도 둘을 따로 받는다. 덮어쓰면 수수료가
 * 어긋난다.
 */

/** 어느 화면에서 적었나 — 적은 자리는 다시 안 건드린다 */
export type SalePriceSource = 'consultation' | 'vehicle' | 'brokerage' | 'purchase';

/** 방에 띄울 때 쓰는 이름 — 'vehicle' 이라고 적으면 아무도 못 알아본다 */
const SOURCE_LABEL: Record<SalePriceSource, string> = {
  consultation: '상담 등록',
  vehicle: '제시 금융',
  brokerage: '알선·수출 정산',
  purchase: '매입 정산',
};

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * 적은 값을 나머지 세 곳에 퍼뜨린다.
   *
   * 차량번호는 손으로 적는 값이라 띄어쓰기가 섞여 들어온다 — 정리한 꼴로도 찾는다.
   * 이미 같은 값이면 아무것도 안 한다. 그래서 몇 번을 불러도 결과가 같다.
   *
   * 0 은 안 퍼뜨린다. 아직 안 적은 칸을 지우는 일이 되어서, 한 사람이 빈칸으로 저장하면
   * 다른 세 곳에 적어 둔 값이 같이 날아간다.
   */
  async spread(
    vehicleNumber: string,
    amount: number,
    from: SalePriceSource,
    opts: {
      /*
        방에 띄울 것인가.

        돌면서 빈칸을 채울 때는 안 띄운다. 쌓여 있는 백 대를 한 바퀴에 채우는데 그때마다
        쪽지가 가면 방이 백 줄로 덮인다 — 사람이 고친 것만 알린다.
      */
      announce?: boolean;
      /*
        고치기 전 값(원).

        제시 금융에서 적으면 그 차는 이미 저장된 뒤에 여기로 온다 — 그때 차량 관리를
        읽어 '전 값'으로 삼으면 방금 적은 값이 나와서 "안 바뀌었다"가 된다. 그래서
        부르는 쪽이 알고 있으면 넘겨 준다.
      */
      before?: number;
    } = {},
  ): Promise<SpreadResult> {
    if (!vehicleNumber || amount <= 0) return EMPTY;
    const plates = this.platesOf(vehicleNumber);
    if (plates.length === 0) return EMPTY;

    const announce = opts.announce !== false;
    const done = { ...EMPTY };
    try {
      /* 바뀐 게 있을 때만 알린다 — 같은 값을 다시 저장해도 쪽지가 가면 안 된다 */
      const before =
        opts.before !== undefined
          ? { salePrice: opts.before }
          : await this.prisma.managedVehicle.findFirst({
              where: { vehicleNumber: { in: plates } },
              select: { salePrice: true },
            });
      const changed = !before || before.salePrice !== amount;
      if (from !== 'vehicle') done.vehicle = await this.writeVehicle(plates, amount);
      if (from !== 'purchase') done.purchase = await this.writePurchase(plates, amount);
      if (from !== 'brokerage') done.brokerage = await this.writeBrokerage(plates, amount);
      if (from !== 'consultation') done.consultation = await this.writeConsultation(plates, amount);

      const moved = done.vehicle + done.purchase + done.brokerage + done.consultation;
      if (moved > 0) {
        this.logger.log(`${vehicleNumber} 판매가 ${amount.toLocaleString()}원을 ${moved}곳에 맞췄습니다(${from}에서).`);
      }
      if (announce && changed) await this.announce(plates, amount, from);
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
      // 백 대를 한 바퀴에 채운다 — 그때마다 쪽지가 가면 방이 덮인다
      const done = await this.spread(plate, amount, from, { announce: false });
      filled += done.vehicle + done.purchase + done.brokerage + done.consultation;
    }
    return { filled, conflicts };
  }

  /**
   * 입금확인방에 쪽지를 띄운다.
   *
   * 지금은 사람이 손으로 친다. 담당자·차량번호·차량명·매입가·광고가·코드가를 여덟 줄로
   * 적는데, 값을 고치고 나서 다시 올리는 걸 잊으면 방에 뜬 숫자와 시스템 숫자가 달라진다
   * — 그 방을 보고 입금을 넣는 자리다.
   *
   * 공지방이 아니라 입금확인방으로 간다. 공지방은 전 직원이 보는 자리라 금액을 안 보낸다.
   *
   * 못 띄워도 값은 이미 들어갔다 — 알림 때문에 저장이 막히면 안 된다.
   */
  private async announce(plates: string[], amount: number, from: SalePriceSource): Promise<void> {
    try {
      const card = await this.cardOf(plates, amount, from);
      if (card) this.telegram.notifySale(saleCardText(card));
    } catch (e) {
      this.logger.warn(`판매가 쪽지를 못 만들었습니다: ${(e as Error).message}`);
    }
  }

  /**
   * 쪽지에 들어갈 것을 모은다.
   *
   * 차명은 차량 관리가 먼저다 — 거기가 트림까지 적힌 이름이다. 없으면 정산·상담 순으로 쓴다.
   * 담당자와 유입 경로는 상담에서 온다. 판 건(계약·판매완료)이 먼저고, 없으면 가장 최근
   * 상담이다 — 문의만 하고 만 상담의 담당자를 '판 사람'으로 적으면 안 된다.
   */
  private async cardOf(plates: string[], amount: number, from: SalePriceSource): Promise<SaleCard | null> {
    const [vehicle, purchase, consultations] = await Promise.all([
      this.prisma.managedVehicle.findFirst({
        where: { vehicleNumber: { in: plates } },
        select: { vehicleNumber: true, vehicleModel: true },
      }),
      this.prisma.purchaseSettlement.findFirst({
        where: { vehicleNumber: { in: plates } },
        orderBy: { date: 'desc' },
        select: { vehicleName: true, purchasePrice: true, transferFee: true, employee: { select: { name: true } } },
      }),
      this.prisma.consultation.findMany({
        where: { vehicleNumber: { in: plates } },
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        select: {
          vehicleName: true,
          platform: true,
          status: true,
          outsideDealer: true,
          employee: { select: { name: true } },
        },
      }),
    ]);

    const sold = consultations.find((c) => c.status === 'SOLD' || c.status === 'CONTRACTED');
    const lead = sold ?? consultations[0] ?? null;
    const plate = vehicle?.vehicleNumber ?? plates[0];
    if (!plate) return null;

    return {
      // 타사·기타는 우리 직원이 아니다 — 담당자 자리에 남의 딜러·상사 이름이 적혀 있다
      dealer: (lead?.outsideDealer ?? '').trim() || lead?.employee?.name || purchase?.employee?.name || '',
      vehicleNumber: plate,
      vehicleName: vehicle?.vehicleModel || purchase?.vehicleName || lead?.vehicleName || '',
      purchasePrice: purchase?.purchasePrice ?? 0,
      transferFee: purchase?.transferFee ?? 0,
      salePrice: amount,
      platform: (lead?.platform ?? '').trim(),
      from: SOURCE_LABEL[from],
    };
  }

  /** 알선·수출 정산이 말하는 판매가 — 실 차량판매가가 먼저고, 없으면 들어온 돈으로 본다 */
  brokerageAmount(row: {
    realSalePrice: number;
    ownerDeposit: number;
    etcCost: number;
    totalSaleAmount: number;
  }): number {
    if (row.realSalePrice > 0) return row.realSalePrice;
    // 실차주입금은 세금을 떼고 들어온 돈이라 판매가보다 적다 — 차대금업 몫을 같이 더한다
    if (row.ownerDeposit > 0) return row.ownerDeposit + row.etcCost;
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
   * 알선·수출 정산의 실 차량판매가에 넣는다.
   *
   * 실차주입금은 안 건드린다 — 세금을 떼고 실제로 들어온 돈이라 다른 숫자다.
   */
  private async writeBrokerage(plates: string[], amount: number): Promise<number> {
    const { count } = await this.prisma.brokerageSettlement.updateMany({
      where: { vehicleNumber: { in: plates }, realSalePrice: { not: amount } },
      data: { realSalePrice: amount },
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
