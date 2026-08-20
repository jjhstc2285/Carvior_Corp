import { CalendarClock, LogOut, MessageSquareText, ParkingSquare, ReceiptText, Users2, X } from 'lucide-react';
import type { ModuleKey } from '../modules';
import { useAuth } from '../authStore';

interface Props {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const NAV_ITEMS: { key: ModuleKey; label: string; icon: typeof CalendarClock }[] = [
  { key: 'attendance', label: '출퇴근 관리', icon: CalendarClock },
  { key: 'consultation', label: '알선 상담 관리', icon: MessageSquareText },
  { key: 'settlement', label: '정산 관리', icon: ReceiptText },
  { key: 'parking', label: '주차장 관리', icon: ParkingSquare },
];

export default function Sidebar({ active, onChange, mobileOpen, onMobileClose }: Props) {
  const { user, logout } = useAuth();

  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Users2 size={17} className="text-white" />
          </div>
          <span className="text-[15px] font-bold text-slate-800">통합 관리</span>
        </div>
        <button onClick={onMobileClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { onChange(item.key); onMobileClose(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-slate-700">{user?.name}</p>
          <p className="text-[11px] text-slate-400">{user?.role === 'admin' ? '관리자' : '직원'} · {user?.provider === 'kakao' ? '카카오' : user?.provider === 'naver' ? '네이버' : '관리자 계정'}</p>
        </div>
        <button
          onClick={logout}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={15} /> 로그아웃
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* 데스크탑: 고정 사이드바 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {content}
      </aside>

      {/* 모바일: 오버레이 드로어 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
