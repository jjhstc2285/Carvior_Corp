import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVehiclePostDto {
  @IsString() @IsNotEmpty({ message: '사이트를 선택해 주세요.' }) @MaxLength(30) site!: string;
  @IsString() @IsNotEmpty({ message: '차량번호를 입력해 주세요.' }) @MaxLength(30) vehicleNumber!: string;
  @IsString() @IsNotEmpty({ message: '차명을 입력해 주세요.' }) @MaxLength(60) vehicleModel!: string;
  @IsString() @IsNotEmpty({ message: '손님번호를 입력해 주세요.' }) @MaxLength(30) customerPhone!: string;
  @IsString() @IsNotEmpty({ message: '내용을 입력해 주세요.' }) content!: string;

  /** 업로드 API(/vehicle-posts/photos)로 먼저 올린 뒤 받은 url 목록 */
  @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
}

export class UpdateVehiclePostDto {
  @IsOptional() @IsString() @MaxLength(30) site?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleModel?: string;
  @IsOptional() @IsString() @MaxLength(30) customerPhone?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
}
