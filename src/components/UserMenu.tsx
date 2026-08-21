import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../authStore';
import type { AuthProvider } from '../lib/auth';

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  KAKAO: '카카오',
  NAVER: '네이버',
  LOCAL: '사내 계정',
};

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const roleLabel = user.role === 'ADMIN' ? '관리자' : '직원';
  const providerLabel = user.provider ? PROVIDER_LABEL[user.provider] : '사내 계정';

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors ${open ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[12px] font-bold text-white">
          {user.name.slice(0, 1)}
        </span>
        {/* 모바일에선 이름까지만, 데스크탑에선 역할도 같이 */}
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-slate-700">{user.name}</span>
          <span className="block text-[11px] text-slate-400">{roleLabel} · {providerLabel}</span>
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3.5 py-3">
            <p className="truncate text-sm font-semibold text-slate-700">{user.name}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{roleLabel} · {providerLabel}</p>
          </div>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={15} /> 로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
