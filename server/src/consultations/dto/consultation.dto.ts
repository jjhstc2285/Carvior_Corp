import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConsultationKind, ConsultationStatus, PayMethod } from '@prisma/client';
import { DATE_PATTERN, TIME_PATTERN } from '../../common/dto';
import { PLATE_PATTERN } from '../../vehicles/vehicle.rules';

/** 뒤 네 자리만 친 건지 바로 알아보게 적어 준다 */
const PLATE_MESSAGE = '차량번호를 온전히 적어 주세요 — 예: 26무7618 (뒤 네 자리만 적으면 차량 관리와 못 맞춥니다).';

/**
 * 결제 구분 — 할부면 어느 캐피탈로 얼마를 깔았는지 같이 적는다.
 *
 * 재고 금융을 쓴 캐피탈에 약정만큼 채웠는지 세는 값이다.
 * 등록·수정이 같은 칸을 받으므로 한 곳에 두고 물려준다.
 */
class PayFields {
  @IsOptional() @IsEnum(PayMethod) payMethod?: PayMethod;
  @IsOptional() @IsString() @MaxLength(20) installmentCapital?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) installmentAmount?: number;
}

export class CreateConsultationDto extends PayFields {
  /** 알선 / 수출 — 안 주면 알선이다(예전 요청과 호환) */
  @IsOptional() @IsEnum(ConsultationKind) kind?: ConsultationKind;

  /** 유입 경로 — 엔카·KB차차차 등. 목록에 없는 곳도 있어서 자유 입력으로 둔다. */
  @IsOptional() @IsString() @MaxLength(30) platform?: string;

  /*
    차량번호는 온전한 꼴로 받는다.

    전화를 받으면서 뒤 네 자리만 치는 일이 많았다(상담 천구백 건 중 쉰한 건). 그러면
    차량 관리의 번호와 못 맞춰서, 멀쩡히 있는 차가 '차량 관리에 없는 차'로 올라온다 —
    7618 로 적힌 알티마가 실은 26무7618 이다.

    적는 자리에서 막는다. 나중에 맞추려 들면 뒤 네 자리가 같은 차가 둘일 때 누구도
    가릴 수 없다.
  */
  @IsString()
  @IsNotEmpty({ message: '차량번호를 입력해 주세요.' })
  @MaxLength(30)
  @Matches(PLATE_PATTERN, { message: PLATE_MESSAGE })
  vehicleNumber!: string;

  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;

  @IsString()
  @IsNotEmpty({ message: '손님번호를 입력해 주세요.' })
  @MaxLength(20)
  customerPhone!: string;

  /** 예전 양식의 고객명. 새로 등록할 때는 안 쓰지만 기존 상담을 고칠 때 넘어온다. */
  @IsOptional() @IsString() @MaxLength(50) customerName?: string;

  /**
   * 기타 상담에서 판 사람 — 남의 딜러나 그 상사 이름.
   *
   * 우리 직원이 아니라 employeeId 로 못 적는다. 이름만 받아 둔다.
   */
  @IsOptional() @IsString() @MaxLength(60) outsideDealer?: string;

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

  /** 손님 방문 예정일 */
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: 'visitDate는 YYYY-MM-DD 형식이어야 합니다.' })
  visitDate?: string | null;

  /** 방문 시각 — "오후 3시~4시"처럼 적힌 그대로 받는다 */
  @IsOptional() @IsString() @MaxLength(30) visitTime?: string;

  /** 그날 손님을 맞을 담당 딜러 — 빈 글자면 아직 안 정한 것이다 */
  @IsOptional() @IsString() @MaxLength(40) visitDealerId?: string | null;


  /** 출고 입금액(만원) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) depositAmount?: number;

  /** 차가 얼마에 팔렸나(원) — 남의 딜러가 판 건은 TM 만 아는 값이다 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salePrice?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'nextContactDate는 YYYY-MM-DD 형식이어야 합니다.' })
  nextContactDate?: string | null;
}

export class UpdateConsultationDto extends PayFields {
  @IsOptional() @IsEnum(ConsultationKind) kind?: ConsultationKind;
  @IsOptional() @IsString() @MaxLength(30) platform?: string;
  @IsOptional() @IsString() @MaxLength(30) @Matches(PLATE_PATTERN, { message: PLATE_MESSAGE })
  vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleName?: string;
  @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/) visitDate?: string | null;
  @IsOptional() @IsString() @MaxLength(30) visitTime?: string;
  @IsOptional() @IsString() @MaxLength(40) visitDealerId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) depositAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salePrice?: number;
  @IsOptional() @IsString() @MaxLength(50) customerName?: string;
  @IsOptional() @IsString() @MaxLength(60) outsideDealer?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(ConsultationStatus) status?: ConsultationStatus;
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @Matches(TIME_PATTERN) time?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @Matches(DATE_PATTERN) nextContactDate?: string | null;
}
