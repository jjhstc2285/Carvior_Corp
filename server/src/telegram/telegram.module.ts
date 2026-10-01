import { request as httpsRequest } from 'node:https';
import { resolve4 } from 'node:dns/promises';
import { Controller, Global, Injectable, Logger, Module, OnModuleInit, Post } from '@nestjs/common';
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

const HOST = 'api.telegram.org';

/**
 * 이름을 못 찾을 때 두드려 볼 주소.
 *
 * 텔레그램이 공개한 대역의 대표 주소들이다. 이름 풀이가 막히는 상자가 있어 마지막 수단으로
 * 둔다 — 주소는 바뀔 수 있으니 이름이 풀리면 그쪽이 먼저다.
 */
const FALLBACK_IPS = ['149.154.167.220', '149.154.175.50', '149.154.165.120'];

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  /** 지난번에 통한 주소 — 다음부터 먼저 두드린다 */
  private lastGoodIp: string | null = null;

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
   * 뜰 때 한 줄 남긴다.
   *
   * 설정이 비어 있으면 공지는 아무 말 없이 안 나간다 — 일하다 멈추면 안 되니 그렇게 짰다.
   * 그런데 그래서 방이 끊긴 건지, 열쇠가 빠진 건지, 보낼 일이 없었던 건지 구분할 길이
   * 없었다. 뜰 때 어느 쪽인지 적어두면 로그 한 줄로 갈린다.
   *
   * 토큰은 안 적는다 — 로그는 여럿이 본다. 방 번호는 어느 방인지 가리는 값이라 적는다.
   */
  onModuleInit(): void {
    if (this.configured) {
      this.logger.log(`공지방 연결됨 — 방 ${this.chatId}`);
    } else {
      this.logger.warn('공지방이 설정되지 않았습니다(.env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). 공지는 나가지 않습니다.');
    }
  }

  /**
   * 방에 한 줄 띄운다.
   *
   * 기다리지 않는다 — 부르는 쪽은 차를 고치거나 파는 중이고, 텔레그램이 느리다고 그
   * 일이 멈추면 안 된다. 실패는 로그에만 남긴다.
   */
  notify(text: string): void {
    if (!this.configured || !text.trim()) return;
    void this.send(text).catch((e: Error) => {
      /*
        'fetch failed' 만 적으면 왜 못 갔는지 알 수 없다.

        노드는 진짜 이유를 cause 에 숨겨 둔다 — 주소를 못 찾았는지(ENOTFOUND), 길이 없는지
        (EHOSTUNREACH), 막혔는지(ECONNREFUSED)가 거기 있다. 그게 있어야 네트워크를 볼지
        열쇠를 볼지 갈린다.
      */
      const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
      const why = cause?.code ?? cause?.message ?? '';
      this.logger.warn(`공지를 보내지 못했습니다(방 ${this.chatId}): ${e.message}${why ? ` — ${why}` : ''}`);
    });
  }

  /**
   * 방에 보낸다.
   *
   * fetch 를 안 쓴다. 같은 상자에서 curl 로는 붙는데(302) fetch 만 ETIMEDOUT 으로 죽었다 —
   * 프록시도 없고 IPv4 우선도 걸어 뒀는데도 그랬다. 무엇이 다른지 더 파기보다, 오래
   * 검증된 https 모듈로 직접 말한다.
   *
   * 주소도 우리가 찾는다. 텔레그램은 IP 를 여럿 두는데 그중 하나가 막혀 있으면 그 하나만
   * 잡고 죽을 이유가 없다 — 찾아둔 주소를 차례로 두드려 되는 곳으로 보낸다. 되는 주소는
   * 기억해 두고 다음부터 먼저 쓴다(매번 다 두드리면 공지가 느려진다).
   */
  private async send(text: string): Promise<void> {
    const body = JSON.stringify({
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      // 링크 미리보기가 뜨면 짧은 알림이 화면 반을 차지한다
      disable_web_page_preview: true,
    });

    const ips = await this.addresses();
    let last: Error | null = null;
    for (const ip of ips) {
      try {
        await this.post(ip, body);
        this.lastGoodIp = ip;
        return;
      } catch (e) {
        last = e as Error;
      }
    }
    throw last ?? new Error('보낼 주소를 찾지 못했습니다');
  }

  /** 되는 주소를 앞에 두고 나머지를 뒤에 붙인다 */
  private async addresses(): Promise<string[]> {
    const found = await resolve4(HOST).catch(() => [] as string[]);
    const all = found.length > 0 ? found : FALLBACK_IPS;
    if (!this.lastGoodIp) return all;
    return [this.lastGoodIp, ...all.filter((ip) => ip !== this.lastGoodIp)];
  }

  /**
   * 주소 하나로 보낸다.
   *
   * 주소로 붙되 이름은 텔레그램 것으로 말한다(Host 와 TLS 이름). 안 그러면 저쪽이 어느
   * 집을 찾는지 몰라 끊는다.
   */
  private post(ip: string, body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          host: ip,
          port: 443,
          // TLS 가 볼 이름 — 주소로 붙었으니 이름은 따로 알려줘야 한다
          servername: HOST,
          path: `/bot${this.token}/sendMessage`,
          method: 'POST',
          headers: {
            host: HOST,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
          /* 공지는 늦으면 쓸모가 없다 — 8초를 넘기면 다음 주소로 넘어간다 */
          timeout: 8000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              resolve();
              return;
            }
            reject(new Error(`${status} ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`${ip} 응답 없음(8초)`)));
      req.on('error', (e: Error) => reject(new Error(`${ip} ${e.message}`)));
      req.end(body);
    });
  }

  /**
   * 잘 붙었는지 한 번 보내 본다.
   *
   * 실패를 던지지 않는다 — 던지면 화면에는 '서버 오류'만 뜨고 정작 왜 못 갔는지가 묻힌다.
   * 이 단추를 누르는 까닭이 그 이유를 보려는 것이라, 이유를 담아 돌려준다.
   */
  async test(): Promise<{ sent: boolean; reason?: string }> {
    if (!this.configured) {
      return { sent: false, reason: '서버에 봇 토큰이나 방 번호가 없습니다(.env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).' };
    }
    try {
      await this.send('🔔 애니원모터스 통합관리 — 공지방이 연결되었습니다.');
      return { sent: true };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const why = err.cause?.code ?? err.cause?.message ?? '';
      return { sent: false, reason: `${err.message}${why ? ` — ${why}` : ''}` };
    }
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
