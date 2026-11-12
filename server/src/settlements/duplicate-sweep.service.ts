import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 같은 차가 두 줄씩 쌓인 매입 정산을 치운다.
 *
 * 담당자 목록에 매입 뛰는 사람(안원용·이우주)이 없었다. 적어 놓고도 자기 이름으로 안
 * 잡히니 "안 들어갔나" 하고 또 적었고, 같은 차가 두 줄 세 줄이 됐다. 목록은 고쳤지만
 * 이미 쌓인 줄은 사람이 하나씩 찾아 지워야 한다 — 백 줄을 눈으로 맞춰 보는 일이다.
 *
 * 바로 안 지운다. 하루 동안 줄을 그어 두고 보여 준 다음에 지운다. 지우고 나서
 * "그거 살아 있는 건이었는데"는 되돌릴 데가 없다.
 */

/** 줄을 긋고 지우기까지 두는 시간 */
const GRACE_HOURS = 24;

/**
 * 되사온 차는 중복이 아니다.
 *
 * 팔았다 다시 사오는 일이 있다. 그때는 같은 번호로 두 줄이 맞다 — 매입 관리도 같은
 * 자로 본다(findRecentSame, 90일). 그보다 멀리 떨어진 줄은 안 건드린다.
 */
const SAME_WITHIN_DAYS = 90;

@Injectable()
export class DuplicateSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuplicateSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // 뜨자마자 한 번, 그 뒤로 한 시간마다. 하루 짜리 유예라 분 단위로 볼 일이 아니다
    setTimeout(() => void this.run(), 20_000);
    this.timer = setInterval(() => void this.run(), 60 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ marked: number; removed: number }> {
    const removed = await this.removeExpired();
    const marked = await this.markDuplicates();
    if (marked > 0 || removed > 0) {
      this.logger.log(`매입 정산 중복 — ${marked}줄에 줄을 긋고, 기한이 지난 ${removed}줄을 지웠습니다.`);
    }
    return { marked, removed };
  }

  /** 기한이 지난 줄을 지운다 — 명세는 FK Cascade 로 같이 사라진다 */
  private async removeExpired(): Promise<number> {
    const due = await this.prisma.purchaseSettlement.findMany({
      where: { deleteAt: { lt: new Date() }, keepRow: false },
      select: { id: true, vehicleNumber: true, date: true },
    });
    if (due.length === 0) return 0;
    for (const r of due) {
      // 무엇을 지웠는지 한 줄씩 남긴다 — 나중에 "그 줄 어디 갔냐"를 받을 자리다
      this.logger.log(`중복 매입 정산 삭제: ${r.vehicleNumber} (${r.date.toISOString().slice(0, 10)})`);
    }
    const done = await this.prisma.purchaseSettlement.deleteMany({
      where: { id: { in: due.map((r) => r.id) } },
    });
    return done.count;
  }

  /**
   * 중복을 찾아 줄을 긋는다.
   *
   * 한 차에 여러 줄이면 하나만 남긴다. 남길 줄은 '더 많이 적힌 줄'이다 — 승인이 찍혔나,
   * 결재를 올렸나, 상품화 명세가 몇 줄인가, 판매가를 적었나, 그러고도 같으면 먼저 만든 줄.
   *
   * 승인이 찍힌 줄은 어느 쪽이든 안 지운다. 결재가 끝난 숫자를 뒤에서 치우면 안 된다.
   */
  private async markDuplicates(): Promise<number> {
    const rows = await this.prisma.purchaseSettlement.findMany({
      select: {
        id: true,
        vehicleNumber: true,
        date: true,
        salePrice: true,
        purchasePrice: true,
        submittedAt: true,
        chiefApprovedAt: true,
        ceoApprovedAt: true,
        createdAt: true,
        deleteAt: true,
        keepRow: true,
        _count: { select: { prepCosts: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byPlate = new Map<string, typeof rows>();
    for (const r of rows) {
      const plate = normalizePlate(r.vehicleNumber);
      if (!plate) continue;
      const list = byPlate.get(plate);
      if (list) list.push(r);
      else byPlate.set(plate, [r]);
    }

    const doomed: string[] = [];
    for (const list of byPlate.values()) {
      if (list.length < 2) continue;
      /*
        가까운 날짜끼리만 묶는다.

        팔았다 되사온 차는 같은 번호로 두 줄이 맞다. 매입 관리와 같은 자(90일)를 쓴다.
      */
      for (const group of this.groupByNearDate(list)) {
        if (group.length < 2) continue;
        const keep = [...group].sort((a, b) => this.richness(b) - this.richness(a))[0];
        for (const r of group) {
          if (r.id === keep.id) continue;
          if (r.keepRow) continue;
          // 승인이 찍힌 줄은 안 지운다 — 결재가 끝난 숫자를 뒤에서 치우면 안 된다
          if (r.chiefApprovedAt || r.ceoApprovedAt) continue;
          if (r.deleteAt) continue;
          doomed.push(r.id);
        }
      }
    }
    if (doomed.length === 0) return 0;

    const at = new Date(Date.now() + GRACE_HOURS * 3600_000);
    const done = await this.prisma.purchaseSettlement.updateMany({
      where: { id: { in: doomed } },
      data: { deleteAt: at },
    });
    return done.count;
  }

  /** 90일 안에 붙어 있는 것끼리 묶는다 — 날짜 순으로 훑으며 끊는다 */
  private groupByNearDate<T extends { date: Date }>(list: T[]): T[][] {
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    const out: T[][] = [];
    let bucket: T[] = [];
    for (const r of sorted) {
      const last = bucket[bucket.length - 1];
      const far = last && (r.date.getTime() - last.date.getTime()) / 86_400_000 > SAME_WITHIN_DAYS;
      if (!last || !far) {
        bucket.push(r);
        continue;
      }
      out.push(bucket);
      bucket = [r];
    }
    if (bucket.length > 0) out.push(bucket);
    return out;
  }

  /** 얼마나 많이 적힌 줄인가 — 큰 쪽을 남긴다 */
  private richness(r: {
    ceoApprovedAt: Date | null;
    chiefApprovedAt: Date | null;
    submittedAt: Date | null;
    salePrice: number;
    purchasePrice: number;
    createdAt: Date;
    _count: { prepCosts: number };
  }): number {
    return (
      (r.ceoApprovedAt ? 100_000 : 0) +
      (r.chiefApprovedAt ? 50_000 : 0) +
      (r.submittedAt ? 20_000 : 0) +
      r._count.prepCosts * 1_000 +
      (r.salePrice > 0 ? 500 : 0) +
      (r.purchasePrice > 0 ? 100 : 0) +
      // 그래도 같으면 먼저 만든 줄 — 뒤에 적은 줄이 '또 적은 줄'이다
      -Math.floor(r.createdAt.getTime() / 1_000_000_000)
    );
  }
}
