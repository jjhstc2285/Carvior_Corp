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
import { memoryStorage } from 'multer';
import { StorageService } from '../storage/storage.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/** 계약서 사진을 두는 곳. 올리는 파일은 전부 uploads 아래에 종류별로 나눠 둔다. */
const CONTRACT_FOLDER = 'settlements';
/** 앞장·뒷장·특약까지 — 넉넉히 열어둔다 */
const PHOTO_MAX = 10;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const ALLOWED_PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;


/*
  청구서 원본을 두는 곳.

  엑셀로 오는 달도 있고 카톡 사진으로 오는 달도 있다. 둘 다 받는다 — 무엇으로 왔든
  나중에 다시 볼 것은 원본 하나다. PDF도 받는다(프린트해 스캔해 보내는 달이 있다).
*/
const PANEL_INVOICE_FOLDER = 'panel-invoice';
const INVOICE_FILE_MAX = 10;
const MAX_INVOICE_SIZE = 20 * 1024 * 1024;
const ALLOWED_INVOICE =
  /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv|application\/octet-stream)$/;


/** 계약팀은 남의 정산도 본다 — 빈칸을 채우는 게 그 팀 일이다. */
const CONTRACT_TEAM = '계약팀';

/** 계약 목표를 적는 팀 — 그 달 숫자를 맞춰 가는 사람들이다 */
const BROKER_TEAM = '알선팀';
import { assertOfficeManager } from '../auth/office-manager';
import { canEditPanelInvoice, canSeePurchaseSettlements, isReferralLeader } from './approvers';
import type { PrepCostKind } from '@prisma/client';

