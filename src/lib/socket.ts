import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

/**
 * 실시간 채널(socket.io) 클라이언트.
 *
 * 소켓은 앱 전체에서 하나만 쓴다 — 화면마다 새로 붙으면 같은 알림이 여러 번 오고
 * 연결도 그만큼 늘어난다. 로그인/로그아웃 때만 붙이고 끊는다.
 *
 * 인증은 HTTP와 같은 JWT다(handshake.auth.token). 서버는 검증에 실패하면 바로 끊는다.
 */

/** 서버 src/realtime/realtime.gateway.ts 의 REALTIME_EVENT 와 맞춰야 한다. */
export const SOCKET_EVENT = {
  notification: 'notification',
  /** 근태 승인함이 바뀌었다 — 신청이 들어오거나 처리됐다 */
  attendanceInbox: 'attendance:inbox',
  chatMessage: 'chat:message',
  chatRead: 'chat:read',
} as const;

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];

// 개발 중 Vite dev 서버에서는 API 주소로 직접 붙는다(같은 도메인이면 Apache가 넘겨준다).
const SOCKET_URL = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/api\/?$/, '') ?? '';

let socket: Socket | null = null;

export function connectSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  if (socket?.connected || socket?.active) return socket;

  socket = io(SOCKET_URL || window.location.origin, {
    path: '/socket.io',
    auth: { token },
    // 프록시 설정이 덜 됐을 때도 최소한 동작하도록 롱폴링을 남겨둔다.
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

/**
 * 이벤트 구독. 반환된 함수를 호출하면 구독만 해제된다(소켓은 그대로 둔다).
 * 소켓이 아직 없으면 아무것도 안 하고 빈 해제 함수를 준다 — 호출부에서 분기하지 않게.
 */
export function onSocketEvent<T>(event: SocketEvent, handler: (payload: T) => void): () => void {
  // 자식 컴포넌트의 effect가 로그인 쪽 연결 effect보다 먼저 도는 경우가 있어,
  // 소켓이 아직 없으면 여기서 붙인다(connectSocket은 이미 있으면 그대로 돌려준다).
  const current = socket ?? connectSocket();
  if (!current) return () => {};

  current.on(event, handler as (...args: unknown[]) => void);
  return () => current.off(event, handler as (...args: unknown[]) => void);
}
