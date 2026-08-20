import { Bell, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../store';

export default function NotificationBell() {
  const { state, markNotificationRead, markAllNotificationsRead } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = state.notifications.filter(n => !n.read).length;
  const sorted = [...state.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">알림</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
              >
                <Check size={12} /> 모두 읽음
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {sorted.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">알림이 없습니다.</p>
            )}
            {sorted.map(n => (
              <button
                key={n.id}
                onClick={() => markNotificationRead(n.id)}
                className={`block w-full border-b border-slate-50 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-slate-50 ${!n.read ? 'bg-indigo-50/50' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-indigo-500'}`} />
                  <div>
                    <p className={`text-slate-700 ${!n.read ? 'font-medium' : ''}`}>{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{dayjs(n.createdAt).format('M월 D일 HH:mm')}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
