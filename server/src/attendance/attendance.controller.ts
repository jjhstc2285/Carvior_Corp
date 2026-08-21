import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestStatus, Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { AddIpDto, CreateAttendanceRequestDto, CreateCorrectionDto, ReviewDto } from './dto/attendance.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { todayKst } from '../common/date.util';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** 직원은 자기 것만, 관리자는 employeeId를 지정하거나 전체를 본다. */
  @Get('records')
  records(
    @CurrentUser() user: AuthUser,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const scope = user.role === Role.ADMIN ? employeeId : user.id;
    return this.attendance.findRecords(month ?? todayKst().slice(0, 7), scope);
  }

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user.id);
  }

  @Post('clock-in')
  @HttpCode(200)
  clockIn(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.clockIn(user.id, ip);
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
  requests(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: RequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    const scope = user.role === Role.ADMIN ? employeeId : user.id;
    return this.attendance.findAttendanceRequests(scope, status);
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
}
