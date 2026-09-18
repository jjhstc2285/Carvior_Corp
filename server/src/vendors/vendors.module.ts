import {
  Body,
  Controller,
  Delete,
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
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';

/**
 * 거래처 대장.
 *
 * 광택집·판금집·공업사·배터리·할부사처럼 전화할 일이 있는 곳을 한곳에 모은다.
 * 번호가 카톡 어딘가에만 있어서 필요할 때마다 올려 찾던 걸 없앤다.
 *
 * 보는 건 전 직원이다 — 현장에서 전화하는 사람이 정해져 있지 않다.
 * 고치는 건 관리자만. 여럿이 같은 줄을 고치면 어느 번호가 맞는지 알 수 없게 된다.
 */

export class UpsertVendorDto {
  @IsString() @IsNotEmpty({ message: '분류를 입력해 주세요.' }) @MaxLength(20) category!: string;
  @IsString() @IsNotEmpty({ message: '업체명을 입력해 주세요.' }) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) phone2?: string;
  @IsOptional() @IsString() @MaxLength(30) manager?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(20) category?: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) phone2?: string;
  @IsOptional() @IsString() @MaxLength(30) manager?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** 담당자 한 사람 — 이름에 '김재근 부장(메인팀장)'처럼 무슨 일로 거는지까지 적는다 */
export class UpsertContactDto {
  @IsOptional() @IsString() @MaxLength(40) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(params: { q?: string; category?: string; includeInactive?: string }) {
    const where: Prisma.VendorWhereInput = {
      ...(params.includeInactive === 'true' ? {} : { active: true }),
      ...(params.category ? { category: params.category } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q } },
              { manager: { contains: params.q } },
              { phone: { contains: params.q } },
              { memo: { contains: params.q } },
              { address: { contains: params.q } },
              // 사람 이름으로 찾는 일이 더 많다 — '김재근 부장'
              { contacts: { some: { OR: [{ name: { contains: params.q } }, { phone: { contains: params.q } }] } } },
            ],
          }
        : {}),
    };
    // 분류끼리 모아 보여준다. 같은 분류 안에서는 이름 순 — 번호를 찾으려면 이름으로 짚는다.
    return this.prisma.vendor.findMany({
      where,
      include: { contacts: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  create(dto: UpsertVendorDto) {
    return this.prisma.vendor.create({
      data: {
        category: dto.category.trim(),
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? '',
        phone2: dto.phone2?.trim() ?? '',
        manager: dto.manager?.trim() ?? '',
        address: dto.address?.trim() ?? '',
        memo: dto.memo?.trim() ?? '',
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { contacts: true },
    });
  }

  async update(id: string, dto: UpdateVendorDto) {
    await this.assertExists(id);
    return this.prisma.vendor.update({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.phone2 !== undefined ? { phone2: dto.phone2.trim() } : {}),
        ...(dto.manager !== undefined ? { manager: dto.manager.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { contacts: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  /**
   * 지운다.
   *
   * 거래를 끊은 곳은 '거래 끝'으로 내리는 게 낫다 — 지난 비용 명세가 이 이름을 적어두고
   * 있어서, 지우면 그게 어디였는지 알 길이 없어진다. 잘못 만든 줄만 지우라고 열어둔다.
   */
  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.vendor.delete({ where: { id } });
  }

  /** 담당자를 한 사람 붙인다 — 맨 뒤로 */
  async addContact(vendorId: string, dto: UpsertContactDto) {
    await this.assertExists(vendorId);
    const last = await this.prisma.vendorContact.findFirst({
      where: { vendorId },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    return this.prisma.vendorContact.create({
      data: {
        vendorId,
        name: dto.name?.trim() ?? '',
        phone: dto.phone?.trim() ?? '',
        sort: (last?.sort ?? 0) + 1,
      },
    });
  }

  async updateContact(id: string, dto: UpsertContactDto) {
    await this.assertContactExists(id);
    return this.prisma.vendorContact.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      },
    });
  }

  async removeContact(id: string) {
    await this.assertContactExists(id);
    await this.prisma.vendorContact.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const row = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('거래처를 찾을 수 없습니다.');
  }

  private async assertContactExists(id: string) {
    const row = await this.prisma.vendorContact.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('담당자를 찾을 수 없습니다.');
  }
}

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  /** 번호를 찾는 건 현장에서 하는 일이라 전 직원이 본다. */
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.vendors.findAll({ q, category, includeInactive });
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: UpsertVendorDto) {
    return this.vendors.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.vendors.remove(id);
  }

  // ── 담당자 ──

  @Roles(Role.ADMIN)
  @Post(':id/contacts')
  addContact(@Param('id') id: string, @Body() dto: UpsertContactDto) {
    return this.vendors.addContact(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('contacts/:contactId')
  updateContact(@Param('contactId') contactId: string, @Body() dto: UpsertContactDto) {
    return this.vendors.updateContact(contactId, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('contacts/:contactId')
  @HttpCode(204)
  async removeContact(@Param('contactId') contactId: string) {
    await this.vendors.removeContact(contactId);
  }
}

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
