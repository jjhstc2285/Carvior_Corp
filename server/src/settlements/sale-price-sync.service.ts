import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettlementsService } from './settlements.service';

/**
 * 차량판매가가 저절로 매입 정산에 들어가게 한다.
 *
 * 옮기는 일 자체는 저장할 때 일어난다 — 알선·수출 정산을 저장하면, 상담에 판매가를
 * 적으면 그 차의 매입 정산에 꽂힌다. 그런데 그것만으로는 두 가지가 샌다.
 *
 * 하나, 매입 정산이 나중에 생기는 차가 있다. 상담을 적을 때는 옮길 데가 없었고,
 * 정산이 생긴 뒤에 상담을 다시 저장하는 사람은 없다.
 *
 * 둘, 결재가 끝난 줄은 아예 건너뛰고 있었다. 그래서 결재된 110건 중 91건이 판매가가
 * 빈 채로 남았다. 이제 그 칸은 결재 뒤에도 들어가는데, 그렇다고 지난 건이 저절로
 * 채워지지는 않는다 — 누군가 [알선 정산에서 끌어오기]를 눌러 줘야 했다. 아무도 안 누른다.
 *
 * 그래서 돌면서 훑는다. 주기는 SALE_PRICE_SYNC_MINUTES(기본 30분), 0을 주면 끈다.
 * 바뀐 게 없으면 아무것도 안 적는다 — 30분마다 로그를 남길 일이 아니다.
 *
 * 덮어쓰기는 안전하다. 같은 금액이면 아무 일도 안 하고(already), 0 으로 지우지도
 * 않는다. 그러니 몇 번을 돌아도 결과가 같다.
 */
@Injectable()
export class SalePriceSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalePriceSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  /** 한 번이 늦어지면 다음 차례와 겹친다 — 같은 줄을 두 번 고치려 든다 */
  private running = false;

  constructor(
    private readonly settlements: SettlementsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const minutes = Number(this.config.get<string>('SALE_PRICE_SYNC_MINUTES', '30'));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('SALE_PRICE_SYNC_MINUTES=0 — 차량판매가 자동 반영을 끕니다.');
      return;
    }

    // 서버가 막 뜬 순간엔 DB 연결이 아직 자리를 잡는 중이라 조금 두고 시작한다
    setTimeout(() => void this.tick(), 45_000).unref?.();
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref?.();
    this.logger.log(`차량판매가 자동 반영 ${minutes}분마다`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      /*
        알선·수출 정산이 먼저다. 돈이 오간 자리에 적힌 값이 더 정확하고, 상담 쪽은
        그 차에 정산이 있으면 알아서 비킨다.
      */
      const brokerage = await this.settlements.syncAllFromBrokerage(true);
      const consultation = await this.settlements.syncAllFromConsultations();

      const moved = brokerage.updated + consultation.updated;
      if (moved > 0) {
        this.logger.log(
          `차량판매가 ${moved}건을 매입 정산에 넣었습니다` +
            `(알선·수출 ${brokerage.updated}건 · 상담 ${consultation.updated}건).`,
        );
      }
    } catch (e) {
      // 못 옮겨도 서버는 그대로 돈다 — 다음 차례에 다시 해 본다
      this.logger.warn(`차량판매가를 옮기지 못했습니다: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
