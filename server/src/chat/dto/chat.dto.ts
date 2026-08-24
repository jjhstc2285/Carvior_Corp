import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SendMessageDto {
  @IsString() @IsNotEmpty({ message: '메시지를 입력해 주세요.' }) @MaxLength(2000) body!: string;
}

export class MessageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) take?: number;

  /** 이 메시지 id보다 이전 것들을 가져온다(위로 스크롤할 때) */
  @IsOptional() @IsString() before?: string;
}
