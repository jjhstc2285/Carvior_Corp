import { Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
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
