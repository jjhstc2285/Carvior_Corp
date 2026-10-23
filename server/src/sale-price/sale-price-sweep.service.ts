import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SalePriceService } from './sale-price.service';

/**
 * 빈칸을 돌면서 채운다.
 *
 * 적을 때마다 네 곳에 같이 들어가지만, 그 전에 쌓인 것은 한쪽에만 적혀 있다 —
 * 결재가 끝나 막혀 있던 91건이 그렇고, 매입 정산이 나중에 생긴 차도 그렇다.
 *
 * 누가 버튼을 눌러 줘야 맞는 숫자면 안 맞는다. 30분마다 알아서 돈다
 * (SALE_PRICE_SYNC_MINUTES, 0이면 끈다).
 *
 * 빈칸만 채운다. 한 차에 서로 다른 값이 적혀 있으면 건드리지 않고 넘어간다 —
 * 어느 쪽이 최근인지 모른 채로 한쪽을 고르면 사람이 방금 고친 값을 뒤에서 되돌리게 된다.
 */
@Injectable()
export class SalePriceSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalePriceSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  /** 한 번이 늦어지면 다음 차례와 겹친다 — 같은 줄을 두 번 고치려 든다 */
  private running = false;

  constructor(
    private readonly salePrice: SalePriceService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const minutes = Number(this.config.get<string>('SALE_PRICE_SYNC_MINUTES', '30'));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('SALE_PRICE_SYNC_MINUTES=0 — 판매가 맞추기를 끕니다.');
      return;
    }

    // 서버가 막 뜬 순간엔 DB 연결이 아직 자리를 잡는 중이라 조금 두고 시작한다
    setTimeout(() => void this.tick(), 45_000).unref?.();
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref?.();
    this.logger.log(`판매가 맞추기 ${minutes}분마다`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { filled, conflicts } = await this.salePrice.fillBlanks();
      // 채운 게 없으면 아무것도 안 적는다 — 30분마다 같은 줄을 남길 일이 아니다
      if (filled > 0) {
        this.logger.log(
          `판매가 ${filled}곳을 채웠습니다.` +
            (conflicts.length > 0 ? ` 값이 서로 다른 차 ${conflicts.length}대는 그대로 뒀습니다.` : ''),
        );
      }
    } catch (e) {
      // 못 채워도 서버는 그대로 돈다 — 다음 차례에 다시 해 본다
      this.logger.warn(`판매가를 못 맞췄습니다: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
