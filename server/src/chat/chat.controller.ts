import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessageQueryDto, SendMessageDto } from './dto/chat.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/**
 * 1:1 메시지.
 *
 * 경로의 :partnerId는 '대화 상대의 직원 id'다(대화 id를 몰라도 열 수 있다).
 * 관리자는 아무에게나, 직원은 관리자에게만 보낼 수 있다 — 검사는 서비스에서 한다.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  conversations(@CurrentUser() user: AuthUser) {
    return this.chat.findConversations(user);
  }

  /** 사이드바 배지용 — 안 읽은 메시지 총 개수 */
  @Get('unread')
  unread(@CurrentUser() user: AuthUser) {
    return this.chat.unreadCount(user);
  }

  @Get(':partnerId/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('partnerId') partnerId: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.chat.findMessages(user, partnerId, query);
  }

  @Post(':partnerId/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user, partnerId, dto.body);
  }

  @Patch(':partnerId/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param('partnerId') partnerId: string) {
    return this.chat.markRead(user, partnerId);
  }
}
