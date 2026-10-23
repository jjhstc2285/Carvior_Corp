import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { SalePriceSyncService } from './sale-price-sync.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [SettlementsController],
  // 차량판매가는 돌면서 저절로 들어간다 — 누가 버튼을 눌러 줘야 맞는 숫자면 안 맞는다
  providers: [SettlementsService, SalePriceSyncService],
  // 상담에 적은 차량판매가를 매입 정산으로 옮기느라 상담 쪽에서 가져다 쓴다
  exports: [SettlementsService],
})
export class SettlementsModule {}
