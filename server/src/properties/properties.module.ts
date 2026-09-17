import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { formatDateOnlyOrNull, toDateOnlyOrNull, todayKst } from '../common/date.util';
import { CEO_APPROVER } from '../settlements/approvers';

/**
 * 부동산 — 사무실·주차장·창고로 쓰는 자리.
 *
 * 대표와 관리자만 본다. 보증금·월세·임대인 연락처가 들어 있어 전 직원이 볼 값이 아니다.
 *
 * 대표는 이름으로 가린다. 직책으로 가리면 나중에 '대표이사'가 하나 더 생겼을 때 그 사람도
 * 같이 보게 된다 — 결재하는 사람을 이름으로 못 박아둔 것과 같은 이유다.
 */

/**
 * 대표 말고 이 화면을 여는 사람 — 이름으로 못 박는다.
 *
 * 직책으로 가리면 나중에 사무장이 한 명 더 들어왔을 때 그 사람도 계약 조건을 같이 보게 된다.
 * 프론트 App.tsx 에도 같은 이름이 있다 — 고칠 땐 양쪽을 같이 본다.
 */
const PROPERTY_VIEWERS = [CEO_APPROVER, '김수하'];

/**
 * 대표·지정된 사람·관리자여야 본다.
 *
 * 관리자를 열어둔 건 대표 계정 하나로는 대신 적어 넣을 사람이 없어서다.
 */
function assertCeo(user: AuthUser): void {
  if (!PROPERTY_VIEWERS.includes(user.name.trim()) && user.role !== Role.ADMIN) {
    throw new ForbiddenException('부동산 정보는 대표와 관리자만 볼 수 있습니다.');
  }
}

const DATE = /^(\d{4}-\d{2}-\d{2})?$/;

