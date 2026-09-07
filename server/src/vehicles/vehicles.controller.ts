import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import {
  CreateVehicleDto,
  CreateVehicleExpenseDto,
  PlateTailQueryDto,
  RegisterSoldVehicleDto,
  UpdateVehicleDto,
  UpdateVehicleExpenseDto,
  VehicleExpenseQueryDto,
  VehicleListQueryDto,
} from './dto/vehicle.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

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
