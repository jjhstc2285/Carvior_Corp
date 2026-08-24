import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 래퍼.
 *
 * 지금은 캐시/세션 용도로만 쓰지만, 나중에 BullMQ(작업 큐)나 소켓 pub/sub을 붙일 때
 * 이 커넥션을 그대로 재사용하면 된다.
 *
 * 여기 있는 값은 전부 '있으면 빠르고 없으면 DB에서 다시 읽으면 그만'인 것들이다.
 * 그래서 레디스가 죽어도 예외를 위로 올리지 않는다 — 캐시가 죽었다고 직원 목록 조회가
 * 500을 뱉으면 캐시를 안 쓰느니만 못하다.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  /** 지금 레디스를 못 쓰는 상태인가 — 재시도마다 같은 줄을 찍지 않으려고 들고 있는다. */
  private degraded = false;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // 레디스가 잠깐 죽어도 API 전체가 멈추지 않게 재시도 간격을 짧게 둔다.
      retryStrategy: (times) => Math.min(times * 200, 3000),
      maxRetriesPerRequest: 3,
      // 끊겨 있는 동안 명령을 쌓아두지 않는다. 쌓아두면 재연결될 때까지 요청이 붙잡히는데,
      // 캐시는 기다릴 값어치가 없다 — 바로 실패시키고 DB로 가는 편이 빠르다.
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => this.markDegraded(err.message));
    this.client.on('connect', () => {
      this.degraded = false;
      this.logger.log('Redis 연결됨');
    });
  }

  /** 못 읽으면 '캐시 없음'으로 친다(값이 깨져 있어도 마찬가지 — 어차피 다시 채운다). */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      this.markDegraded((e as Error).message);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      if (ttlSeconds) await this.client.set(key, raw, 'EX', ttlSeconds);
      else await this.client.set(key, raw);
    } catch (e) {
      this.markDegraded((e as Error).message);
    }
  }

  /**
   * 삭제 실패는 '오래된 값이 TTL까지 남는다'는 뜻이라 읽기 실패보다 성가시다.
   * 그래도 예외를 올리지는 않는다 — 데이터를 바꾸는 작업 자체는 이미 성공했기 때문이다.
   */
  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.client.del(...keys);
    } catch (e) {
      this.markDegraded((e as Error).message);
    }
  }

  /** 접두사로 시작하는 키를 전부 지운다(목록 캐시 무효화용). */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.client.scanStream({ match: `${prefix}*`, count: 200 });
      for await (const keys of stream) {
        if ((keys as string[]).length) await this.client.del(...(keys as string[]));
      }
    } catch (e) {
      this.markDegraded((e as Error).message);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // 이미 끊겨 있으면 quit도 실패한다 — 종료를 막을 이유는 없다.
      this.client.disconnect();
    }
  }

  /** 끊긴 동안 초당 한 줄씩 쌓이지 않게, 상태가 바뀔 때만 남긴다. */
  private markDegraded(message: string): void {
    if (this.degraded) return;
    this.degraded = true;
    this.logger.error(`Redis 연결 오류: ${message} — 캐시 없이 DB로만 동작합니다.`);
  }
}
