import { CalendarClock, Car, ClipboardList, Images, MessageSquare, MessageSquareText, NotebookPen, ParkingSquare, ReceiptText, Users2, X } from 'lucide-react';
import type { ModuleKey } from '../modules';

interface Props {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** 메시지 메뉴에 붙는 안 읽은 개수 */
  chatUnread?: number;
}

const NAV_ITEMS: { key: ModuleKey; label: string; icon: typeof CalendarClock }[] = [
  { key: 'attendance', label: '출퇴근 관리', icon: CalendarClock },
  { key: 'workLog', label: '작업일지', icon: NotebookPen },
  { key: 'consultation', label: '알선 상담 관리', icon: MessageSquareText },
  { key: 'settlement', label: '정산 관리', icon: ReceiptText },
  { key: 'parking', label: '주차장 관리', icon: ParkingSquare },
  { key: 'vehicle', label: '차량 관리', icon: Car },
  { key: 'vehiclePost', label: '매물 사진 등록', icon: Images },
  { key: 'purchaseList', label: '매입리스트', icon: ClipboardList },
  { key: 'chat', label: '메시지', icon: MessageSquare },
];

export default function Sidebar({ active, onChange, mobileOpen, onMobileClose, chatUnread = 0 }: Props) {
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
              {item.key === 'chat' && chatUnread > 0 && (
                <span className="ml-auto inline-flex min-w-4 justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 계정 정보/로그아웃은 상단 네비게이션 바(UserMenu)로 옮김 */}
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
