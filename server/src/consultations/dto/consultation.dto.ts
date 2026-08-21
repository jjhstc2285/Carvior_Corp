import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ConsultationStatus } from '@prisma/client';
import { DATE_PATTERN, TIME_PATTERN } from '../../common/dto';

export class CreateConsultationDto {
  @IsString()
  @IsNotEmpty({ message: '차량번호를 입력해 주세요.' })
  @MaxLength(30)
  vehicleNumber!: string;

  @IsString()
  @IsNotEmpty({ message: '고객명을 입력해 주세요.' })
  @MaxLength(50)
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @Matches(DATE_PATTERN, { message: 'date는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @Matches(TIME_PATTERN, { message: 'time은 HH:mm 형식이어야 합니다.' })
  time!: string;

  @IsString()
  @IsNotEmpty({ message: '상담내용을 입력해 주세요.' })
  content!: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'nextContactDate는 YYYY-MM-DD 형식이어야 합니다.' })
  nextContactDate?: string | null;
}

export class UpdateConsultationDto {
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) customerName?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(ConsultationStatus) status?: ConsultationStatus;
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @Matches(TIME_PATTERN) time?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @Matches(DATE_PATTERN) nextContactDate?: string | null;
}
