import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module';

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
