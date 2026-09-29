import {
  BadRequestException,
  ForbiddenException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
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
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/** 계약서 사진을 두는 곳. 올리는 파일은 전부 uploads 아래에 종류별로 나눠 둔다. */
const CONTRACT_DIR = join(process.env.UPLOAD_DIR ?? './uploads', 'settlements');
/** 앞장·뒷장·특약까지 — 넉넉히 열어둔다 */
const PHOTO_MAX = 10;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const ALLOWED_PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;

if (!existsSync(CONTRACT_DIR)) mkdirSync(CONTRACT_DIR, { recursive: true });

/** 계약팀은 남의 정산도 본다 — 빈칸을 채우는 게 그 팀 일이다. */
const CONTRACT_TEAM = '계약팀';
import { assertOfficeManager } from '../auth/office-manager';
import { CHIEF_APPROVER } from './approvers';

/** 청구서 한 줄 — 화면이 엑셀을 읽어 이 모양으로 보낸다 */
interface PanelInvoiceRow {
  vehicleNumber: string;
  vehicleName?: string;
  panelCount?: number;
  work?: string;
  amount: number;
}

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

  /** 승인을 기다리는 알선 정산 — 관리자 대시보드의 승인함에서 쓴다. */
  @Get('brokerage/pending')
  pendingBrokerage() {
    return this.settlements.pendingBrokerage();
  }

  /** 알선팀이 다 채워 올린다 — 여기서부터 결재하는 쪽이 볼 차례다. */
  @Post('brokerage/:id/submit')
  submitBrokerage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.submitBrokerage(id, user);
  }

  /** 본부장 → 대표 순서로 찍는다. 누가 찍을 수 있는지는 settlements/approvers.ts 에 있다. */
  @Post('brokerage/:id/approve')
  approveBrokerage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.approveBrokerage(id, user);
  }

  @Post('brokerage/:id/revoke')
  revokeBrokerage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.revokeBrokerage(id, user);
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


  /**
   * 판금집 청구서 반영.
   *
   * 대산에서 달마다 보내는 엑셀을 화면에서 읽어 줄로 보내면, 차량번호로 맞춰 매입 정산의
   * 판금·덴트 칸에 꽂는다. 서른 줄을 손으로 옮기면 몇 건은 빠지고, 빠진 건 원가가 낮게
   * 잡힌 채로 결재까지 간다.
   *
   * 본부장과 관리자만 쓴다. 남의 정산 원가를 한 번에 고치는 일이다.
   */
  @Post('purchase/panel-invoice')
  panelInvoice(
    @CurrentUser() user: AuthUser,
    @Body() dto: { vendor?: string; rows?: PanelInvoiceRow[] },
  ) {
    if (user.role !== Role.ADMIN && user.name !== CHIEF_APPROVER) {
      throw new ForbiddenException('판금 청구서는 본부장만 넣을 수 있습니다.');
    }
    return this.settlements.applyPanelInvoice((dto.vendor ?? '대산').trim(), dto.rows ?? []);
  }

  /**
   * 계약서 사진 올리기 — 정산을 저장하기 전에 먼저 올리고 경로를 받아 함께 보낸다.
   *
   * 원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   */
  @Post('purchase/contract-photos')
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_MAX, {
      storage: diskStorage({
        destination: CONTRACT_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
      }),
      limits: { fileSize: MAX_PHOTO_SIZE, files: PHOTO_MAX },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_PHOTO.test(file.mimetype)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadContractPhotos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('올릴 사진이 없습니다.');
    // Apache가 /uploads 를 정적으로 내주므로 이 경로가 곧 보이는 주소가 된다.
    return { urls: files.map((f) => `/uploads/settlements/${f.filename}`) };
  }

  /** 승인을 기다리는 매입 정산 — 관리자 대시보드의 승인함에서 쓴다. */
  @Get('purchase/pending')
  pendingPurchase() {
    return this.settlements.pendingPurchase();
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
