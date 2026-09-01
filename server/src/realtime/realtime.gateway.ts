import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/** 브라우저가 듣는 이벤트 이름 — 프론트 src/lib/socket.ts 와 맞춰야 한다. */
export const REALTIME_EVENT = {
  /** 알림이 하나 생겼다(승인/반려·출퇴근 누락 등) */
  notification: 'notification',
  /**
   * 근태 승인함이 바뀌었다(신청이 들어오거나 처리됐다).
   *
   * 알림(notification)과 따로 두는 이유: 알림은 '읽을 거리'라 목록만 갱신하면 되지만,
   * 이건 화면의 승인 대기 목록을 다시 받아야 한다. 한 이벤트로 뭉치면 알림이 올 때마다
   * 관계없는 목록까지 다시 받게 된다.
   */
  attendanceInbox: 'attendance:inbox',
  /** 새 메시지가 도착했다 */
  chatMessage: 'chat:message',
  /** 내가 보낸 메시지를 상대가 읽었다 */
  chatRead: 'chat:read',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENT)[keyof typeof REALTIME_EVENT];

function employeeRoom(employeeId: string): string {
  return `employee:${employeeId}`;
}

const ADMIN_ROOM = 'role:admin';

/**
 * 실시간 알림 게이트웨이.
 *
 * 지금까지 알림은 DB에만 쌓여서 새로고침해야 보였다. 브라우저를 열어둔 사람에게 바로
 * 띄우기 위해 socket.io를 붙인다.
 *
 * 인증은 HTTP와 같은 JWT를 쓴다 — 접속할 때 handshake.auth.token 으로 받아서 검증하고,
 * 통과한 소켓만 자기 방(employee:<id>)에 넣는다. 검증 못 하면 바로 끊는다.
 * 방에 넣는 이유: 알림을 보낼 때 "누구에게"를 소켓 목록을 뒤지지 않고 room 하나로 지정할 수 있다.
 */
@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.tokenOf(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    let employeeId: string;
    try {
      const payload = this.jwt.verify<{ sub: string; pending?: boolean }>(token);
      // 소셜 연결 대기용 단기 토큰으로는 실시간 채널을 못 쓰게 막는다.
      if (payload.pending || !payload.sub) throw new Error('invalid token');
      employeeId = payload.sub;
    } catch {
      client.disconnect(true);
      return;
    }

    // 토큰이 살아 있어도 퇴사 처리된 계정이면 붙이지 않는다.
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, active: true },
    });
    if (!employee?.active) {
      client.disconnect(true);
      return;
    }

    client.data.employeeId = employee.id;
    await client.join(employeeRoom(employee.id));
    if (employee.role === Role.ADMIN) await client.join(ADMIN_ROOM);

    this.logger.log(`연결: ${employee.id}${employee.role === Role.ADMIN ? ' (관리자)' : ''}`);
  }

  handleDisconnect(client: Socket): void {
    const employeeId = client.data?.employeeId as string | undefined;
    if (employeeId) this.logger.log(`해제: ${employeeId}`);
  }

  /**
   * 특정 직원의 열려 있는 모든 탭으로 보낸다.
   * 아무 탭도 안 열려 있으면 그냥 사라진다 — 내용은 DB에 남아 있으니 다음 접속에 목록으로 본다.
   */
  toEmployee(employeeId: string, event: RealtimeEvent, payload: unknown): void {
    this.server?.to(employeeRoom(employeeId)).emit(event, payload);
  }

  /** 여러 명에게 한 번에 — 승인 대기 알림처럼 관리자 여러 명이 대상일 때 */
  toEmployees(employeeIds: string[], event: RealtimeEvent, payload: unknown): void {
    if (employeeIds.length === 0) return;
    this.server?.to(employeeIds.map(employeeRoom)).emit(event, payload);
  }

  /** 관리자 전원 — 누가 관리자인지 조회하지 않아도 되게 접속 때 방에 넣어둔다. */
  toAdmins(event: RealtimeEvent, payload: unknown): void {
    this.server?.to(ADMIN_ROOM).emit(event, payload);
  }

  /** 토큰은 handshake.auth 로 받는 게 기본이고, 쿼리스트링도 허용한다(디버깅 편의). */
  private tokenOf(client: Socket): string | null {
    const fromAuth = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;

    const fromQuery = client.handshake.query?.token;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;

    return null;
  }
}