export class UpsertPropertyDto {
  @IsString() @IsNotEmpty({ message: '이름을 입력해 주세요.' }) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(20) usage?: string;
  @IsOptional() @IsString() @MaxLength(191) address?: string;
  @IsOptional() @IsString() @MaxLength(30) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(30) ownerPhone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) deposit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyRent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) payDay?: number;
  @IsOptional() @Matches(DATE, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) startOn?: string | null;
  @IsOptional() @Matches(DATE, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }) endOn?: string | null;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePropertyDto extends UpsertPropertyDto {
  @IsOptional() @IsString() @MaxLength(60) declare name: string;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive: boolean) {
    const rows = await this.prisma.property.findMany({
      where: includeInactive ? {} : { active: true },
      // 계약이 먼저 끝나는 자리가 위로. 만료가 안 적힌 건 뒤에 둔다.
      orderBy: [{ active: 'desc' }, { endOn: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(dto: UpsertPropertyDto) {
    // 이름은 만들 때만 반드시 있어야 한다 — 고칠 때는 안 보내면 그대로 둔다.
    const row = await this.prisma.property.create({
      data: { ...this.dataOf(dto), name: dto.name.trim(), memo: dto.memo ?? '' },
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpdatePropertyDto) {
    await this.assertExists(id);
    const row = await this.prisma.property.update({ where: { id }, data: this.dataOf(dto) });
    return this.toView(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.property.delete({ where: { id } });
  }

  /** 안 보낸 칸은 건드리지 않는다 — 한 칸만 고치는 화면이라 나머지를 지우면 안 된다. */
  private dataOf(dto: UpdatePropertyDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.usage !== undefined ? { usage: dto.usage.trim() } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
      ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName.trim() } : {}),
      ...(dto.ownerPhone !== undefined ? { ownerPhone: dto.ownerPhone.trim() } : {}),
      ...(dto.deposit !== undefined ? { deposit: dto.deposit } : {}),
      ...(dto.monthlyRent !== undefined ? { monthlyRent: dto.monthlyRent } : {}),
      ...(dto.payDay !== undefined ? { payDay: dto.payDay } : {}),
      ...(dto.startOn !== undefined ? { startOn: toDateOnlyOrNull(dto.startOn) } : {}),
      ...(dto.endOn !== undefined ? { endOn: toDateOnlyOrNull(dto.endOn) } : {}),
      ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
  }

  private toView<T extends { startOn: Date | null; endOn: Date | null }>(row: T) {
    return { ...row, startOn: formatDateOnlyOrNull(row.startOn), endOn: formatDateOnlyOrNull(row.endOn) };
  }

  private async assertExists(id: string) {
    const row = await this.prisma.property.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('부동산 정보를 찾을 수 없습니다.');
  }
}

/**
 * 계약서 한 장.
 *
 * 값을 받는 대로 담는다 — 면적·지목처럼 등기부에서 옮겨 적는 값은 숫자로만 안 떨어져서
 * 글자로 둔다("132.23", "3층 중 일부").
 */
export class UpsertLeaseDto {
  @IsOptional() @IsString() @MaxLength(10) kind?: string;
  @IsOptional() @IsString() @MaxLength(10) rentType?: string;

  @IsOptional() @IsString() @MaxLength(191) address?: string;
  @IsOptional() @IsString() @MaxLength(30) landCategory?: string;
  @IsOptional() @IsString() @MaxLength(30) landArea?: string;
  @IsOptional() @IsString() @MaxLength(60) buildingStructure?: string;
  @IsOptional() @IsString() @MaxLength(30) buildingArea?: string;
  @IsOptional() @IsString() @MaxLength(60) leasedPart?: string;
  @IsOptional() @IsString() @MaxLength(30) leasedArea?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) deposit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) downPayment?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) interimPayment?: number;
  @IsOptional() @Matches(DATE) interimOn?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) balance?: number;
  @IsOptional() @Matches(DATE) balanceOn?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyRent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) payDay?: number;

  @IsOptional() @Matches(DATE) handoverOn?: string | null;
  @IsOptional() @Matches(DATE) startOn?: string | null;
  @IsOptional() @Matches(DATE) endOn?: string | null;

  @IsOptional() @IsString() @MaxLength(10) brokerageRate?: string;
  @IsOptional() @IsString() special?: string;
  @IsOptional() @Matches(DATE) writtenOn?: string | null;

  @IsOptional() @IsString() @MaxLength(30) lessorName?: string;
  @IsOptional() @IsString() @MaxLength(191) lessorAddress?: string;
  @IsOptional() @IsString() @MaxLength(30) lessorPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) lessorAgent?: string;
  @IsOptional() @IsString() @MaxLength(30) lessorAgentPhone?: string;

  @IsOptional() @IsString() @MaxLength(30) lesseeName?: string;
  @IsOptional() @IsString() @MaxLength(191) lesseeAddress?: string;
  @IsOptional() @IsString() @MaxLength(30) lesseePhone?: string;
  @IsOptional() @IsString() @MaxLength(30) lesseeAgent?: string;
  @IsOptional() @IsString() @MaxLength(30) lesseeAgentPhone?: string;

  @IsOptional() @IsString() @MaxLength(60) brokerOffice?: string;
  @IsOptional() @IsString() @MaxLength(191) brokerAddress?: string;
  @IsOptional() @IsString() @MaxLength(30) brokerName?: string;
  @IsOptional() @IsString() @MaxLength(30) brokerRegNo?: string;
  @IsOptional() @IsString() @MaxLength(30) brokerPhone?: string;
}

/** 계약서에서 날짜로 오가는 칸 — 담을 땐 Date, 내줄 땐 YYYY-MM-DD */
const LEASE_DATES = ['interimOn', 'balanceOn', 'handoverOn', 'startOn', 'endOn', 'writtenOn'] as const;

@Injectable()
export class LeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(propertyId: string) {
    const rows = await this.prisma.leaseContract.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  /**
   * 계약서를 새로 만든다.
   *
   * 부동산에 적어둔 값(소재지·보증금·월세·기간)을 밑그림으로 깔아준다 — 같은 값을
   * 두 번 치게 두지 않는다. 계약서에서 고쳐도 부동산 쪽은 안 건드린다.
   */
  async create(propertyId: string, dto: UpsertLeaseDto) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('부동산 정보를 찾을 수 없습니다.');

