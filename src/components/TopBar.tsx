import { Menu, RotateCcw } from 'lucide-react';
import { useStore } from '../store';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

interface Props {
  title: string;
  role: 'employee' | 'admin';
  onMenuClick: () => void;
}

export default function TopBar({ title, role, onMenuClick }: Props) {
  const { resetDemo } = useStore();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2">
          <button onClick={onMenuClick} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden">
            <Menu size={19} />
          </button>
          <span className="text-[15px] font-bold text-slate-800">{title}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {role === 'admin' && <NotificationBell />}

          <button
            onClick={() => { if (confirm('데모 데이터를 초기 상태로 되돌릴까요? (로그인 상태는 유지됩니다)')) resetDemo(); }}
            title="데모 데이터 초기화"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RotateCcw size={16} />
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
