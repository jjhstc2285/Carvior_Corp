import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { SignOptions } from 'jsonwebtoken';
import { RealtimeGateway } from './realtime.gateway';

/**
 * 실시간 채널. 소켓 인증에 HTTP와 같은 JWT를 쓰므로 JwtModule 설정도 같아야 한다.
 * (AuthModule을 통째로 가져오면 순환 참조가 생겨서 JwtModule만 같은 설정으로 등록한다)
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as SignOptions['expiresIn'] },
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