    const row = await this.prisma.leaseContract.create({
      data: {
        propertyId,
        address: property.address,
        deposit: property.deposit,
        monthlyRent: property.monthlyRent,
        payDay: property.payDay,
        startOn: property.startOn,
        endOn: property.endOn,
        lessorName: property.ownerName,
        lessorPhone: property.ownerPhone,
        special: '',
        ...this.dataOf(dto),
      },
    });
    return this.toView(row);
  }

  async update(id: string, dto: UpsertLeaseDto) {
    await this.assertExists(id);
    const row = await this.prisma.leaseContract.update({ where: { id }, data: this.dataOf(dto) });
    return this.toView(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.leaseContract.delete({ where: { id } });
  }

  /**
   * 연장 — 지금 계약서를 그대로 베껴 다음 기간짜리 새 장을 만든다.
   *
   * 연장은 조건이 그대로인 채 기간만 미는 일이 대부분이다. 처음부터 다시 치게 두지 않고
   * 베껴서 기간만 밀어 준 뒤, 바뀐 것(월세를 올렸다든지)만 고치게 한다.
   *
   * 지난 장은 지우지 않는다 — 언제 얼마로 몇 년을 살았는지가 기록이다.
   * 부동산 쪽 계약 기간도 새 기간으로 맞춘다. 그게 '지금 계약'이라 만료 알림이 그걸 본다.
   */
  async renew(id: string, months: number) {
    const src = await this.prisma.leaseContract.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('계약서를 찾을 수 없습니다.');

    const span = Math.min(Math.max(Math.trunc(months) || 12, 1), 120);
    // 새 기간은 지난 계약이 끝난 다음 날부터. 끝나는 날을 안 적었으면 오늘부터 센다.
    const base = src.endOn ?? new Date(`${todayKst()}T00:00:00.000Z`);
    const startOn = new Date(base.getTime() + (src.endOn ? 86_400_000 : 0));
    const endOn = new Date(
      Date.UTC(startOn.getUTCFullYear(), startOn.getUTCMonth() + span, startOn.getUTCDate() - 1),
    );

    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
    const row = await this.prisma.leaseContract.create({
      data: {
        ...rest,
        startOn,
        endOn,
        handoverOn: null,
        writtenOn: new Date(`${todayKst()}T00:00:00.000Z`),
        // 계약금·중도금·잔금은 처음 들어갈 때 오간 돈이다. 연장에는 안 따라간다.
        downPayment: 0,
        interimPayment: 0,
        interimOn: null,
        balance: 0,
        balanceOn: null,
      },
    });

    await this.prisma.property.update({
      where: { id: src.propertyId },
      data: { startOn, endOn, active: true },
    });

    return this.toView(row);
  }

  /** 안 보낸 칸은 건드리지 않는다 — 한 칸씩 고치는 화면이다. */
  private dataOf(dto: UpsertLeaseDto) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if ((LEASE_DATES as readonly string[]).includes(key)) {
        out[key] = toDateOnlyOrNull(value as string | null);
      } else {
        out[key] = typeof value === 'string' ? value.trim() : value;
      }
    }
    return out;
  }

  private toView<T extends Record<string, unknown>>(row: T) {
    const out: Record<string, unknown> = { ...row };
    for (const key of LEASE_DATES) out[key] = formatDateOnlyOrNull(row[key] as Date | null);
    return out;
  }

  private async assertExists(id: string) {
    const row = await this.prisma.leaseContract.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('계약서를 찾을 수 없습니다.');
  }
}

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly leases: LeaseService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('includeInactive') includeInactive?: string) {
    assertCeo(user);
    return this.properties.findAll(includeInactive === 'true');
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertPropertyDto) {
    assertCeo(user);
    return this.properties.create(dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    assertCeo(user);
    return this.properties.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertCeo(user);
    await this.properties.remove(id);
  }

  // ── 계약서 ── 부동산과 같은 사람만 본다(계약 조건이 그대로 들어 있다)

  @Get(':id/leases')
  findLeases(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertCeo(user);
    return this.leases.findByProperty(id);
  }

  @Post(':id/leases')
  createLease(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeaseDto) {
    assertCeo(user);
    return this.leases.create(id, dto);
  }

  @Patch('leases/:leaseId')
  updateLease(@CurrentUser() user: AuthUser, @Param('leaseId') leaseId: string, @Body() dto: UpsertLeaseDto) {
    assertCeo(user);
    return this.leases.update(leaseId, dto);
  }

  @Delete('leases/:leaseId')
  @HttpCode(204)
  async removeLease(@CurrentUser() user: AuthUser, @Param('leaseId') leaseId: string) {
    assertCeo(user);
    await this.leases.remove(leaseId);
  }

  /** 연장 — 지금 계약서를 베껴 다음 기간짜리 새 장을 만든다(부동산 기간도 같이 민다). */
  @Post('leases/:leaseId/renew')
  renewLease(
    @CurrentUser() user: AuthUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: { months?: number },
  ) {
    assertCeo(user);
    return this.leases.renew(leaseId, Number(dto?.months) || 12);
  }
}

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, LeaseService],
})
export class PropertiesModule {}
