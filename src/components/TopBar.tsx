import { useState } from 'react';
import { Car, Loader2, Menu, MessageSquare, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import type { Role } from '../types';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import VehicleLookupModal from './vehicle/VehicleLookupModal';

interface Props {
  title: string;
  role: Role;
  onMenuClick: () => void;
  /** 안 읽은 메시지 수 — 0이면 배지를 감춘다 */
  chatUnread: number;
  onOpenChat: () => void;
}

export default function TopBar({ title, role, onMenuClick, chatUnread, onOpenChat }: Props) {
  const { refresh, loading, error } = useStore();
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      {/*
        휴대폰에서 오른쪽 아이콘들이 자리를 다 먹어 제목이 한 글자 폭으로 눌렸다.
        '주차장 관리'가 세로로 한 자씩 쌓여 읽을 수가 없었다.
        제목은 줄이되 줄바꿈은 안 하고(길면 …), 오른쪽 묶음은 안 줄어들게 못박는다.
      */}
      <div className="flex items-center justify-between gap-2 px-3 py-3.5 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1.5">
          <button onClick={onMenuClick} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden">
            <Menu size={19} />
          </button>
          <span className="truncate whitespace-nowrap text-[15px] font-bold text-slate-800">{title}</span>
          {error && <span className="hidden text-xs text-red-500 sm:inline">{error}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-3">
          {/* 마당에서 전화를 받으면서 차를 찾는다 — 어느 화면에 있든 눌러서 찾게 둔다 */}
          <button
            onClick={() => setLookupOpen(true)}
            title="차량 조회 — 차량번호로 그 차가 어디 있는지 봅니다"
            className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Car size={19} />
          </button>

          {/* 어느 화면에 있든 안 읽은 메시지가 눈에 띄게 계정 옆에 둔다 */}
          <button
            onClick={onOpenChat}
            title="메시지"
            className="relative rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
          >
            <MessageSquare size={19} />
            {chatUnread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {chatUnread}
              </span>
            )}
          </button>

          {role === 'ADMIN' && <NotificationBell />}

          <button
            onClick={() => void refresh()}
            disabled={loading}
            title="새로고침"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <UserMenu />
        </div>
      </div>

      {lookupOpen && <VehicleLookupModal onClose={() => setLookupOpen(false)} />}
    </header>
  );
}
