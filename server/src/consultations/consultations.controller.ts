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
import { ConsultationKind, ConsultationStatus, Role } from '@prisma/client';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/**
 * 상담 시트를 CSV로 받는 주소. 시트가 바뀌면 .env 로 갈아끼운다.
 * 주차 시트와 같은 문서의 다른 탭이다.
 */
const SHEET_CSV_URL =
  process.env.CONSULTATION_SHEET_CSV_URL ??
  'https://docs.google.com/spreadsheets/d/1SmBh_Grnd5yBiwY4jOxkRjz0P1GK2GilNgiSc8j3EIk/export?format=csv&gid=1211307773';

async function fetchSheetCsv(): Promise<string> {
  const res = await fetch(SHEET_CSV_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new ServiceUnavailableException('구글 시트를 읽지 못했습니다. 공개 설정을 확인해 주세요.');
  }
  return res.text();
}

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  /**
   * 직급과 상관없이 전체 상담을 본다.
   *
   * 상담은 한 사람이 받아도 그 뒤(계약·출고·정산)를 다른 사람이 이어받는다.
   * 자기 것만 보이면 손님이 다시 전화했을 때 누가 무슨 얘기를 했는지 알 수 없어서,
   * 옆자리에 물어보고 다시 확인하는 일이 반복됐다.
   *
   * 담당자만 추려 보고 싶으면 employeeId 로, 알선·수출은 kind 로 거른다.
   */
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('status') status?: ConsultationStatus,
    @Query('employeeId') employeeId?: string,
    @Query('kind') kind?: ConsultationKind,
  ) {
    return this.consultations.findAll({ q, status, employeeId, kind });
  }

  /**
   * 구글 시트 '알선 상담 정리' 가져오기.
   *
   * 1500건이 한 번에 들어오는 일이라 관리자만 부른다. 넣기 전에 무엇이 들어오는지
   * 먼저 보여준다(preview) — 확인 없이 밀어넣으면 무엇이 잘못 들어갔는지 알 수 없다.
   */
  @Roles(Role.ADMIN)
  @Get('sheet/preview')
  async previewSheet(@CurrentUser() user: AuthUser) {
    return this.consultations.importFromSheet(user, await fetchSheetCsv(), true);
  }

  @Roles(Role.ADMIN)
  @Post('sheet/import')
  async importSheet(@CurrentUser() user: AuthUser) {
    return this.consultations.importFromSheet(user, await fetchSheetCsv(), false);
  }

  /**
   * 캐피탈사별로 이번 달에 깔아 준 할부 — 재고금융 약정을 얼마나 채웠는지 센다.
   * 전 직원이 본다. 어느 할부를 밀지는 파는 사람이 정한다.
   */
  @Get('stats/capital-installments')
  capitalInstallments(@Query('months') months?: string) {
    return this.consultations.capitalInstallments(Number(months) || 1);
  }

  @Roles(Role.ADMIN)
  @Get('stats/conversion')
  stats() {
    return this.consultations.conversionStats();
  }

  @Get('by-customer/:name')
  byCustomer(@Param('name') name: string) {
    return this.consultations.findByCustomer(name);
  }

  /**
   * 그날 방문을 알선팀에게 자동으로 나눈다.
   *
   * 한 시간 자리에 한 사람씩, 적게 맡은 사람부터. 이미 담당을 찍어 둔 건은 그대로 둔다.
   * 전화받은 사람이 누르는 버튼이라 자리를 가리지 않는다 — 상담은 전 직원이 본다.
   */
  @Post('visits/assign')
  assignVisits(@Body() dto: { date?: string }) {
    const date = (dto.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('날짜는 YYYY-MM-DD 형식이어야 합니다.');
    }
    return this.consultations.assignVisits(date);
  }

  /**
   * 안 된 건 리뷰 — 왜 계약이 안 됐는지 담당이 적는다.
   *
   * 적은 사람과 때는 서버가 박는다. 화면에서 보내면 누가 적었는지를 믿을 수 없다.
   */
  @Post(':id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { reason?: string; review?: string },
  ) {
    return this.consultations.saveVisitReview(id, user, dto.reason ?? '', dto.review ?? '');
  }

  /**
   * 리콜 — 안 된 건에 다시 전화를 걸어 보고 결과를 남긴다.
   *
   * 자리를 가리지 않는다. 낮에 자리에 앉아 전화를 돌리는 사람이 적는 값이라, 걸 수
   * 있는 사람이 못 적으면 아무 데도 안 남는다. 건 사람과 때는 서버가 박는다.
   */
  @Post(':id/recall')
  recall(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { result?: string; note?: string },
  ) {
    return this.consultations.saveRecall(id, user, dto.result ?? '', dto.note ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consultations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateConsultationDto) {
    return this.consultations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.consultations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.consultations.remove(id);
  }
}
