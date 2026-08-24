import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENT, RealtimeGateway } from '../realtime/realtime.gateway';
import { PushService } from '../push/push.service';

interface AuthUser {
  id: string;
  role: Role;
}

const DEFAULT_TAKE = 50;

const PARTNER_SELECT = { select: { id: true, name: true, position: true, role: true } };
const SENDER_SELECT = { select: { id: true, name: true, role: true, position: true } };

/** 알림에는 이름만으로 누군지 헷갈리는 경우가 있어 직급을 같이 붙인다. */
function label(name: string, position?: string | null): string {
  return position ? `${name} ${position}` : name;
}

/**
 * 1:1 메시지.
 *
 * 대화는 (직원, 관리자) 쌍마다 하나다. 직원이 "안원용 본부장님께만" 보낼 수 있어야 해서
 * 관리자 전원이 한 방을 쓰던 구조를 쪼갰다.
 *
 * 컬럼 이름은 employeeId/adminId지만 조회는 "내가 어느 쪽이든" 걸리게 한다 —
 * 관리자끼리 주고받으면 한 명이 employeeId 자리에 들어가기 때문이다.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * 내가 낀 대화 목록.
   * 관리자는 자기에게 말을 건 직원들이, 직원은 자기가 말을 건 관리자들이 상대로 나온다.
   *
   * 안 읽은 개수는 "내가 보내지 않았고 아직 안 읽은 것"이다 — 방이 1:1이라 이걸로 충분하다.
   */
  async findConversations(user: AuthUser) {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ employeeId: user.id }, { adminId: user.id }] },
      include: {
        employee: PARTNER_SELECT,
        admin: PARTNER_SELECT,
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
        senderId: { not: user.id },
      },
      _count: { _all: true },
    });
    const unreadOf = new Map(unreadCounts.map((u) => [u.conversationId, u._count._all]));

    return rows.map((r) => ({
      id: r.id,
      // 화면에 필요한 건 "상대가 누구냐"다. 내가 어느 자리에 있는지는 감춘다.
      partner: r.employeeId === user.id ? r.admin : r.employee,
      lastMessage: r.messages[0] ?? null,
      lastMessageAt: r.lastMessageAt,
      unread: unreadOf.get(r.id) ?? 0,
    }));
  }

  async findMessages(user: AuthUser, partnerId: string, params: { take?: number; before?: string }) {
    const pair = await this.pairOf(user, partnerId);
    const conversation = await this.prisma.conversation.findUnique({ where: { employeeId_adminId: pair } });
    if (!conversation) return { conversationId: null, messages: [] };

    // 최신부터 잘라온 뒤 오래된 순으로 돌려준다(화면은 위→아래가 시간순).
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(params.before ? { createdAt: { lt: await this.createdAtOf(params.before) } } : {}),
      },
      include: { sender: SENDER_SELECT },
      orderBy: { createdAt: 'desc' },
      take: params.take ?? DEFAULT_TAKE,
    });

    return { conversationId: conversation.id, messages: rows.reverse() };
  }

  /** 메시지 전송. 대화가 없으면 이때 만든다(먼저 말을 거는 쪽이 만든다). */
  async send(user: AuthUser, partnerId: string, body: string) {
    const pair = await this.pairOf(user, partnerId);

    const conversation = await this.prisma.conversation.upsert({
      where: { employeeId_adminId: pair },
      create: { ...pair, lastMessageAt: new Date() },
      update: { lastMessageAt: new Date() },
    });

    const message = await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, senderId: user.id, body },
      include: { sender: SENDER_SELECT },
    });

    // 받는 사람 입장에서 이 대화의 상대는 '보낸 사람'이다.
    const payload = { conversationId: conversation.id, partnerId: user.id, message };
    this.realtime.toEmployee(partnerId, REALTIME_EVENT.chatMessage, payload);

    // 창을 닫아둔 사이에 오는 경우가 대부분이라 웹 푸시가 특히 의미가 있다.
    // 발송을 기다리지 않는다 — 실패해도 메시지는 이미 저장됐다.
    void this.push.sendToEmployees([partnerId], {
      title: `${label(message.sender.name, message.sender.position)}님의 메시지`,
      body,
      // 같은 대화의 알림은 tag로 덮어써서 쌓이지 않게 한다.
      tag: `chat:${conversation.id}`,
    });

    return message;
  }

  /** 상대가 보낸 안 읽은 메시지를 읽음으로 표시하고, 보낸 쪽에 알려준다. */
  async markRead(user: AuthUser, partnerId: string) {
    const pair = await this.pairOf(user, partnerId);
    const conversation = await this.prisma.conversation.findUnique({ where: { employeeId_adminId: pair } });
    if (!conversation) return { updated: 0 };

    const readAt = new Date();
    const { count } = await this.prisma.chatMessage.updateMany({
      where: { conversationId: conversation.id, readAt: null, senderId: { not: user.id } },
      data: { readAt },
    });

    // 읽음 표시는 보낸 쪽에서 봐야 의미가 있다. 그쪽에서 이 대화의 상대는 나다.
    if (count > 0) {
      this.realtime.toEmployee(partnerId, REALTIME_EVENT.chatRead, {
        conversationId: conversation.id,
        partnerId: user.id,
        readAt,
        count,
      });
    }

    return { updated: count };
  }

  /** 사이드바·상단바 배지에 쓰는 전체 안 읽은 수 */
  async unreadCount(user: AuthUser): Promise<{ unread: number }> {
    const unread = await this.prisma.chatMessage.count({
      where: {
        readAt: null,
        senderId: { not: user.id },
        conversation: { OR: [{ employeeId: user.id }, { adminId: user.id }] },
      },
    });
    return { unread };
  }

  /**
   * 나와 상대를 (employeeId, adminId) 자리에 배치한다.
   *
   * 관리자가 있는 쪽이 adminId다. 둘 다 관리자면 말을 건 쪽을 adminId로 둔다 —
   * 자리만 정하면 되고 이후 조회는 양쪽 다 걸리므로 어느 쪽이어도 상관없다.
   * 직원끼리는 아직 막는다(관리자와의 대화만 쓰는 화면이라 열어두면 오히려 헷갈린다).
   */
  private async pairOf(user: AuthUser, partnerId: string): Promise<{ employeeId: string; adminId: string }> {
    if (partnerId === user.id) throw new BadRequestException('자기 자신과는 대화할 수 없습니다.');

    const partner = await this.prisma.employee.findUnique({
      where: { id: partnerId },
      select: { id: true, role: true, active: true },
    });
    if (!partner) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
    if (!partner.active) throw new BadRequestException('퇴사 처리된 계정과는 대화할 수 없습니다.');

    if (user.role === Role.ADMIN) return { employeeId: partner.id, adminId: user.id };

    if (partner.role !== Role.ADMIN) {
      throw new ForbiddenException('관리자에게만 메시지를 보낼 수 있습니다.');
    }
    return { employeeId: user.id, adminId: partner.id };
  }

  private async createdAtOf(messageId: string): Promise<Date> {
    const row = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { createdAt: true },
    });
    if (!row) throw new NotFoundException('기준 메시지를 찾을 수 없습니다.');
    return row.createdAt;
  }
}
