import { useState, type FormEvent } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../authStore';
import { loginWithPassword } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import SignupForm from './SignupForm';
import SocialLinks from './SocialLinks';

export default function LoginPage() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      login(await loginWithPassword(loginId.trim(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/icon-192.png" alt="애니원모터스" className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover" />
          <h1 className="text-lg font-bold text-slate-900">애니원모터스 통합 관리</h1>
          <p className="mt-1 text-sm text-slate-500">사내 계정으로 로그인해 주세요.</p>
        </div>

        {mode === 'signup' ? (
          <SignupForm onBack={() => setMode('login')} />
        ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className="mb-1 block text-xs font-semibold text-slate-500">아이디</label>
          <input
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />

          <label className="mb-1 block text-xs font-semibold text-slate-500">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            로그인
          </button>
        </form>
        )}

        {mode === 'login' && (
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
            계정이 없으신가요?{' '}
            <button onClick={() => setMode('signup')} className="font-semibold text-indigo-600 underline hover:text-indigo-700">
              회원가입 신청
            </button>
            <br />
            비밀번호를 잊으셨다면 관리자에게 문의해 주세요. 카카오·네이버 로그인은 준비 중입니다.
          </p>
        )}

        {/*
          사업자 정보. 로그인 화면은 밖에서도 열리는 자리라 여기에 둔다.
          대표번호는 눌러서 바로 걸리게 한다 — 휴대폰으로 열어보고 전화하는 일이 대부분이다.
        */}
        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-[11px] leading-relaxed text-slate-400">
          <SocialLinks />
          <p className="mt-3 font-semibold text-slate-500">애니원모터스</p>
          <p className="mt-1">
            대표자 : 장은경
            <span className="mx-1.5 text-slate-300">|</span>
            사업자등록번호 : 690-21-01020
          </p>
          <p className="mt-0.5">
            대표번호 :{' '}
            <a href="tel:0313049700" className="underline hover:text-slate-600">
              031-304-9700
            </a>
          </p>
          <p className="mt-2 text-slate-300">© {new Date().getFullYear()} ANYONE MOTORS</p>
        </footer>
      </div>
    </div>
  );
}
