import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageService } from '../storage/storage.service';
import { RequestStatus, Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import {
  AddIpDto,
  CreateAttendanceRequestDto,
  CreateCorrectionDto,
  RecoverDeviceDto,
  RegisterDeviceDto,
  ReviewDto,
} from './dto/attendance.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { todayKst } from '../common/date.util';

/*
  근태 신청 증빙 사진.

  차량 사진과 같은 자리(uploads)에 두되 폴더만 따로 쓴다 — Apache 가 /uploads 를 그대로
  내주므로 올린 경로가 곧 보이는 주소가 된다.

  다섯 장까지 받는다. 병원 영수증 한 장으로 끝나는 일이 많지만, 진단서가 두 장이거나
  약 봉투까지 찍어 오는 일이 있다.
*/
const REQUEST_PHOTO_FOLDER = 'attendance';
const REQUEST_PHOTO_MAX = 5;
const MAX_REQUEST_PHOTO_SIZE = 8 * 1024 * 1024;
const ALLOWED_REQUEST_PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;


@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 그 달 출퇴근 기록 — 다 같이 본다.
   *
   * 예전에는 직원이 자기 것만 봤다. 그런데 출결 현황을 같이 보기로 하면서 남의 기록이
   * 없으면 화면이 반쪽이 된다 — 순위도 못 내고 달력도 나 혼자만 찍힌다.
   *
   * 출퇴근은 같은 사무실에서 서로 보고 있는 일이라 가리는 값이 아니라고 봤다. 가려야 할
   * 것은 사유가 적히는 쪽(정정 요청)이고 그건 그대로 본인·관리자만 본다.
   *
   * employeeId 를 주면 그 사람 것만 준다.
   */
  @Get('records')
  records(
    @CurrentUser() _user: AuthUser,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.attendance.findRecords(month ?? todayKst().slice(0, 7), employeeId);
  }

  /** 지금 근무 중인 사람 — 누구인지만 준다. 전 직원이 본다. */
  @Get('working')
  working() {
    return this.attendance.workingNow();
  }

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user.id);
  }

  /** 등록된 출근 단말이 있으면 그 PC가 심어둔 키(X-Device-Token)를 같이 봐야 통과한다. */
  @Post('clock-in')
  @HttpCode(200)
  clockIn(
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Headers('x-device-token') deviceToken?: string,
    // 지문을 같이 받아, 예전에 등록돼 지문이 없는 단말을 출근 한 번으로 채운다.
    @Headers('x-device-fingerprint') fingerprint?: string,
  ) {
    return this.attendance.clockIn(user.id, ip, deviceToken, fingerprint);
  }

  @Post('clock-out')
  @HttpCode(200)
  clockOut(@CurrentUser() user: AuthUser) {
    return this.attendance.clockOut(user.id);
  }


  /**
   * 구내식당 체크 — 켜면 그날 식대를 주고, 끄면 안 준다.
   *
   * 본인 것만 적는다. 남의 식대를 올렸다 내렸다 할 수 있으면 체크란이 아니라 급여 수정이다.
   */
  @Patch('meal')
  meal(@CurrentUser() user: AuthUser, @Body() dto: { used?: boolean | null }) {
    return this.attendance.setMeal(user.id, dto.used ?? null);
  }

  // ── 정정 요청 ──

  @Get('corrections')
  corrections(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: RequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    const scope = user.role === Role.ADMIN ? employeeId : user.id;
    return this.attendance.findCorrections(scope, status);
  }

  @Post('corrections')
  createCorrection(@CurrentUser() user: AuthUser, @Body() dto: CreateCorrectionDto) {
    return this.attendance.createCorrection(user.id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('corrections/:id/approve')
  approveCorrection(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.attendance.reviewCorrection(id, true, dto.note);
  }

  @Roles(Role.ADMIN)
  @Patch('corrections/:id/reject')
  rejectCorrection(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.attendance.reviewCorrection(id, false, dto.note);
  }

  // ── 연차 / 외근 신청 ──

  @Get('requests')
  /*
    연차·반차·외근 신청도 같이 본다.

    출결 현황이 이걸 봐야 '쉬기로 한 날'과 '안 찍은 날'을 가른다 — 없으면 연차 쓴 사람이
    결석으로 잡힌다. 누가 언제 쉬는지는 어차피 같이 알아야 일정을 짠다.
  */
  requests(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: RequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    // 보는 사람을 넘긴다 — 증빙 사진은 본인과 관리자에게만 내준다
    return this.attendance.findAttendanceRequests(employeeId, status, user);
  }

  @Post('requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateAttendanceRequestDto) {
    return this.attendance.createAttendanceRequest(user.id, dto);
  }

  /**
   * 증빙 사진 올리기 — 신청을 보내기 전에 먼저 올리고 경로를 받아 함께 보낸다.
   *
   * 원본 파일명은 안 쓴다. 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   */
  @Post('requests/photos')
  @UseInterceptors(
    FilesInterceptor('files', REQUEST_PHOTO_MAX, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_REQUEST_PHOTO_SIZE, files: REQUEST_PHOTO_MAX },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_REQUEST_PHOTO.test(file.mimetype)) {
          cb(new BadRequestException('이미지 파일만 올릴 수 있습니다.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadRequestPhotos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('올릴 사진이 없습니다.');
    // 돌려주는 주소를 화면이 그대로 <img src>에 넣는다 — S3면 절대주소가 온다
    return { urls: await this.storage.saveAll(files, REQUEST_PHOTO_FOLDER) };
  }

  /**
   * 본인이 올린 신청을 고친다 — 아직 안 본 건만.
   *
   * 누가 올린 건지는 서버가 본다. 화면에서 보내는 값으로 가리면 남의 신청도 고쳐진다.
   */
  @Patch('requests/:id')
  updateRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAttendanceRequestDto,
  ) {
    return this.attendance.updateAttendanceRequest(id, user.id, dto);
  }

  /** 본인이 올린 신청을 내린다 — 아직 안 본 건만 */
  @Delete('requests/:id')
  @HttpCode(204)
  async withdrawRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.attendance.withdrawAttendanceRequest(id, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch('requests/:id/approve')
  approveRequest(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.attendance.reviewAttendanceRequest(id, true, dto.note);
  }

  @Roles(Role.ADMIN)
  @Patch('requests/:id/reject')
  rejectRequest(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.attendance.reviewAttendanceRequest(id, false, dto.note);
  }

  @Get('annual-leave')
  annualLeave(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.attendance.annualLeaveUsage(user.id, year ?? todayKst().slice(0, 4));
  }

  // ── 알림 ──

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.attendance.findNotifications(user.id);
  }

  @Patch('notifications/:id/read')
  @HttpCode(204)
  async readOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.attendance.markNotificationRead(id, user.id);
  }

  @Patch('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.attendance.markAllNotificationsRead(user.id);
  }

  // ── IP 화이트리스트 (관리자 전용) ──

  @Roles(Role.ADMIN)
  @Get('ip-whitelist')
  ipWhitelist() {
    return this.attendance.findIpWhitelist();
  }

  @Roles(Role.ADMIN)
  @Post('ip-whitelist')
  addIp(@Body() dto: AddIpDto) {
    return this.attendance.addIp(dto);
  }

  /*
    대역(123.45.67.0/24)은 주소 칸에 넣으면 빗금이 걸린다 — 앞단 Apache가 %2F 를 막아서
    404로 떨어진다. 지울 값은 물음표 뒤로 받는다.
  */
  @Roles(Role.ADMIN)
  @Delete('ip-whitelist')
  @HttpCode(204)
  async removeIpByQuery(@Query('ip') ip: string) {
    await this.attendance.removeIp(ip);
  }

  /** 예전 화면이 쓰던 길 — 한 개짜리 IP는 그대로 지워진다 */
  @Roles(Role.ADMIN)
  @Delete('ip-whitelist/:ip')
  @HttpCode(204)
  async removeIp(@Param('ip') ip: string) {
    await this.attendance.removeIp(ip);
  }

  /** 지금 내 IP — 화이트리스트 등록 화면에서 쓴다 */
  @Get('my-ip')
  myIp(@Ip() ip: string) {
    return { ip };
  }

  // ── 출근 단말 (관리자 전용) ──

  @Roles(Role.ADMIN)
  @Get('devices')
  devices() {
    return this.attendance.listDevices();
  }

  /**
   * 이 요청을 보낸 브라우저를 출근 단말로 등록한다.
   * 응답의 token은 이때 딱 한 번만 내려가고, 그 브라우저가 저장해 두었다가 출근 때 보낸다.
   */
  @Roles(Role.ADMIN)
  @Post('devices')
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.attendance.registerDevice(dto.label, dto.fingerprint);
  }

  /**
   * 단말 키 되찾기.
   *
   * 브라우저 사용기록을 지우면 키가 날아간다. 그때마다 관리자를 부르지 않아도 되게,
   * 사무실 IP 안에서 지문이 맞으면 키를 새로 내준다. 로그인할 때 조용히 부른다.
   *
   * 관리자로 막지 않는다 — 자리 PC를 쓰는 직원 본인이 겪는 일이다.
   * 되찾을 수 없으면 그냥 recovered:false 를 돌려준다(왜 안 되는지는 알려주지 않는다).
   */
  @Post('devices/recover')
  @HttpCode(200)
  recoverDevice(@Ip() ip: string, @Body() dto: RecoverDeviceDto) {
    return this.attendance.recoverDevice(ip, dto.fingerprint);
  }

  @Roles(Role.ADMIN)
  @Delete('devices/:id')
  @HttpCode(204)
  async removeDevice(@Param('id') id: string) {
    await this.attendance.removeDevice(id);
  }
}
