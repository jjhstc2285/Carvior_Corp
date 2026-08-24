import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessageQueryDto, SendMessageDto } from './dto/chat.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/**
 * 관리자 ↔ 직원 메시지.
 *
 * 대화는 직원 기준으로 하나이므로 경로도 직원 id로 잡는다(대화 id를 몰라도 열 수 있다).
 * 직원은 자기 employeeId만 접근되고, 관리자는 전부 접근된다 — 검사는 서비스에서 한다.
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

  @Get(':employeeId/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.chat.findMessages(user, employeeId, query);
  }

  @Post(':employeeId/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user, employeeId, dto.body);
  }

  @Patch(':employeeId/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.chat.markRead(user, employeeId);
  }
}
