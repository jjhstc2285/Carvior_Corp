import { Building2, CalendarClock, Megaphone, Stamp, Car, Landmark, Handshake, Sparkles, MessageSquare, MessageSquareText, NotebookPen, ParkingSquare, ReceiptText, X } from 'lucide-react';
import type { ModuleKey } from '../modules';

interface Props {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** 메시지 메뉴에 붙는 안 읽은 개수 */
  chatUnread?: number;
  /** 이 사람이 볼 수 없는 메뉴는 아예 안 그린다 */
  canSeeLedger: boolean;
}

const NAV_ITEMS: { key: ModuleKey; label: string; icon: typeof CalendarClock }[] = [
  { key: 'attendance', label: '출퇴근 관리', icon: CalendarClock },
  { key: 'workLog', label: '업무 일지(작업 일지)', icon: NotebookPen },
  { key: 'approval', label: '결재 관리', icon: Stamp },
  { key: 'consultation', label: '상담 관리', icon: MessageSquareText },
  { key: 'settlement', label: '정산 관리', icon: ReceiptText },
  { key: 'parking', label: '주차장 관리', icon: ParkingSquare },
  { key: 'vehicle', label: '차량 관리', icon: Car },
  { key: 'ad', label: '광고 관리', icon: Megaphone },
  { key: 'purchaseIntake', label: '매입 관리', icon: Handshake },
  { key: 'stockFinance', label: '재고금융 (제시)', icon: Landmark },
  { key: 'dealerFee', label: '신차영업소 상조회비', icon: Building2 },
  { key: 'cleaning', label: '청소 관리 대장', icon: Sparkles },
  { key: 'chat', label: '메시지', icon: MessageSquare },
];

export default function Sidebar({
  active,
  onChange,
  mobileOpen,
  onMobileClose,
  chatUnread = 0,
  canSeeLedger,
}: Props) {
  // 상조회비 대장은 사무장과 관리자만 본다.
  const officeOnly: ModuleKey[] = ['dealerFee'];
  const navItems = NAV_ITEMS.filter(item => !officeOnly.includes(item.key) || canSeeLedger);
  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          {/* 회사 로고. public/ 에 두고 경로로 부른다 — 번들에 안 섞여서 브라우저가 따로 캐시한다 */}
          <img src="/icon-192.png" alt="애니원모터스" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-[15px] font-bold text-slate-800">애니원모터스</span>
        </div>
        <button onClick={onMobileClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {navItems.map(item => {
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
