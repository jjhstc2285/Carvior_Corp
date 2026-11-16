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
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        role: true,
        active: true,
        tenantId: true,
      },
    });

    if (!employee || !employee.active) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    return {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      department: employee.department,
      role: employee.role,
      // 토큰이 아니라 DB에서 읽는다 — role과 같은 이유다. 상사를 옮겼는데 기존 토큰이
      // 옛 상사 자료를 계속 보는 일이 없어야 한다.
      tenantId: employee.tenantId,
    };
  }
}
