import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Employee, Role, SignupStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { ChangePasswordDto, LoginDto, SocialLoginDto } from './dto/login.dto';
import type { ReviewSignupDto, SignupDto } from './dto/signup.dto';
import { parseModules } from '../tenants/tenant.const';

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    name: string;
    position: string;
    role: Role;
    provider: AuthProvider | null;
    linked: boolean;
    /**
     * 소속 상사와 켜져 있는 모듈.
     *
     * 프론트가 이걸로 메뉴를 가른다 — 애니원은 22개를 다 쓰고, 신규 상사에게 주는 v1은
     * 사람·일정·소통 8개뿐이다. 코드에 상사 이름을 박지 않으려고 로그인 응답에 실어 보낸다.
     */
    tenant: {
      id: number;
      code: string;
      name: string;
      modules: string[];
    };
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  // ── 회원가입 신청 ──────────────────────────────

  /**
   * 가입 신청.
   *
   * 여기서는 Employee 를 만들지 않는다 — 승인 전 신청까지 직원 명단에 섞이면
   * 출퇴근·정산 화면의 담당자 목록이 오염된다. 승인될 때 만든다.
   *
   * 비밀번호는 이 시점에 이미 해시한다. 승인을 기다리는 동안에도 평문이 남지 않게.
   */
  async signup(dto: SignupDto) {
    const loginId = dto.loginId.trim().toLowerCase();

    // 이미 쓰는 아이디인지는 직원 계정과 대기 중 신청을 모두 봐야 한다.
    const [taken, pending] = await Promise.all([
      this.prisma.employee.findUnique({ where: { loginId }, select: { id: true } }),
      this.prisma.signupRequest.findUnique({ where: { loginId }, select: { id: true, status: true } }),
    ]);
    if (taken || (pending && pending.status !== SignupStatus.REJECTED)) {
      throw new BadRequestException('이미 사용 중인 아이디입니다.');
    }

    // 반려된 아이디로 다시 신청하는 경우가 있어 옛 신청은 치운다.
    if (pending) await this.prisma.signupRequest.delete({ where: { id: pending.id } });

    await this.prisma.signupRequest.create({
      data: {
        loginId,
        passwordHash: await bcrypt.hash(dto.password, 12),
        name: dto.name.trim(),
        position: dto.position?.trim() ?? '',
        department: dto.department ?? '',
        phone: dto.phone?.trim() ?? '',
      },
    });

    // 비밀번호는 물론 신청 id도 돌려주지 않는다 — 승인 전에는 알 게 없다.
    return { ok: true };
  }

  /** 관리자 화면의 대기 목록. 해시는 절대 내려보내지 않는다. */
  /**
   * 가입 신청 목록.
   *
   * 같은 이름의 퇴사자가 있으면 알려준다. 퇴사자는 로그인이 막히지만 새 아이디로
   * 다시 신청하면 새 계정이 만들어져 그대로 들어온다. 막지는 않는다 — 재입사도 있고
   * 동명이인도 있다. 승인하는 사람이 알고 누르게만 한다.
   */
  async listSignups(status?: SignupStatus) {
    const rows = await this.prisma.signupRequest.findMany({
      where: status ? { status } : {},
      select: {
        id: true,
        loginId: true,
        name: true,
        position: true,
        department: true,
        phone: true,
        status: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        // 지문 자체는 안 주고 '있는지'만 알려준다 — 화면은 단말 등록 여부만 정하면 된다.
      },
      orderBy: { createdAt: 'desc' },
    });

    const pendingNames = rows.filter((r) => r.status === SignupStatus.PENDING).map((r) => r.name);
    if (pendingNames.length === 0) return rows.map((r) => ({ ...r, formerEmployee: false }));

    const former = await this.prisma.employee.findMany({
      where: { name: { in: pendingNames }, active: false },
      select: { name: true },
    });
    const formerNames = new Set(former.map((e) => e.name));

    return rows.map((r) => ({ ...r, formerEmployee: formerNames.has(r.name) }));
  }

  /**
   * 승인/반려.
   *
   * 승인하면 그때 계정이 만들어진다.
   * 단말 키는 여기서 만들어도 신청자 브라우저에 전할 방법이 없다 —
   * 그래서 지문만 심어두고, 그 PC에서 사무실 안에서 로그인할 때 키가 내려가게 둔다
   * (attendance 의 단말 되찾기가 그 통로다).
   */
  async reviewSignup(id: string, dto: ReviewSignupDto) {
    const req = await this.prisma.signupRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('가입 신청을 찾을 수 없습니다.');
    if (req.status !== SignupStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청입니다.');
    }

    if (dto.action === 'reject') {
      return this.prisma.signupRequest.update({
        where: { id },
        data: { status: SignupStatus.REJECTED, reviewedAt: new Date(), reviewNote: dto.note ?? null },
        select: { id: true, status: true },
      });
    }

    // 대기하는 사이에 같은 아이디로 계정이 생겼을 수 있다.
    const taken = await this.prisma.employee.findUnique({ where: { loginId: req.loginId }, select: { id: true } });
    if (taken) throw new BadRequestException('이미 사용 중인 아이디입니다. 신청을 반려해 주세요.');

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.create({
        data: {
          name: req.name,
          position: req.position || '사원',
          department: req.department || null,
          role: Role.EMPLOYEE,
          active: true,
          provider: AuthProvider.LOCAL,
          loginId: req.loginId,
          passwordHash: req.passwordHash,
          ...(req.phone ? { phones: { create: [{ number: req.phone, sortOrder: 0 }] } } : {}),
        },
      });


      await tx.signupRequest.update({
        where: { id },
        data: { status: SignupStatus.APPROVED, reviewedAt: new Date(), reviewNote: dto.note ?? null },
      });
    });

    // 명단이 캐시돼 있어 안 비우면 방금 승인한 사람이 화면에 안 뜬다.
    await this.redis.del('employees:list');
    return { id, status: SignupStatus.APPROVED };
  }

  private async issue(employee: Employee): Promise<LoginResult> {
    // 모듈 구성은 상사마다 다르다. 토큰에 담지 않고 매번 읽는다 — 모듈을 켜 줬는데
    // 다시 로그인해야 보이면, 그걸 "안 켜졌다"로 받아들인다.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: employee.tenantId },
      select: { id: true, code: true, name: true, modules: true, active: true },
    });
    if (!tenant || !tenant.active) {
      throw new UnauthorizedException('사용할 수 없는 상사 계정입니다. 카비어 담당자에게 문의해 주세요.');
    }

    return {
      accessToken: this.jwt.sign({ sub: employee.id }),
      user: {
        id: employee.id,
        name: employee.name,
        position: employee.position,
        role: employee.role,
        provider: employee.provider,
        linked: true,
        tenant: {
          id: tenant.id,
          code: tenant.code,
          name: tenant.name,
          modules: parseModules(tenant.modules),
        },
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
