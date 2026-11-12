import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { DuplicateSweepService } from './duplicate-sweep.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [SettlementsController],
  // 판매가를 네 곳에 맞추는 일은 sale-price 모듈이 한다(전역)
  providers: [SettlementsService, DuplicateSweepService],
  // 상담에 적은 차량판매가를 매입 정산으로 옮기느라 상담 쪽에서 가져다 쓴다
  exports: [SettlementsService],
})
export class SettlementsModule {}
