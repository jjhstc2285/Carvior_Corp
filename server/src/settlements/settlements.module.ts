import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  // 상담에 적은 차량판매가를 매입 정산으로 옮기느라 상담 쪽에서 가져다 쓴다
  exports: [SettlementsService],
})
export class SettlementsModule {}
