import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 래퍼.
 *
 * 지금은 캐시/세션 용도로만 쓰지만, 나중에 BullMQ(작업 큐)나 소켓 pub/sub을 붙일 때
 * 이 커넥션을 그대로 재사용하면 된다.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // 레디스가 잠깐 죽어도 API 전체가 멈추지 않게 재시도 간격을 짧게 둔다.
      retryStrategy: (times) => Math.min(times * 200, 3000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => this.logger.error(`Redis 연결 오류: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Redis 연결됨'));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await this.client.set(key, raw, 'EX', ttlSeconds);
    else await this.client.set(key, raw);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  /** 접두사로 시작하는 키를 전부 지운다(목록 캐시 무효화용). */
  async delByPrefix(prefix: string): Promise<void> {
    const stream = this.client.scanStream({ match: `${prefix}*`, count: 200 });
    for await (const keys of stream) {
      if ((keys as string[]).length) await this.client.del(...(keys as string[]));
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
