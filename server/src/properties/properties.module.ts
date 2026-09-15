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
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { formatDateOnlyOrNull, toDateOnlyOrNull } from '../common/date.util';
import { CEO_APPROVER } from '../settlements/approvers';

/**
 * 부동산 — 사무실·주차장·창고로 쓰는 자리.
 *
 * 대표만 본다. 보증금·월세·임대인 연락처가 들어 있어 전 직원이 볼 값이 아니다.
 *
 * 이름으로 가린다. 직책으로 가리면 나중에 '대표이사'가 하나 더 생겼을 때 그 사람도
 * 같이 보게 된다 — 결재하는 사람을 이름으로 못 박아둔 것과 같은 이유다.
 */

/** 대표 말고는 못 본다. 테스트 계정도 여기는 안 열어준다 — 남의 계약 조건이다. */
function assertCeo(user: AuthUser): void {
  if (user.name.trim() !== CEO_APPROVER) {
    throw new ForbiddenException('부동산 정보는 대표만 볼 수 있습니다.');
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

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

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
}

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService],
})
export class PropertiesModule {}
