import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role, SettlementStatus } from '@prisma/client';
import { SettlementsService } from './settlements.service';
import {
  CreateBrokerageDto,
  CreatePurchaseDto,
  CreateSettlementDto,
  UpdateBrokerageDto,
  UpdatePurchaseDto,
  UpdateSettlementDto,
} from './dto/settlement.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /** 직원은 본인 담당 건만, 관리자는 전체(또는 담당자 지정) */
  private scope(user: AuthUser, employeeId?: string) {
    return user.role === Role.ADMIN ? employeeId : user.id;
  }

  // ── 간편 정산 ──

  @Get('basic')
  findBasic(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: SettlementStatus,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.settlements.findBasic({ q, status, month, employeeId: this.scope(user, employeeId) });
  }

  @Post('basic')
  createBasic(@Body() dto: CreateSettlementDto) {
    return this.settlements.createBasic(dto);
  }

  @Patch('basic/:id')
  updateBasic(@Param('id') id: string, @Body() dto: UpdateSettlementDto) {
    return this.settlements.updateBasic(id, dto);
  }

  @Delete('basic/:id')
  @HttpCode(204)
  async removeBasic(@Param('id') id: string) {
    await this.settlements.removeBasic(id);
  }

  // ── 알선 정산 ──

  @Get('brokerage')
  findBrokerage(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: SettlementStatus,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.settlements.findBrokerage({ q, status, month, employeeId: this.scope(user, employeeId) });
  }

  @Post('brokerage')
  createBrokerage(@Body() dto: CreateBrokerageDto) {
    return this.settlements.createBrokerage(dto);
  }

  @Patch('brokerage/:id')
  updateBrokerage(@Param('id') id: string, @Body() dto: UpdateBrokerageDto) {
    return this.settlements.updateBrokerage(id, dto);
  }

  @Delete('brokerage/:id')
  @HttpCode(204)
  async removeBrokerage(@Param('id') id: string) {
    await this.settlements.removeBrokerage(id);
  }

  // ── 매입 정산 ──

  @Get('purchase')
  findPurchase(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: SettlementStatus,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.settlements.findPurchase({ q, status, month, employeeId: this.scope(user, employeeId) });
  }

  @Post('purchase')
  createPurchase(@Body() dto: CreatePurchaseDto) {
    return this.settlements.createPurchase(dto);
  }

  @Patch('purchase/:id')
  updatePurchase(@Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.settlements.updatePurchase(id, dto);
  }

  @Delete('purchase/:id')
  @HttpCode(204)
  async removePurchase(@Param('id') id: string) {
    await this.settlements.removePurchase(id);
  }
}
