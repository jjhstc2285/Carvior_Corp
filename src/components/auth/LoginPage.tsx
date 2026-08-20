import { useState } from 'react';
import { MessageCircle, ShieldCheck, Users2 } from 'lucide-react';
import { useAuth } from '../../authStore';
import { useStore } from '../../store';
import { loginAsAdmin, loginAsEmployee, loginWithKakao, loginWithNaver } from '../../lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const { state } = useStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleKakao = async () => {
    setLoading('kakao');
    const user = await loginWithKakao();
    login(user);
    setLoading(null);
  };

  const handleNaver = async () => {
    setLoading('naver');
    const user = await loginWithNaver();
    login(user);
    setLoading(null);
  };

  const handleAdminSubmit = async () => {
    setAdminError(null);
    setLoading('admin');
    const user = await loginAsAdmin(adminId.trim(), adminPw);
    setLoading(null);
    if (!user) {
      setAdminError('아이디 또는 비밀번호가 올바르지 않습니다. (데모 계정: admin / admin1234)');
      return;
    }
    login(user);
  };

  const handleDemoEmployee = async (id: string, name: string) => {
    setLoading(`emp-${id}`);
    const user = await loginAsEmployee(id, name);
    login(user);
    setLoading(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600">
            <Users2 size={22} className="text-white" />
          </div>
          <h1 className="mt-3 text-lg font-bold text-slate-800">통합 관리 시스템</h1>
          <p className="mt-1 text-sm text-slate-400">로그인하고 시작하세요</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <button
              onClick={handleKakao}
              disabled={!!loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#3c1e1e] transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#FEE500' }}
            >
              <MessageCircle size={16} />
              {loading === 'kakao' ? '카카오 로그인 중...' : '카카오로 로그인'}
            </button>
            <button
              onClick={handleNaver}
              disabled={!!loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#03C75A' }}
            >
              <span className="text-[13px] font-black">N</span>
              {loading === 'naver' ? '네이버 로그인 중...' : '네이버로 로그인'}
            </button>
          </div>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[11px] text-slate-300">또는</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {!showAdminForm ? (
            <button
              onClick={() => setShowAdminForm(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ShieldCheck size={15} /> 관리자 로그인
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={adminId}
                onChange={e => setAdminId(e.target.value)}
                placeholder="관리자 아이디"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <input
                type="password"
                value={adminPw}
                onChange={e => setAdminPw(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdminSubmit(); }}
                placeholder="비밀번호"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              {adminError && <p className="text-xs text-red-500">{adminError}</p>}
              <button
                onClick={handleAdminSubmit}
                disabled={!!loading}
                className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {loading === 'admin' ? '확인 중...' : '로그인'}
              </button>
              <p className="text-center text-[11px] text-slate-300">데모 계정: admin / admin1234</p>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
          <p className="mb-2 text-[11px] font-semibold text-slate-400">데모용 빠른 로그인 (직원 선택)</p>
          <div className="flex flex-wrap gap-1.5">
            {state.employees.map(e => (
              <button
                key={e.id}
                onClick={() => handleDemoEmployee(e.id, e.name)}
                disabled={!!loading}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {loading === `emp-${e.id}` ? '...' : e.name}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-300">
          카카오·네이버 로그인은 데모용 목업입니다. 실제 서비스 적용 시 각 개발자센터에서<br />앱을 등록해 API 키를 발급받아야 붙일 수 있어요.
        </p>
      </div>
    </div>
  );
}
