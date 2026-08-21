import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Employee, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto, LoginDto, SocialLoginDto } from './dto/login.dto';

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    name: string;
    position: string;
    role: Role;
    provider: AuthProvider | null;
    linked: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private issue(employee: Employee): LoginResult {
    return {
      accessToken: this.jwt.sign({ sub: employee.id }),
      user: {
        id: employee.id,
        name: employee.name,
        position: employee.position,
        role: employee.role,
        provider: employee.provider,
        linked: true,
      },
    };
  }

  /** 관리자 계정 로그인 */
  async login({ loginId, password }: LoginDto): Promise<LoginResult> {
    const employee = await this.prisma.employee.findUnique({ where: { loginId } });

    // 아이디가 틀렸는지 비밀번호가 틀렸는지 구분해서 알려주지 않는다(계정 존재 여부 노출 방지).
    if (!employee?.passwordHash || !(await bcrypt.compare(password, employee.passwordHash))) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    if (!employee.active) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    return this.issue(employee);
  }

  /**
   * 소셜 로그인.
   *
   * 이미 사내 직원과 연결된 소셜 계정이면 바로 토큰을 주고,
   * 처음 들어온 계정이면 linked:false 로 돌려보내 직원 연결 단계를 태운다.
   */
  async socialLogin(dto: SocialLoginDto): Promise<LoginResult | { linked: false; pendingToken: string }> {
    const provider = dto.provider as AuthProvider;
    const employee = await this.prisma.employee.findUnique({
      where: { provider_providerId: { provider, providerId: dto.providerId } },
    });

    if (employee) {
      if (!employee.active) throw new UnauthorizedException('사용할 수 없는 계정입니다.');
      return this.issue(employee);
    }

    // 아직 직원과 연결 안 된 소셜 계정 — 연결 단계에서만 쓸 수 있는 단기 토큰을 준다.
    const pendingToken = this.jwt.sign(
      { provider, providerId: dto.providerId, name: dto.name, pending: true },
      { expiresIn: '10m' },
    );
    return { linked: false, pendingToken };
  }

  /** 소셜 계정을 사내 직원과 연결 */
  async linkEmployee(pendingToken: string, employeeId: string): Promise<LoginResult> {
    let payload: { provider: AuthProvider; providerId: string; pending?: boolean };
    try {
      payload = this.jwt.verify(pendingToken);
    } catch {
      throw new UnauthorizedException('연결 시간이 만료되었습니다. 다시 로그인해 주세요.');
    }
    if (!payload.pending) throw new BadRequestException('잘못된 요청입니다.');

    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
    if (employee.providerId) {
      throw new BadRequestException('이미 다른 소셜 계정과 연결된 직원입니다.');
    }

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { provider: payload.provider, providerId: payload.providerId },
    });
    return this.issue(updated);
  }

  async changePassword(employeeId: string, dto: ChangePasswordDto): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee?.passwordHash) {
      throw new BadRequestException('비밀번호를 쓰지 않는 계정입니다.');
    }
    if (!(await bcrypt.compare(dto.currentPassword, employee.passwordHash))) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });
  }

  async me(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        role: true,
        provider: true,
        phones: { select: { number: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!employee) throw new NotFoundException('계정을 찾을 수 없습니다.');
    return { ...employee, phones: employee.phones.map((p) => p.number) };
  }
}
