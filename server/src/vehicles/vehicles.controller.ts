import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import {
  CreateVehicleDto,
  CreateVehicleExpenseDto,
  PlateTailQueryDto,
  RegisterIntakeVehicleDto,
  RegisterSoldVehicleDto,
  StockImportDto,
  UpdateVehicleDto,
  UpdateVehicleExpenseDto,
  VehicleExpenseQueryDto,
  VehicleListQueryDto,
} from './dto/vehicle.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

/**
 * 재고차량 장부를 CSV로 받는 주소. 시트가 바뀌면 .env 로 갈아끼우거나, 화면에서 주소를 넣는다.
 * 주차·상담 시트와 같은 문서를 쓰면 gid 만 다르다.
 */
const STOCK_SHEET_CSV_URL = process.env.STOCK_SHEET_CSV_URL ?? '';

/**
 * 차량 관리 — 외부 이동 리스트와 주유·배터리 비용.
 *
 * 체크박스 조작과 이력 등록·수정·삭제는 전 직원에게 열려 있다(현장에서 서로 채우는 흐름).
 * 주의: /expenses 라우트를 /:id 보다 먼저 선언해야 'expenses'가 id로 잡히지 않는다.
 */
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('expenses')
  findExpenses(@Query() query: VehicleExpenseQueryDto) {
    return this.vehicles.findExpenses(query);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleExpenseDto) {
    return this.vehicles.createExpense(user.id, dto);
  }

  @Patch('expenses/:id')
  updateExpense(@Param('id') id: string, @Body() dto: UpdateVehicleExpenseDto) {
    return this.vehicles.updateExpense(id, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  async removeExpense(@Param('id') id: string) {
    await this.vehicles.removeExpense(id);
  }

  /** 매입했는데 차량 관리에 안 올라간 차 — 그래서 제시 대상에 안 뜬다. */
  @Get('unregistered-intake')
  findUnregisteredIntakes() {
    return this.vehicles.findUnregisteredIntakes();
  }

  /** 그 차를 매입 관리에 적힌 값 그대로 차량 관리에 올린다. */
  @Post('register-intake')
  registerFromIntake(@Body() dto: RegisterIntakeVehicleDto) {
    return this.vehicles.registerFromIntake(dto.vehicleNumber);
  }

  /** 판매완료인데 차량 관리에 없는 차 — 알선처럼 우리가 안 사온 차다. */
  @Get('unregistered-sold')
  findUnregisteredSold() {
    return this.vehicles.findUnregisteredSold();
  }

  /** 그런 차를 매도로 남긴다 — 차를 만들면서 매도일자를 적는다. */
  @Post('register-sold')
  registerSold(@Body() dto: RegisterSoldVehicleDto) {
    return this.vehicles.registerSold(dto);
  }

  /** 뒤 4자리로 찾기 — 여러 대가 나오면 화면에서 선택박스를 띄운다. */
  @Get('search')
  findByTail(@Query() query: PlateTailQueryDto) {
    return this.vehicles.findByTail(query.tail);
  }

  /**
   * 재고차량 장부(구글 시트)를 그대로 읽어 온다.
   *
   * 브라우저가 직접 구글을 부르면 막히기 때문에(CORS) 서버가 받아서 넘겨준다.
   * 읽는 건 화면이 한다 — 상환일자를 내는 규칙이 화면에 있어서, 서버가 또 한 벌
   * 가지고 있으면 둘이 어긋난다.
   *
   * 주소는 구글 문서만 받는다. 아무 주소나 받으면 서버가 대신 아무 데나 불러 주는 창구가 된다.
   */
  @Roles(Role.ADMIN)
  @Get('stock-sheet')
  async stockSheet(@Query('url') url?: string) {
    const target = (url ?? STOCK_SHEET_CSV_URL).trim();
    let host = '';
    try {
      host = new URL(target).hostname;
    } catch {
      throw new BadRequestException('시트 주소를 다시 확인해 주세요.');
    }
    if (host !== 'docs.google.com') {
      throw new BadRequestException('구글 시트 주소만 받습니다.');
    }

    const res = await fetch(target, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      throw new ServiceUnavailableException('구글 시트를 읽지 못했습니다. 공개 설정(링크가 있는 모든 사용자)을 확인해 주세요.');
    }
    return { csv: await res.text() };
  }

  /** 화면에서 확인한 줄을 그대로 넣는다. */
  @Roles(Role.ADMIN)
  @Post('stock-import')
  importStock(@Body() dto: StockImportDto) {
    return this.vehicles.importStock(dto.rows);
  }

  @Get()
  findAll(@Query() query: VehicleListQueryDto) {
    return this.vehicles.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicles.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.vehicles.remove(id);
  }
}
