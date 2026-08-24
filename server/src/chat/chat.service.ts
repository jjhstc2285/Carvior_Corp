import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';

interface AuthUser {
  id: string;
  role: Role;
}

const DEFAULT_TAKE = 50;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * 대화 목록.
   * 관리자는 전체 직원과의 대화를, 직원은 자기 대화 하나만 본다.
   *
   * 안 읽은 개수는 "상대가 보낸 것 중 readAt이 없는 것"이다 —
   * 관리자 화면에서는 직원이 보낸 것, 직원 화면에서는 관리자가 보낸 것이 대상이 된다.
   */
  async findConversations(user: AuthUser) {
    const isAdmin = user.role === Role.ADMIN;

    const rows = await this.prisma.conversation.findMany({
      where: isAdmin ? {} : { employeeId: user.id },
      include: {
        employee: { select: { id: true, name: true, position: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, body: true, senderId: true, createdAt: true, readAt: true },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });

    const unreadCounts = await this.prisma.chatMessage.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: rows.map((r) => r.id) },
        readAt: null,
        // 내가 보낸 건 셀 필요가 없다.
        senderId: isAdmin ? undefined : { not: user.id },
        ...(isAdmin ? { sender: { role: { not: Role.ADMIN } } } : {}),
      },
      _count: { _all: true },
    });
    const unreadOf = new Map(unreadCounts.map((u) => [u.conversationId, u._count._all]));

    return rows.map((r) => ({
      id: r.id,
      employee: r.employee,
      lastMessage: r.messages[0] ?? null,
      lastMessageAt: r.lastMessageAt,
      unread: unreadOf.get(r.id) ?? 0,
    }));
  }

  async findMessages(user: AuthUser, employeeId: string, params: { take?: number; before?: string }) {
    this.assertAccess(user, employeeId);
    const conversation = await this.prisma.conversation.findUnique({ where: { employeeId } });
    if (!conversation) return { conversationId: null, messages: [] };

    // 최신부터 잘라온 뒤 오래된 순으로 돌려준다(화면은 위→아래가 시간순).
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(params.before ? { createdAt: { lt: await this.createdAtOf(params.before) } } : {}),
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.take ?? DEFAULT_TAKE,
    });

    return { conversationId: conversation.id, messages: rows.reverse() };
  }

  /**
   * 메시지 전송.
   * 직원은 자기 대화에만, 관리자는 아무 직원에게나 보낼 수 있다.
   * 대화가 없으면 이때 만든다(관리자가 먼저 말을 거는 경우가 대부분이다).
   */
  async send(user: AuthUser, employeeId: string, body: string) {
    this.assertAccess(user, employeeId);

    const target = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');

    const conversation = await this.prisma.conversation.upsert({
      where: { employeeId },
      create: { employeeId, lastMessageAt: new Date() },
      update: { lastMessageAt: new Date() },
    });

    const message = await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, senderId: user.id, body },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const payload = { conversationId: conversation.id, employeeId, message };

    // 대화 상대에게 실시간으로 밀어준다.
    // 관리자가 보냈으면 그 직원에게, 직원이 보냈으면 관리자 전원에게 간다.
    if (user.role === Role.ADMIN) {
      this.realtime.toEmployee(employeeId, REALTIME_EVENT.chatMessage, payload);
      // 다른 관리자 화면의 목록도 같이 갱신되게 한다(같은 대화를 같이 보고 있다).
      this.realtime.toAdmins(REALTIME_EVENT.chatMessage, payload);
    } else {
      this.realtime.toAdmins(REALTIME_EVENT.chatMessage, payload);
    }

    return message;
  }

  /** 상대가 보낸 안 읽은 메시지를 읽음으로 표시하고, 보낸 쪽에 알려준다. */
  async markRead(user: AuthUser, employeeId: string) {
    this.assertAccess(user, employeeId);

    const conversation = await this.prisma.conversation.findUnique({ where: { employeeId } });
    if (!conversation) return { updated: 0 };

    const isAdmin = user.role === Role.ADMIN;
    const readAt = new Date();

    const { count } = await this.prisma.chatMessage.updateMany({
      where: {
        conversationId: conversation.id,
        readAt: null,
        // 관리자는 직원이 보낸 것을, 직원은 관리자가 보낸 것을 읽는다.
        senderId: isAdmin ? employeeId : { not: user.id },
      },
      data: { readAt },
    });

    if (count > 0) {
      const payload = { conversationId: conversation.id, employeeId, readAt, count };
      // 읽음 표시는 보낸 쪽에서 봐야 의미가 있다.
      if (isAdmin) this.realtime.toEmployee(employeeId, REALTIME_EVENT.chatRead, payload);
      else this.realtime.toAdmins(REALTIME_EVENT.chatRead, payload);
    }

    return { updated: count };
  }

  /** 사이드바 배지에 쓰는 전체 안 읽은 수 */
  async unreadCount(user: AuthUser): Promise<{ unread: number }> {
    const isAdmin = user.role === Role.ADMIN;

    const unread = await this.prisma.chatMessage.count({
      where: {
        readAt: null,
        ...(isAdmin
          ? { sender: { role: { not: Role.ADMIN } } }
          : { conversation: { employeeId: user.id }, senderId: { not: user.id } }),
      },
    });
    return { unread };
  }

  private async createdAtOf(messageId: string): Promise<Date> {
    const row = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { createdAt: true },
    });
    if (!row) throw new NotFoundException('기준 메시지를 찾을 수 없습니다.');
    return row.createdAt;
  }

  private assertAccess(user: AuthUser, employeeId: string): void {
    if (user.role !== Role.ADMIN && user.id !== employeeId) {
      throw new ForbiddenException('본인 대화만 볼 수 있습니다.');
    }
  }
}
