import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ConsultationStatus, Role } from '@prisma/client';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  /** 직원은 자기 상담만, 관리자는 전체 */
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: ConsultationStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    const scope = user.role === Role.ADMIN ? employeeId : user.id;
    return this.consultations.findAll({ q, status, employeeId: scope });
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
