import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { SOCKET_EVENT, onSocketEvent } from '../../lib/socket';
import type { ChatConversation, ChatMessage } from '../../types';

interface MessagesResponse {
  conversationId: string | null;
  messages: ChatMessage[];
}

interface IncomingMessage {
  conversationId: string;
  employeeId: string;
  message: ChatMessage;
}

interface IncomingRead {
  conversationId: string;
  employeeId: string;
  readAt: string;
  count: number;
}

export interface ChatApi {
  conversations: ChatConversation[];
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  /** 지금 열어둔 대화의 직원 id */
  openWith: string | null;
  open: (employeeId: string) => void;
  send: (body: string) => Promise<void>;
  reload: () => Promise<void>;
}

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * 내가 읽었을 때 배지를 내리기 위한 신호.
 *
 * 읽음 처리(chat:read)는 '보낸 쪽'에게만 소켓으로 가므로, 읽은 본인 화면의 배지는
 * 소켓으로 갱신되지 않는다. 그래서 같은 탭 안에서만 쓰는 이벤트로 알린다.
 */
const UNREAD_CHANGED = 'anyone-motors:chat-unread-changed';

function notifyUnreadChanged(): void {
  window.dispatchEvent(new CustomEvent(UNREAD_CHANGED));
}

/** 사이드바 배지용 — 안 읽은 메시지 총 개수 */
export function useChatUnread(): number {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    void api<{ unread: number }>('/chat/unread')
      .then(r => setUnread(r.unread))
      .catch(() => {
        // 배지는 부가 정보라 실패해도 조용히 넘긴다.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const offMessage = onSocketEvent(SOCKET_EVENT.chatMessage, refresh);
    const offRead = onSocketEvent(SOCKET_EVENT.chatRead, refresh);
    window.addEventListener(UNREAD_CHANGED, refresh);
    return () => {
      offMessage();
      offRead();
      window.removeEventListener(UNREAD_CHANGED, refresh);
    };
  }, [refresh]);

  return unread;
}

/** @param myId 내 직원 id — 읽음 표시를 '내가 보낸 메시지'에만 채우기 위해 필요하다. */
export function useChat(myId: string): ChatApi {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [openWith, setOpenWith] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 소켓 핸들러는 한 번만 등록하고 최신 값은 ref로 읽는다(등록/해제를 반복하면 이벤트를 놓친다).
  // 값이 바뀌는 곳은 open() 하나뿐이라 거기서 같이 갱신한다(렌더 중에 ref를 건드리지 않게).
  const openWithRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await api<ChatConversation[]>('/chat/conversations'));
      setError(null);
    } catch (e) {
      setError(message(e, '대화 목록을 불러오지 못했습니다.'));
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  /** 대화를 열면 메시지를 받아오고, 상대가 보낸 것들을 읽음으로 표시한다. */
  const open = useCallback((employeeId: string) => {
    openWithRef.current = employeeId;
    setOpenWith(employeeId);
    setMessages([]);
    setLoading(true);

    void (async () => {
      try {
        const res = await api<MessagesResponse>(`/chat/${employeeId}/messages`);
        // 여는 사이에 다른 대화로 옮겼으면 버린다.
        if (openWithRef.current !== employeeId) return;
        setMessages(res.messages);
        setError(null);

        await api(`/chat/${employeeId}/read`, { method: 'PATCH' });
        setConversations(prev => prev.map(c => (c.employee.id === employeeId ? { ...c, unread: 0 } : c)));
        notifyUnreadChanged();
      } catch (e) {
        if (openWithRef.current === employeeId) setError(message(e, '메시지를 불러오지 못했습니다.'));
      } finally {
        if (openWithRef.current === employeeId) setLoading(false);
      }
    })();
  }, []);

  const send = useCallback(
    async (body: string) => {
      const employeeId = openWithRef.current;
      if (!employeeId || !body.trim()) return;

      setSending(true);
      try {
        const sent = await api<ChatMessage>(`/chat/${employeeId}/messages`, {
          method: 'POST',
          body: { body: body.trim() },
        });
        // 내가 보낸 건 소켓으로 되돌아오지 않을 수도 있어 여기서 바로 붙인다.
        setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
        setError(null);
        await loadConversations();
      } catch (e) {
        setError(message(e, '메시지를 보내지 못했습니다.'));
      } finally {
        setSending(false);
      }
    },
    [loadConversations],
  );

  // 실시간 수신 — 열어둔 대화면 화면에 바로 붙이고, 아니면 목록의 안읽음만 갱신한다.
  useEffect(() => {
    const offMessage = onSocketEvent<IncomingMessage>(SOCKET_EVENT.chatMessage, payload => {
      if (payload.employeeId === openWithRef.current) {
        setMessages(prev => (prev.some(m => m.id === payload.message.id) ? prev : [...prev, payload.message]));
        // 보고 있는 중이니 바로 읽음 처리한다.
        void api(`/chat/${payload.employeeId}/read`, { method: 'PATCH' })
          .then(notifyUnreadChanged)
          .catch(() => {});
      }
      void loadConversations();
    });

    const offRead = onSocketEvent<IncomingRead>(SOCKET_EVENT.chatRead, payload => {
      if (payload.employeeId !== openWithRef.current) return;
      // 읽음 표시는 '내가 보낸' 메시지에만 붙는다 — 상대 메시지까지 칠하면 뜻이 반대가 된다.
      setMessages(prev =>
        prev.map(m => (m.senderId === myId && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
      );
    });

    return () => {
      offMessage();
      offRead();
    };
  }, [loadConversations, myId]);

  return { conversations, messages, loading, sending, error, openWith, open, send, reload: loadConversations };
}
