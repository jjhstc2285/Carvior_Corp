/**
 * 시드가 DB에 직접 쓰면 서버가 들고 있는 직원 명단 캐시(5분)와 어긋난다.
 * 그 사이에 새 계정으로 로그인하면 명단에 내가 없는 상태로 화면이 그려지므로,
 * 시드 끝에 캐시를 비워준다.
 *
 * 키는 EmployeesService의 LIST_CACHE_KEY와 같아야 한다.
 */
import Redis from 'ioredis';

const LIST_CACHE_KEY = 'employees:list';

export async function invalidateEmployeeCache(tag = 'seed'): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // 없으면 붙을 때까지 계속 재시도해서 스크립트가 안 끝난다
  });

  try {
    await redis.connect();
    await redis.del(LIST_CACHE_KEY);
    console.log(`[${tag}] 직원 명단 캐시를 비웠습니다.`);
  } catch {
    // Redis가 없어도 시드 자체는 성공한 것이므로 실패로 처리하지 않는다.
    console.warn(
      `[${tag}] Redis에 연결하지 못해 명단 캐시를 못 비웠습니다.\n` +
        `        새 계정이 바로 안 보이면 5분 기다리거나 'redis-cli DEL ${LIST_CACHE_KEY}' 를 실행하세요.`,
    );
  } finally {
    redis.disconnect();
  }
}
