import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { monthRange } from '../common/date.util';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CEO_APPROVER } from '../settlements/approvers';

/**
 * 인건비.
 *
 * 누가 얼마를 받는지는 회사에서 제일 민감한 값이다. 관리자라고 다 열어주지 않는다 —
 * 급여를 받는 사람 본인도 못 보게 해야 남의 급여를 볼 수 없다.
 *
 * 부동산 정보와 같은 방식으로 잠근다: 볼 사람을 이름으로 좁히고, 탭에 들어올 때 번호를
 * 한 번 더 받는다. 자리를 비운 사이 열린 화면이 그대로 남아 있으면 안 되기 때문이다.
 * 번호는 서버 .env 에만 둔다 — 코드에 박으면 소스를 받은 사람이 다 본다.
 */

/** 기본으로 볼 사람 — 대표. 테스트 계정은 따로 통과시킨다 */
const DEFAULT_VIEWERS = [CEO_APPROVER];

function viewerNames(): string[] {
  const fromEnv = (process.env.PAYROLL_VIEWERS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_VIEWERS;
}

/** 손볼 일이 있을 때를 위한 테스트 계정 한 자리 — 이름이든 직책이든 '테스트'가 들어가면 */
function isTestAccount(user: AuthUser): boolean {
  return `${user.name} ${user.position}`.includes('테스트');
}

function canOpenPayroll(user: AuthUser): boolean {
  return viewerNames().includes(user.name.trim()) || isTestAccount(user);
}

/*
  밥값.

  하루 9,000원. 아침에 9시 30분까지 찍고 저녁 6시를 넘겨 찍은 날만 센다 — 늦게 온 날과
  일찍 간 날은 안 준다. 한쪽만 찍힌 날도 안 센다: 안 찍힌 시각은 확인할 방법이 없는데,
  모르는 걸 준 것으로 세면 그만큼이 매달 조용히 나간다.
*/
export const MEAL_PER_DAY = 9000;
export const MEAL_IN_BY = '09:30';
export const MEAL_OUT_FROM = '18:00';

/**
 * 통행증은 한 시간만 산다.
 *
 * 여덟 시간으로 뒀더니 아침에 한 번 열면 그날 하루는 그냥 열렸다 — 잠근 뜻이 없다.
 * 자리를 비운 사이 누가 와서 봐도 한 시간 안에는 잠긴다.
 */
const PASS_HOURS = 1;

function makePass(user: AuthUser): string {
  const exp = Date.now() + PASS_HOURS * 3600_000;
  // 부동산 통행증과 섞이지 않게 쓰임새를 서명에 넣는다 — 한쪽을 열었다고 다른 쪽이 열리면 안 된다
  const sign = createHmac('sha256', process.env.JWT_SECRET ?? '').update(`payroll.${user.id}.${exp}`).digest('hex');
  return `${exp}.${sign}`;
}

/** 모니터링도 같은 번호로 잠근다 — 거기도 인건비가 한 줄로 들어간다 */
export function verifyPayrollPass(user: AuthUser, pass?: string): boolean {
  return verifyPass(user, pass);
}

function verifyPass(user: AuthUser, pass?: string): boolean {
  const [expText, sign] = (pass ?? '').split('.');
  const exp = Number(expText);
  if (!exp || !sign || Date.now() > exp) return false;

  const want = createHmac('sha256', process.env.JWT_SECRET ?? '').update(`payroll.${user.id}.${exp}`).digest('hex');
  const a = Buffer.from(sign);
  const b = Buffer.from(want);
  // 길이가 다르면 맞춰 보지 않는다 — timingSafeEqual 은 길이가 다르면 던진다
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertOpen(user: AuthUser, pass?: string): void {
  if (!canOpenPayroll(user)) {
    throw new ForbiddenException('인건비는 정해진 분만 볼 수 있습니다.');
  }
  if (!verifyPass(user, pass)) {
    // 화면이 '번호 다시 받기'와 '아예 못 봄'을 갈라 볼 수 있게 표를 붙인다
    throw new ForbiddenException({ message: '번호를 다시 넣어 주세요.', code: 'PAYROLL_LOCKED' });
  }
}

export class UpsertPayrollDto {
  @IsString() @IsNotEmpty({ message: '이름을 입력해 주세요.' }) @MaxLength(30) name!: string;
  @IsOptional() @IsString() @MaxLength(20) position?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyPay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) companyDeduction?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) selfDeduction?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mealAllowance?: number;
  @IsOptional() @IsString() @MaxLength(30) burden?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePayrollDto extends UpsertPayrollDto {
  @IsOptional() @IsString() @MaxLength(30) declare name: string;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    // 많이 받는 사람부터가 아니라 적어둔 차례대로 — 표를 종이와 같은 순서로 본다
    return this.prisma.payrollEntry.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] });
  }

  create(dto: UpsertPayrollDto) {
    return this.prisma.payrollEntry.create({ data: { ...this.dataOf(dto, true), name: dto.name.trim() } });
  }

  async update(id: string, dto: UpdatePayrollDto) {
    await this.assertExists(id);
    return this.prisma.payrollEntry.update({ where: { id }, data: this.dataOf(dto, false) });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.payrollEntry.delete({ where: { id } });
  }

  /**
   * 그 달 식비 — 사람마다 며칠치인가.
   *
   * 급여표의 이름과 직원 이름을 맞춘다. 근태 계정이 없는 사람은 0일이다(며칠 나왔는지
   * 알 방법이 없다). 'HH:mm' 은 앞자리를 0으로 채워 넣으므로 글자로 견줘도 시각 순서다.
   *
   * 구내식당 체크를 켜거나 끈 날은 그 값으로 센다 — 찍고 나가서 손님과 밖에서 먹는 날이
   * 있어 찍힌 것과 먹은 것이 늘 같지 않다. 안 건드린 날은 그대로 시각으로 판정한다.
   */
  async mealAllowances(month: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { date: monthRange(month) },
      select: { clockIn: true, clockOut: true, mealUsed: true, employee: { select: { name: true } } },
    });

    const days = new Map<string, number>();
    /** 사람이 직접 켜고 끈 날 수 — 숫자가 시각과 안 맞을 때 왜 그런지 보여준다 */
    const marked = new Map<string, number>();
    for (const r of records) {
      const name = r.employee.name.trim();
      if (r.mealUsed !== null) marked.set(name, (marked.get(name) ?? 0) + 1);

      const auto = !!r.clockIn && !!r.clockOut && r.clockIn <= MEAL_IN_BY && r.clockOut >= MEAL_OUT_FROM;
      if (!(r.mealUsed ?? auto)) continue;
      days.set(name, (days.get(name) ?? 0) + 1);
    }

    const entries = await this.prisma.payrollEntry.findMany({ select: { name: true } });
    const rows = entries.map((e) => {
      const name = e.name.trim();
      const count = days.get(name) ?? 0;
      return {
        name,
        days: count,
        amount: count * MEAL_PER_DAY,
        matched: days.has(name),
        /** 그 사람이 구내식당 체크를 손으로 건드린 날 수 */
        marked: marked.get(name) ?? 0,
      };
    });

    return { month, perDay: MEAL_PER_DAY, inBy: MEAL_IN_BY, outFrom: MEAL_OUT_FROM, rows };
  }

  private dataOf(dto: UpsertPayrollDto, _creating: boolean) {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.position !== undefined ? { position: dto.position.trim() } : {}),
      ...(dto.monthlyPay !== undefined ? { monthlyPay: dto.monthlyPay } : {}),
      ...(dto.companyDeduction !== undefined ? { companyDeduction: dto.companyDeduction } : {}),
      ...(dto.selfDeduction !== undefined ? { selfDeduction: dto.selfDeduction } : {}),
      ...(dto.mealAllowance !== undefined ? { mealAllowance: dto.mealAllowance } : {}),
      ...(dto.burden !== undefined ? { burden: dto.burden.trim() } : {}),
      ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
  }

  private async assertExists(id: string) {
    const row = await this.prisma.payrollEntry.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('인건비 내역을 찾을 수 없습니다.');
  }
}

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  /** 이 계정이 인건비를 볼 수 있는가 — 메뉴를 띄울지 화면이 묻는다 */
  @Get('access')
  access(@CurrentUser() user: AuthUser) {
    return { canOpen: canOpenPayroll(user) };
  }

  /**
   * 번호를 넣어 통행증을 받는다.
   *
   * 번호는 서버 .env(PAYROLL_ACCESS_CODE)에만 있다. 안 넣어두면 아무도 못 연다 —
   * 인건비가 번호 없이 열리는 것보다 낫다.
   */
  @Post('unlock')
  unlock(@CurrentUser() user: AuthUser, @Body() dto: { code?: string }) {
    if (!canOpenPayroll(user)) {
      throw new ForbiddenException('인건비는 정해진 분만 볼 수 있습니다.');
    }
    const code = (process.env.PAYROLL_ACCESS_CODE ?? '').trim();
    if (!code) {
      throw new ForbiddenException('인건비 번호가 서버에 설정되지 않았습니다. 관리자에게 문의해 주세요.');
    }
    if ((dto.code ?? '').trim() !== code) {
      throw new ForbiddenException('번호가 맞지 않습니다.');
    }
    return { pass: makePass(user) };
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Headers('x-payroll-pass') pass: string) {
    assertOpen(user, pass);
    return this.payroll.findAll();
  }

  /**
   * 그 달 식비.
   *
   * 9시 30분까지 찍고 6시 넘겨 찍은 날만 하루 9,000원으로 센다. 급여와 같은 자리에서
   * 보는 값이라 같은 번호로 잠근다.
   */
  @Get('meal')
  meal(
    @CurrentUser() user: AuthUser,
    @Headers('x-payroll-pass') pass: string,
    @Query('month') month = '',
  ) {
    assertOpen(user, pass);
    const want = month.trim();
    if (!/^\d{4}-\d{2}$/.test(want)) {
      throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    }
    return this.payroll.mealAllowances(want);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Headers('x-payroll-pass') pass: string,
    @Body() dto: UpsertPayrollDto,
  ) {
    assertOpen(user, pass);
    return this.payroll.create(dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Headers('x-payroll-pass') pass: string,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollDto,
  ) {
    assertOpen(user, pass);
    return this.payroll.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-payroll-pass') pass: string,
    @Param('id') id: string,
  ) {
    assertOpen(user, pass);
    await this.payroll.remove(id);
  }
}

@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
  // 모니터링이 그 달 식대를 같은 자로 센다 — 두 군데서 따로 세면 숫자가 갈린다
  exports: [PayrollService],
})
export class PayrollModule {}
