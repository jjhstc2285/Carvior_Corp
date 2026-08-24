import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
