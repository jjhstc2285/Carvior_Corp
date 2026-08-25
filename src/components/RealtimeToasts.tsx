import { useEffect, useState } from 'react';
import { Bell, MessageSquare, X } from 'lucide-react';
import { SOCKET_EVENT, onSocketEvent } from '../lib/socket';

interface Toast {
  id: number;
  kind: 'notification' | 'chat';
  title: string;
  body: string;
}

const VISIBLE_MS = 6000;
const MAX_STACK = 3;

/**
 * 실시간으로 도착한 알림·메시지를 화면 우측 아래에 잠깐 띄운다.
 *
 * 내용 자체는 알림 목록과 메시지 화면에 남으므로, 여기서는 놓치지 않게 눈에 띄게만 해준다.
 * 지금 보고 있지 않은 화면의 소식도 알 수 있게 앱 전체에 하나만 띄워둔다.
 */
export default function RealtimeToasts({ onOpenChat }: { onOpenChat?: () => void }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;

    const push = (kind: Toast['kind'], title: string, body: string) => {
      const id = ++seq;
      // 오래된 것부터 밀어내 화면을 다 덮지 않게 한다.
      setToasts(prev => [...prev, { id, kind, title, body }].slice(-MAX_STACK));
      window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), VISIBLE_MS);
    };

    const offNotification = onSocketEvent<{ message?: string }>(SOCKET_EVENT.notification, payload => {
      push('notification', '새 알림', payload?.message ?? '알림이 도착했습니다.');
    });

    const offChat = onSocketEvent<{ message?: { body?: string; sender?: { name?: string } } }>(
      SOCKET_EVENT.chatMessage,
      payload => {
        push('chat', `${payload?.message?.sender?.name ?? '새'} 메시지`, payload?.message?.body ?? '');
      },
    );

    return () => {
      offNotification();
      offChat();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    // 우측 하단은 채널톡 상담 버튼 자리라 그만큼 띄운다
    <div className="fixed bottom-24 right-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg"
        >
          <span className={`mt-0.5 shrink-0 ${t.kind === 'chat' ? 'text-indigo-500' : 'text-amber-500'}`}>
            {t.kind === 'chat' ? <MessageSquare size={15} /> : <Bell size={15} />}
          </span>
          <button
            onClick={() => {
              if (t.kind === 'chat') onOpenChat?.();
              setToasts(prev => prev.filter(x => x.id !== t.id));
            }}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-xs font-bold text-slate-800">{t.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.body}</p>
          </button>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="shrink-0 text-slate-300 hover:text-slate-500"
            aria-label="닫기"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
