import { Controller, Global, Injectable, Logger, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

/**
 * 텔레그램 공지방.
 *
 * 차가 팔렸는지, 상품화가 끝났는지, 어느 주차장에 새로 들어왔는지 — 지금은 이런 걸
 * 화면에 들어가 봐야 안다. 매입팀이 상품화를 끝내도 상담 받는 사람은 모르고, 차가
 * 팔려도 주차 옮기는 사람은 모른다. 그래서 같은 걸 카톡으로 다시 묻는다.
 *
 * 일이 벌어질 때 방에 한 줄 띄운다. 알림이 흔해지면 안 보게 되므로 '누가 봐도 알아야
 * 하는 것'만 보낸다 — 금액·정산·인건비·결재처럼 자리에 따라 가려야 하는 것은 보내지
 * 않는다. 이 방은 전 직원이 본다.
 *
 * 보내다 실패해도 하던 일은 그대로 간다. 차를 파는 일이 알림 때문에 막히면 안 된다.
 */

const API = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly config: ConfigService) {}

  private get token() {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  private get chatId() {
    return this.config.get<string>('TELEGRAM_CHAT_ID', '');
  }

  get configured() {
    return !!this.token && !!this.chatId;
  }

  /**
   * 방에 한 줄 띄운다.
   *
   * 기다리지 않는다 — 부르는 쪽은 차를 고치거나 파는 중이고, 텔레그램이 느리다고 그
   * 일이 멈추면 안 된다. 실패는 로그에만 남긴다.
   */
  notify(text: string): void {
    if (!this.configured || !text.trim()) return;
    void this.send(text).catch((e: Error) => this.logger.warn(`공지를 보내지 못했습니다: ${e.message}`));
  }

  private async send(text: string): Promise<void> {
    const res = await fetch(`${API}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        // 링크 미리보기가 뜨면 짧은 알림이 화면 반을 차지한다
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
  }

  /** 잘 붙었는지 한 번 보내 본다 */
  async test(): Promise<{ sent: boolean }> {
    if (!this.configured) return { sent: false };
    await this.send('🔔 애니원모터스 통합관리 — 공지방이 연결되었습니다.');
    return { sent: true };
  }
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** 연결 확인 — 관리자만 */
  @Roles(Role.ADMIN)
  @Post('test')
  test() {
    return this.telegram.test();
  }
}

/**
 * 어디서든 부를 수 있게 전역으로 둔다.
 *
 * 알릴 거리는 차량·주차·상담 등 여러 곳에서 생긴다. 모듈마다 가져다 쓰게 엮으면
 * import 줄만 늘고, 새로 알릴 곳이 생길 때마다 배선을 다시 해야 한다.
 */
@Global()
@Module({ controllers: [TelegramController], providers: [TelegramService], exports: [TelegramService] })
export class TelegramModule {}
