import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
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

/** 계약팀은 남의 정산도 본다 — 빈칸을 채우는 게 그 팀 일이다. */
const CONTRACT_TEAM = '계약팀';
import { assertOfficeManager } from '../auth/office-manager';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /**
   * 직원은 본인 담당 건만, 관리자와 계약팀은 전체(또는 담당자 지정).
   *
   * 매입은 매입팀이 해오고 빈칸은 계약팀이 채운다. 자기가 담당인 건만 내려주면
   * 정작 채워야 할 사람이 아무것도 못 본다.
   */
  private scope(user: AuthUser, employeeId?: string) {
    const seesAll = user.role === Role.ADMIN || user.department === CONTRACT_TEAM;
    return seesAll ? employeeId : user.id;
  }

  /**
   * 알선 정산은 본인 것만 본다 — 계약팀도 마찬가지다.
   *
   * 알선은 받아온 사람이 곧 정산받을 사람이라 남의 몫이 보일 이유가 없다.
   * 매입 정산과 달리 남이 채워줄 빈칸도 없다.
   */
  private ownScope(user: AuthUser, employeeId?: string) {
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
    return this.settlements.findBrokerage({ q, status, month, employeeId: this.ownScope(user, employeeId) });
  }

  /** 현금 수수료를 받았는지 대표가 찍는다 — 찍은 때가 같이 남는다. */
  @Post('brokerage/:id/cash-confirm')
  confirmCash(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: { confirmed?: boolean },
  ) {
    return this.settlements.confirmCash(id, user, dto.confirmed !== false);
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

  /** 상품화 비용 업체·카테고리 자동완성 — 지금까지 쓴 이름들 */
  @Get('purchase/vendors')
  prepVendors() {
    return this.settlements.prepVendors();
  }

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

  /**
   * 그 달 매입 정산을 한 번에 지운다 — 따로 정산을 끝낸 달을 정리할 때 쓴다.
   * 사무장·대표만. 승인이 찍힌 건은 안 지운다.
   */
  @Delete('purchase/month/:month')
  removePurchaseMonth(@CurrentUser() user: AuthUser, @Param('month') month: string) {
    assertOfficeManager(user);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    return this.settlements.removePurchaseMonth(month);
  }

  /**
   * 이미 적어둔 알선 정산을 한 번에 끌어온다.
   * 옮기는 건 알선 정산을 저장할 때 일어나서, 그 전에 적어둔 건은 이걸로 훑는다.
   */
  @Post('purchase/sync-from-brokerage')
  syncFromBrokerage(@CurrentUser() user: AuthUser) {
    assertOfficeManager(user);
    return this.settlements.syncAllFromBrokerage();
  }

  /** 계약팀이 다 채워 올린다 — 여기서부터 본부장이 볼 차례다. */
  @Post('purchase/:id/submit')
  submitPurchase(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.submitPurchase(id, user);
  }

  /** 본부장 → 대표 순서로 찍는다. 누가 찍을 수 있는지는 settlements/approvers.ts 에 있다. */
  @Post('purchase/:id/approve')
  approvePurchase(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.approvePurchase(id, user);
  }

  @Post('purchase/:id/revoke')
  revokePurchase(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.revokePurchase(id, user);
  }
}
