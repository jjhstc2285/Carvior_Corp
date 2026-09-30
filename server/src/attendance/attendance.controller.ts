import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, Param, Patch, Post, Query } from '@nestjs/common';
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

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

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
    @CurrentUser() _user: AuthUser,
    @Query('status') status?: RequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.attendance.findAttendanceRequests(employeeId, status);
  }

  @Post('requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateAttendanceRequestDto) {
    return this.attendance.createAttendanceRequest(user.id, dto);
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
