import { setDefaultResultOrder } from 'node:dns';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module';

/*
  바깥으로 나갈 때 IPv4 를 먼저 쓴다.

  노드 18부터는 DNS가 준 차례 그대로 쓴다. 텔레그램(api.telegram.org)은 IPv6 주소를 같이
  주는데 이 상자에는 IPv6 길이 없어서, 그 주소를 먼저 잡으면 연결이 통째로 실패한다 —
  로그에는 이유 없이 'fetch failed' 한 줄만 남는다. 카비어처럼 IPv4만 있는 곳은 멀쩡해서
  "텔레그램만 안 된다"로 보인다.

  IPv4를 먼저 보게 하면 그 길로 나간다. IPv6를 쓰게 되는 날에는 이 줄을 빼면 된다.
*/
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Apache 뒤에 있으므로 클라이언트 실제 IP를 X-Forwarded-For에서 읽는다.
  // (출근 등록 IP 화이트리스트가 이 값을 쓴다 — 안 켜면 전부 127.0.0.1로 보인다)
  app.set('trust proxy', 1);

  /*
    응답을 눌러서 보낸다.

    목록 하나에 표를 통째로 담아 보내는 화면이 있어 JSON이 크다. 그대로 보내면 그만큼
    회선과 메모리를 쓰는데, JSON은 눌리는 비율이 커서(열에 하나쯤으로 준다) 이 한 줄이
    제일 싸게 먹히는 자리다. 작은 응답은 눌러봐야 손해라 건드리지 않는다.
  */
  app.use(compression({ threshold: 1024 }));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 필드는 잘라낸다
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  const port = config.get<number>('PORT', 3000);
  // Apache가 127.0.0.1로 프록시하므로 외부에 직접 노출하지 않는다.
  await app.listen(port, '127.0.0.1');
  new Logger('Bootstrap').log(`API 서버 실행 중 — http://127.0.0.1:${port}/api`);
}

void bootstrap();
