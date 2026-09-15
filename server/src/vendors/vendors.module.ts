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
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(20) category?: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) phone2?: string;
  @IsOptional() @IsString() @MaxLength(30) manager?: string;
  @IsOptional() @IsString() @MaxLength(255) memo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
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
            ],
          }
        : {}),
    };
    // 분류끼리 모아 보여준다. 같은 분류 안에서는 이름 순 — 번호를 찾으려면 이름으로 짚는다.
    return this.prisma.vendor.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  create(dto: UpsertVendorDto) {
    return this.prisma.vendor.create({
      data: {
        category: dto.category.trim(),
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? '',
        phone2: dto.phone2?.trim() ?? '',
        manager: dto.manager?.trim() ?? '',
        memo: dto.memo?.trim() ?? '',
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
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
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
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

  private async assertExists(id: string) {
    const row = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('거래처를 찾을 수 없습니다.');
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
}

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
