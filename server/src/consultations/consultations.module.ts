import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  // 상담에 적은 차량판매가를 매입 정산으로 옮긴다
  imports: [RealtimeModule, PushModule, SettlementsModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
