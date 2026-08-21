import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './current-user.decorator';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // 토큰에 담긴 role을 그대로 믿지 않고 매 요청마다 DB에서 다시 읽는다.
  // 퇴사 처리하거나 권한을 내렸을 때 기존 토큰이 계속 통하는 걸 막기 위함.
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, role: true, active: true },
    });

    if (!employee || !employee.active) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    return { id: employee.id, name: employee.name, role: employee.role };
  }
}