/** 상품화 비용 항목 — 청구서가 어느 칸으로 들어갈지 가른다(스키마의 PrepCostKind와 같다) */
const PREP_KINDS = ['POLISH_WASH', 'DENT', 'PERFORMANCE', 'DELIVERY', 'REPAIR', 'DIAGNOSIS'];

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
  constructor(
    private readonly settlements: SettlementsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 직원은 본인 담당 건만, 관리자와 계약팀은 전체(또는 담당자 지정).
   *
   * 매입은 매입팀이 해오고 빈칸은 계약팀이 채운다. 자기가 담당인 건만 내려주면
   * 정작 채워야 할 사람이 아무것도 못 본다.
   */
  private scope(user: AuthUser, employeeId?: string) {
    /*
      남의 정산까지 보는 사람.

      매입은 매입팀이 해오고 빈칸은 계약팀이 채운다. 계약팀이 아니면서도 매입가와 상품화
      비용을 들여다봐야 하는 자리가 있어 이름으로 몇을 더 둔다 — 직급으로 열면 같은 직급이
      하나 더 생겼을 때 같이 열린다.
    */
    const seesAll =
      user.role === Role.ADMIN || user.department === CONTRACT_TEAM || canSeePurchaseSettlements(user);
    return seesAll ? employeeId : user.id;
  }

  /**
   * 알선 정산은 본인 것만 본다 — 계약팀도 마찬가지다.
   *
   * 알선은 받아온 사람이 곧 정산받을 사람이라 남의 몫이 보일 이유가 없다.
   * 매입 정산과 달리 남이 채워줄 빈칸도 없다.
   *
   * 알선팀장은 팀원 것까지 본다 — 팀원 실적으로 관리 수당을 받는 자리라, 무엇이
   * 올라왔는지 못 보면 자기 수당이 어디서 나왔는지도 모른다.
   */
  private ownScope(user: AuthUser, employeeId?: string) {
    if (user.role === Role.ADMIN || isReferralLeader(user)) return employeeId;
    return user.id;
  }

  /**
   * 개발 계정인가 — 이름이나 직책에 '테스트'가 들어가면.
   *
   * 화면이 왜 그렇게 보이는지 손볼 사람은 다 보여야 한다. 직책이 '대표'로 적힌
   * 테스트 계정이 있어서 직책만 보면 안 된다.
   */
  private isTestAccount(user: AuthUser): boolean {
    return `${user.name} ${user.position}`.includes('테스트');
  }

  /**
   * 올리지 않은 줄은 적은 사람만 본다.
   *
   * 아직 '작성 중'인 줄은 적다 만 숫자다. 그게 윗사람 화면에 같이 뜨면 "이건 뭐냐"를
   * 물어보게 되고, 적던 사람은 다 적기 전에 설명부터 해야 한다 — 확인할 거리만 는다.
   *
   * 올린 뒤에는 누구 차례든 다 보인다. 봐야 결재를 한다.
   *
   * 본인 것만 보는 사람(ADMIN 아닌 쪽)은 이미 남의 줄이 안 내려가므로 따로 가릴 게
   * 없다. 개발 계정은 다 본다 — 화면이 왜 그렇게 보이는지 손볼 사람이다.
   *
   * 알선팀장도 다 본다. 팀원이 적는 중인 것까지 보고 챙기는 자리라, 올린 줄만 보이면
   * '아직 안 올렸다'를 물어보려고 따로 연락해야 한다.
   */
  private draftScope(user: AuthUser): string | undefined {
    if (this.isTestAccount(user) || isReferralLeader(user)) return undefined;
    return user.id;
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
    return this.settlements.findBrokerage({
      q,
      status,
      month,
      employeeId: this.ownScope(user, employeeId),
      mineOnlyDraft: this.draftScope(user),
    });
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

  /**
   * 그 차가 알선으로 나갔나 수출로 나갔나 — 차량번호와 종류만.
   *
   * 매입 정산의 '판매 경로' 칸이 이걸 본다. 알선 정산 목록은 본인 것만 내려가서(ownScope),
   * 매입 정산을 보는 사람이라도 남이 적은 수출 건은 안 보인다 — 그래서 같은 줄이 사무장
   * 화면에는 '수출', 다른 사람 화면에는 '모름'으로 떴다.
   *
   * 금액은 안 보낸다. 어디로 나갔는지만 알면 되는 칸이라 수수료·입금액까지 열 까닭이 없다.
   * 그래서 자리를 안 가린다 — 제시 금융의 매도 차량도 같은 칸을 쓰는데 그건 전 직원이
   * 보는 화면이다. 가려 두면 같은 줄이 사람마다 다르게 떠서 아무도 안 믿는다.
   */
  @Get('brokerage/channels')
  brokerageChannels() {
    return this.settlements.brokerageChannels();
  }

  /**
   * 정산이 올라온 차량번호 — 번호만.
   *
   * 상담에서 '계약'까지 간 차가 정산에 올라왔는지를 가리는 데 쓴다. 계약은 됐는데
   * 정산이 비어 있는 차가 달마다 몇 대씩 생기는데, 지금은 두 화면을 눈으로 맞춰 봐야
   * 찾을 수 있었다.
   *
   * 금액은 안 보낸다 — '올라왔다/아니다'만 알면 되는 값이라 자리를 안 가린다.
   * 매입 정산은 차량판매가가 적힌 것만 센다. 매입만 적어 둔 줄은 아직 판 게 아니다.
   */
  @Get('settled-plates')
  settledPlates() {
    return this.settlements.settledPlates();
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
  updateBrokerage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBrokerageDto) {
    return this.settlements.updateBrokerage(id, dto, user);
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

  /**
   * 매입 정산 목록 — 계약팀과 관리자만.
   *
   * 남의 매입가·상품화 비용·순이익이 한 줄씩 늘어선 표다. 적는 사람이 계약팀이고 보는
   * 뜻도 거기 있다. 화면에서 탭을 감추는 것만으로는 막은 게 아니라 여기서도 가린다.
   */
  @Get('purchase')
  findPurchase(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: SettlementStatus,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    if (user.role !== Role.ADMIN && user.department !== CONTRACT_TEAM && !canSeePurchaseSettlements(user)) {
      throw new ForbiddenException('매입 정산은 계약팀과 관리자만 볼 수 있습니다.');
    }
    return this.settlements.findPurchase({ q, status, month, employeeId: this.scope(user, employeeId) });
  }

  @Post('purchase')
  createPurchase(@Body() dto: CreatePurchaseDto) {
    return this.settlements.createPurchase(dto);
  }

  @Patch('purchase/:id')
  updatePurchase(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.settlements.updatePurchase(id, dto, user);
  }

  @Delete('purchase/:id')
  @HttpCode(204)
  async removePurchase(@Param('id') id: string) {
    await this.settlements.removePurchase(id);
  }

  /**
   * 중복으로 잡힌 줄을 남겨 둔다.
   *
   * 되사온 차는 같은 번호로 두 줄이 맞다. 한 번 눌러 두면 다음 청소에서 다시 안 집는다 —
   * 안 그러면 매번 줄이 그어지고 매번 다시 눌러야 한다.
   */
  @Post('purchase/:id/keep')
  keepPurchase(@Param('id') id: string) {
    return this.settlements.keepPurchase(id);
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
   * 판금집 청구서 반영.
   *
   * 대산에서 달마다 보내는 엑셀을 화면에서 읽어 줄로 보내면, 차량번호로 맞춰 매입 정산의
   * 판금·덴트 칸에 꽂는다. 서른 줄을 손으로 옮기면 몇 건은 빠지고, 빠진 건 원가가 낮게
   * 잡힌 채로 결재까지 간다.
   *
   * 이름으로 못 박은 두 사람만 쓴다 — 남의 정산 원가를 한 번에 고치고, 총액이 안 맞으면
   * 금액을 손으로 맞추는 자리다. 관리자 권한으로 열어 두면 관리자가 하나 더 생겼을 때
   * 같이 열린다.
   */
  @Post('purchase/panel-invoice')
  async panelInvoice(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      vendor?: string;
      rows?: PanelInvoiceRow[];
      /** 청구서를 넣는 달(YYYY-MM). 총액을 적어 둘 때 쓴다 */
      month?: string;
      /** 청구서에 찍힌 총액. 차에 나눠 붙이지 않고 적어만 둔다 — 합계를 이 값으로 덮어쓴다 */
      invoiceTotal?: number;
      /** 어느 항목인가 — 판금(DENT) / 광택(POLISH_WASH) … 광택은 사진으로 와서 총액만 적는다 */
      kind?: string;
      /** 몇 건인가 — 클리닉처럼 달마다 열몇 건씩 붙는 건 건수를 같이 적어 둔다 */
      invoiceCount?: number;
    },
  ) {
    if (!canEditPanelInvoice(user.name)) {
      throw new ForbiddenException('판금 청구서를 넣을 수 있는 계정이 아닙니다.');
    }
    const vendor = (dto.vendor ?? '대산').trim();
    const kind = PREP_KINDS.includes(dto.kind ?? '') ? (dto.kind as PrepCostKind) : 'DENT';
    const applied = await this.settlements.applyPanelInvoice(vendor, dto.rows ?? [], kind);

    /*
      총액은 적어만 둔다.

      줄 합계와 안 맞아도 차액을 차에 나눠 붙이지 않는다 — 맞추자고 남의 차 원가를 올리면
      그 차 순이익이 틀어진 채로 결재까지 간다. 적어 둔 총액으로 판금·덴트 합계를 덮어쓴다.
    */
    const month = (dto.month ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(month)) {
      await this.settlements.savePanelInvoiceTotal(
        month,
        vendor,
        Math.max(0, Math.round(dto.invoiceTotal ?? 0)),
        user.name,
        kind,
        Math.max(0, Math.round(dto.invoiceCount ?? 0)),
      );
    }
    return applied;
  }

  /**
   * 청구서 원본 올리기 — 엑셀이든 카톡 사진이든 그대로 둔다.
   *
   * 원본 파일명은 주소에 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여
   * 들어온다 — 보여줄 이름만 따로 적어 둔다.
   */
  @Post('purchase/panel-invoice/files')
  @UseInterceptors(
    FilesInterceptor('files', INVOICE_FILE_MAX, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_INVOICE_SIZE, files: INVOICE_FILE_MAX },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_INVOICE.test(file.mimetype)) {
          cb(new BadRequestException('사진·엑셀·PDF만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadPanelInvoiceFiles(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: { month?: string; vendor?: string },
  ) {
    if (!canEditPanelInvoice(user.name)) {
      throw new ForbiddenException('판금 청구서를 넣을 수 있는 계정이 아닙니다.');
    }
    if (!files?.length) throw new BadRequestException('올릴 파일이 없습니다.');

    const month = (dto.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');

    // 주소를 먼저 다 받아 둔다. 한 장이라도 실패하면 DB에 아무것도 넣지 않는다 —
    // 절반만 들어간 청구서 묶음은 빠진 것을 알아채기 어렵다.
    const urls = await this.storage.saveAll(files, PANEL_INVOICE_FOLDER);

    return this.settlements.savePanelInvoiceFiles(month, (dto.vendor ?? '대산').trim(), user.name,
      files.map((f, i) => ({
        url: urls[i],
        name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        mime: f.mimetype,
        size: f.size,
      })),
    );
  }

  /** 그 달에 올려 둔 청구서 원본 */
  @Get('purchase/panel-invoice/files')
  panelInvoiceFiles(@Query('month') month = '') {
    if (!/^\d{4}-\d{2}$/.test(month.trim())) return [];
    return this.settlements.panelInvoiceFiles(month.trim());
  }

  /** 잘못 올린 파일을 목록에서 내린다 */
  @Delete('purchase/panel-invoice/files/:id')
  @HttpCode(204)
  async removePanelInvoiceFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!canEditPanelInvoice(user.name)) {
      throw new ForbiddenException('판금 청구서를 넣을 수 있는 계정이 아닙니다.');
    }
    await this.settlements.removePanelInvoiceFile(id);
  }

  /** 그 달에 적어 둔 청구서 총액 — 판금·덴트 합계를 이걸로 덮어쓴다 */
  @Get('purchase/panel-invoice/totals')
  panelInvoiceTotals(@Query('month') month = '') {
    if (!/^\d{4}-\d{2}$/.test(month.trim())) return [];
    return this.settlements.panelInvoiceTotals(month.trim());
  }


  /*
    매입 정산에 붙는 식대.

    이우주 차장과 안원용 본부장 두 사람만 있는 값이다. 대표는 둘 다 보고 고치고, 본인은
    자기 것만 고친다 — 계약팀이 다 보는 자리에 두지 않는다. 남의 식대를 올렸다 내렸다
    할 수 있으면 그건 식대 칸이 아니라 급여 수정이다.
  */
  private assertSeesMeal(user: AuthUser): void {
    if (user.role !== Role.ADMIN && !canSeePurchaseSettlements(user)) {
      throw new ForbiddenException('식대는 대표와 본인만 봅니다.');
    }
  }

  @Get('purchase/meal')
  meals(@CurrentUser() user: AuthUser) {
    this.assertSeesMeal(user);
    return this.settlements.settlementMeals();
  }

  @Post('purchase/meal')
  saveMeal(
    @CurrentUser() user: AuthUser,
    @Body() dto: { month?: string; employeeId?: string; amount?: number },
  ) {
    this.assertSeesMeal(user);
    const month = (dto.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');

    const employeeId = (dto.employeeId ?? '').trim();
    if (!employeeId) throw new BadRequestException('누구 식대인지 없습니다.');
    if (user.role !== Role.ADMIN && employeeId !== user.id) {
      throw new ForbiddenException('본인 식대만 적을 수 있습니다.');
    }

    return this.settlements.saveSettlementMeal(month, employeeId, dto.amount ?? 0, user.name);
  }

  /**
   * 이미 적어둔 성능비에 부가세를 올린다.
   *
   * 성능비는 부가세를 따로 붙여 청구해 오는데 그동안 공급가만 적힌 건이 쌓였다.
   * 한꺼번에 곱하지 않는다 — 이미 부가세가 붙은 건이 섞여 있으면 두 배가 되고, 그건
   * 결재까지 가서야 눈에 띈다. 목록을 먼저 내주고 고른 것만 올린다.
   */
  @Get('purchase/performance-costs')
  performanceCosts(@CurrentUser() user: AuthUser) {
    if (!canEditPanelInvoice(user.name)) {
      throw new ForbiddenException('성능비를 한 번에 고칠 수 있는 계정이 아닙니다.');
    }
    return this.settlements.performanceCosts();
  }

  @Post('purchase/performance-vat')
  performanceVat(@CurrentUser() user: AuthUser, @Body() dto: { ids?: string[] }) {
    if (!canEditPanelInvoice(user.name)) {
      throw new ForbiddenException('성능비를 한 번에 고칠 수 있는 계정이 아닙니다.');
    }
    return this.settlements.applyPerformanceVat(dto.ids ?? []);
  }

  /**
   * 계약서 사진 올리기 — 정산을 저장하기 전에 먼저 올리고 경로를 받아 함께 보낸다.
   *
   * 원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   */
  @Post('purchase/contract-photos')
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_MAX, {
      storage: memoryStorage(),
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
  async uploadContractPhotos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('올릴 사진이 없습니다.');
    // 돌려주는 주소를 화면이 그대로 <img src>에 넣는다 — S3면 절대주소가 온다
    return { urls: await this.storage.saveAll(files, CONTRACT_FOLDER) };
  }

  /**
   * 그 달 계약 목표 — 보는 건 누구나.
   *
   * 브라우저에만 담아 뒀더니 대표와 팀장이 각자 다른 숫자를 봤다. 한 사람이 적은
   * 목표를 다른 사람이 못 보면 그건 목표가 아니다.
   */
  @Get('contract-goal')
  contractGoal(@Query('month') month: string) {
    return this.settlements.contractGoal(month);
  }

  /** 목표를 적는 건 관리자와 알선팀 — 그 달 숫자를 맞춰 가는 사람들이다 */
  @Post('contract-goal')
  setContractGoal(@CurrentUser() user: AuthUser, @Body() dto: { month?: string; target?: number }) {
    if (user.role !== Role.ADMIN && (user.department ?? '').trim() !== BROKER_TEAM) {
      throw new ForbiddenException('계약 목표는 관리자와 알선팀만 적을 수 있습니다.');
    }
    if (!dto.month || !/^\d{4}-\d{2}$/.test(dto.month)) {
      throw new BadRequestException('달은 YYYY-MM 형식이어야 합니다.');
    }
    return this.settlements.setContractGoal(dto.month, Number(dto.target) || 0, user);
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
