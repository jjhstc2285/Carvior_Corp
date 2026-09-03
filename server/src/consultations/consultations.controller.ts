import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ConsultationKind, ConsultationStatus, Role } from '@prisma/client';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto, UpdateConsultationDto } from './dto/consultation.dto';
import { Roles } from '../auth/roles.decorator';

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
