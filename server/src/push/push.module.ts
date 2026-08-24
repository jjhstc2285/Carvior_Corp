import { Body, Controller, Delete, Get, Headers, Module, Post } from '@nestjs/common';
import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import { PushService } from './push.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

class SubscribeDto {
  @IsString() @IsNotEmpty() @MaxLength(500) endpoint!: string;
  @IsObject() keys!: { p256dh: string; auth: string };
}

class UnsubscribeDto {
  @IsString() @IsNotEmpty() @MaxLength(500) endpoint!: string;
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** 구독에 필요한 VAPID 공개키. enabled=false면 프론트가 알림 켜기 UI를 감춘다. */
  @Get('status')
  status() {
    return this.push.status();
  }

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(user.id, { ...dto, userAgent });
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(dto.endpoint);
  }
}

@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
