import { Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateStatusDto } from './dto/employee.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  /** 목록은 전 직원이 볼 수 있다(담당자 선택 드롭다운 등에 쓰임). */
  @Get()
  findAll(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.employees.findAll(includeInactive ?? false);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employees.findOne(id);
  }

  /**
   * 내 상태 적기 — "🚗 외근 중" 처럼.
   *
   * :id 보다 먼저 선언해야 'me' 가 id 로 잡히지 않는다.
   * 본인 것만 고친다 — 남의 상태를 대신 적으면 그 사람이 말한 게 아니게 된다.
   */
  @Patch('me/status')
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: UpdateStatusDto) {
    return this.employees.setStatus(user.id, dto);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  /** 퇴사 처리 — 실제 삭제가 아니라 비활성화(이력 보존) */
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async deactivate(@Param('id') id: string) {
    await this.employees.deactivate(id);
  }
}
