import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 경로 — 서비스워커가 이 값으로 창을 띄운다 */
  url?: string;
  /** 같은 tag의 알림은 덮어쓴다(같은 대화 알림이 쌓이지 않게) */
  tag?: string;
}

/**
 * 웹 푸시 발송.
 *
 * 브라우저를 닫아둔 사람에게도 알림을 보내는 유일한 방법이다(socket.io는 열려 있어야 한다).
 *
 * VAPID 키가 없으면 기능만 꺼진 채로 동작한다 — 키가 없다고 서버가 안 뜨면
 * 알림과 무관한 나머지 기능까지 같이 죽는다.
 *   키 생성: npx web-push generate-vapid-keys
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    // mailto: 또는 https: 형태여야 한다(푸시 서비스가 문제 생겼을 때 연락할 주소).
    const subject = this.config.get<string>('VAPID_SUBJECT', 'mailto:admin@skv1motors.com');

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID 키가 없어 웹 푸시를 끕니다. 켜려면 .env에 VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY를 넣으세요.');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.enabled = true;
    this.logger.log('웹 푸시 준비 완료');
  }

  /** 브라우저가 구독할 때 필요한 공개키. 꺼져 있으면 빈 값을 주고 프론트가 UI를 감춘다. */
  status(): { enabled: boolean; publicKey: string } {
    return { enabled: this.enabled, publicKey: this.publicKey };
  }

  /** 같은 기기(endpoint)로 다시 구독하면 갱신한다 — 계정을 바꿔 로그인한 경우 소유자도 옮긴다. */
  async subscribe(
    employeeId: string,
    dto: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        employeeId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
      update: {
        employeeId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
    });
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  /**
   * 여러 직원에게 발송. 실패는 삼킨다 — 푸시가 안 갔다고 원래 작업(알림 생성·메시지 전송)을
   * 되돌릴 이유가 없다. 죽은 구독(404/410)은 이때 정리한다.
   *
   * 절대 예외를 던지지 않으므로 호출부에서 await 없이 `void`로 흘려보내도 안전하다
   * (발송에 수백 ms가 걸릴 수 있어 요청을 붙잡아 둘 이유가 없다).
   */
  async sendToEmployees(employeeIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || employeeIds.length === 0) return;
    try {
      await this.deliver(employeeIds, payload);
    } catch (e) {
      this.logger.warn(`푸시 발송 중 오류: ${(e as Error).message}`);
    }
  }

  private async deliver(employeeIds: string[], payload: PushPayload): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { employeeId: { in: employeeIds } },
    });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 410 Gone / 404 Not Found — 사용자가 알림을 껐거나 브라우저 데이터를 지웠다.
          if (status === 410 || status === 404) dead.push(sub.endpoint);
          else this.logger.warn(`푸시 발송 실패(${status ?? '알 수 없음'}): ${sub.endpoint.slice(0, 60)}…`);
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
      this.logger.log(`만료된 구독 ${dead.length}건 정리`);
    }

    await this.prisma.pushSubscription.updateMany({
      where: { endpoint: { in: subscriptions.map((s) => s.endpoint).filter((e) => !dead.includes(e)) } },
      data: { lastUsedAt: new Date() },
    });
  }
}
