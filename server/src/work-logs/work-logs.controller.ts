import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { WorkLogsService } from './work-logs.service';
import { CreateWorkLogDto, UpdateWorkLogDto, WorkLogRangeDto } from './dto/work-log.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@Controller('work-logs')
export class WorkLogsController {
  constructor(private readonly workLogs: WorkLogsService) {}

  /** 주간 화면이 쓰는 범위 조회 — /work-logs?from=2026-08-23&to=2026-08-29 */
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: WorkLogRangeDto) {
    return this.workLogs.findAll(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkLogDto) {
    return this.workLogs.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateWorkLogDto) {
    return this.workLogs.update(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.workLogs.remove(id, user);
  }
}
