import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../authStore';
import { loginWithPassword } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { alertInfo } from '../../lib/alert';
import OwnerSignupForm from './OwnerSignupForm';
import SignupForm from './SignupForm';
import { AppleMark, GoogleMark, KakaoMark, NaverMark } from './BrandMarks';

/** 아이디 저장 — 비밀번호는 절대 담지 않는다. 아이디만이다. */
const SAVED_ID_KEY = 'carvior.biz.savedLoginId';

function readSavedId() {
  try {
    return localStorage.getItem(SAVED_ID_KEY) ?? '';
  } catch {
    // 사파리 사생활 보호 모드 등에서는 localStorage 접근 자체가 막힌다. 저장만 포기한다.
    return '';
  }
}

type Tab = 'id' | 'carvior';

/**
 * 로그인 화면.
 *
 * 밖에서 제일 먼저 열리는 자리다 — 상사 대표님이 제품을 보러 들어오는 문이기도 해서
 * 사내 화면보다 한 겹 더 다듬어 둔다.
 *
 * 들어오는 길이 둘로 갈린다:
 *  - 아이디 로그인 : 상사에서 발급·승인받은 아이디. 지금 동작하는 길이다.
 *  - 카비어 계정   : 상사 대표님이 카비어 계정(카카오·네이버 포함) 하나로 운영과 검차를
 *                   같이 쓰는 길. 서버에서 받는 부분만 있고 SDK가 아직 안 붙었다.
 *
 * 두 번째 길은 아직 못 쓰는 상태를 숨기지 않는다. 눌러도 아무 일 없는 버튼을 두는 쪽이
 * 준비 중이라고 적어두는 쪽보다 훨씬 나쁘다.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>('id');
  // 가입은 두 갈래다 — 상사를 여는 쪽(대표님)과 그 상사에 들어오는 쪽(직원).
  const [mode, setMode] = useState<'login' | 'signup' | 'ownerSignup'>('login');

  const [loginId, setLoginId] = useState(readSavedId);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => readSavedId() !== '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = loginId.trim() !== '' && password !== '' && !busy;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const id = loginId.trim();
    if (!id || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithPassword(id, password);
      try {
        if (remember) localStorage.setItem(SAVED_ID_KEY, id);
        else localStorage.removeItem(SAVED_ID_KEY);
      } catch {
        // 저장이 안 돼도 로그인은 됐다. 막지 않는다.
      }
      login(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 text-[15px] text-slate-900 outline-none transition ' +
    'placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-5 py-12">
      <main className="w-full max-w-[400px]">
        <header className="mb-7 text-center">
          <img src="/carvior-logo.png" alt="카비어" className="mx-auto h-9 w-auto" />
          <p className="mt-3 text-[13px] font-medium text-slate-400">검차와 상사 운영, A to Z 한 번에</p>
        </header>

        {mode === 'signup' ? (
          <SignupForm onBack={() => setMode('login')} />
        ) : mode === 'ownerSignup' ? (
          <OwnerSignupForm onBack={() => setMode('login')} />
        ) : (
          <>
            {/* 탭 — 들어오는 길을 고른다 */}
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
              <TabButton active={tab === 'id'} onClick={() => setTab('id')}>
                아이디 로그인
              </TabButton>
              <TabButton active={tab === 'carvior'} onClick={() => setTab('carvior')}>
                카비어 계정
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-400 align-middle" aria-hidden />
              </TabButton>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              {tab === 'id' ? (
                <form onSubmit={handleSubmit} noValidate>
                  <input
                    value={loginId}
                    onChange={e => {
                      setLoginId(e.target.value);
                      setError(null);
                    }}
                    placeholder="아이디를 입력하세요."
                    autoComplete="username"
                    autoCapitalize="none"
                    autoFocus
                    className={field}
                  />

                  <input
                    type="password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="비밀번호를 입력하세요."
                    autoComplete="current-password"
                    className={`${field} mt-2.5`}
                  />

                  <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-[13px] text-slate-500 select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="size-4 cursor-pointer rounded border-slate-300 accent-violet-600"
                    />
                    아이디 저장
                  </label>

                  {error && (
                    <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-600">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-[15px] font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-100 disabled:text-violet-400"
                  >
                    {busy && <Loader2 size={17} className="animate-spin" />}
                    로그인
                  </button>

                  <div className="mt-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-100" />
                    <span className="shrink-0 text-[11px] text-slate-400">카비어 계정 로그인은 준비 중이에요</span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>

                  <div className="mt-4">
                    <SocialRow />
                  </div>
                </form>
              ) : (
                <CarviorAccountPanel onUseId={() => setTab('id')} />
              )}
            </div>

            <div className="mt-5 flex items-center justify-center gap-3 text-[13px]">
              <button
                onClick={() => void alertInfo('아이디를 잊으셨나요?', '상사 관리자(대표님·사무장님)께 확인하실 수 있습니다.')}
                className="text-slate-500 transition-colors hover:text-violet-600"
              >
                아이디 찾기
              </button>
              <span className="h-3 w-px bg-slate-200" />
              <button
                onClick={() =>
                  void alertInfo(
                    '비밀번호를 잊으셨나요?',
                    '상사 관리자(대표님·사무장님)께 말씀하시면 바로 새 비밀번호로 바꿔 드립니다. 관리자 계정까지 막혔다면 카비어 고객센터 010-2285-6017로 연락 주세요.',
                  )
                }
                className="text-slate-500 transition-colors hover:text-violet-600"
              >
                비밀번호 찾기
              </button>
            </div>

            {/*
              가입은 순서가 있다 — 대표님이 상사를 열고, 직원이 그 상사에 들어온다.
              직원이 혼자 가입할 수 있으면 어느 상사 사람인지 알 수 없고 승인할 사람도 없다.
              그래서 대표 쪽을 위에, 직원 쪽을 아래에 둔다.

              상사 개설은 신청까지만 화면에서 받는다. 누른다고 상사가 열리지는 않는다 —
              상사마다 데이터가 섞이지 않게 하는 작업이 끝나기 전까지는 사람이 확인하고 손으로 연다.
            */}
            <button
              onClick={() => setMode('ownerSignup')}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50/60 text-[14px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
            >
              상사 대표님 — 상사 개설 신청
            </button>

            <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
              직원이신가요? 대표님이 상사를 연 뒤에 가입하실 수 있습니다.
              <br />
              <button
                onClick={() => setMode('signup')}
                className="mt-1 font-bold text-slate-600 underline-offset-2 hover:text-violet-600 hover:underline"
              >
                우리 상사에 직원으로 가입 신청
              </button>
            </p>
          </>
        )}

        <BizFooter />
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex-1 rounded-xl py-2.5 text-[13px] transition ' +
        (active
          ? 'bg-white font-bold text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)]'
          : 'font-medium text-slate-500 hover:text-slate-700')
      }
    >
      {children}
    </button>
  );
}

/**
 * 카비어 계정 안내.
 *
 * 상사 대표님이 카비어에서 쓰던 계정 그대로 들어오고, 그 계정으로 검차까지 주문하는 그림이다.
 * 아직 연결 전이라 안내만 한다.
 */
function CarviorAccountPanel({ onUseId }: { onUseId: () => void }) {
  return (
    <div className="text-center">
      <img src="/carvior-mark.svg" alt="" className="mx-auto size-12 rounded-2xl" />
      <h2 className="mt-4 text-[15px] font-bold text-slate-900">카비어 계정 하나로 들어오시게 됩니다</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
        카비어에서 쓰시던 계정 그대로 상사 관리에 들어오고,
        <br />
        검차 주문까지 같은 계정으로 하실 수 있게 준비하고 있어요.
      </p>

      <div className="mt-6">
        <SocialRow />
      </div>

      <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-[12px] leading-relaxed text-slate-500">
        지금은 발급받으신 아이디로 들어와 주세요.{' '}
        <button onClick={onUseId} className="font-bold text-violet-600 underline-offset-2 hover:underline">
          아이디 로그인
        </button>
      </p>
    </div>
  );
}

const SOCIALS = [
  { key: 'kakao', label: '카카오', Mark: KakaoMark, className: 'bg-[#FEE500] text-[#191600]' },
  { key: 'naver', label: '네이버', Mark: NaverMark, className: 'bg-[#03C75A] text-white' },
  { key: 'google', label: '구글', Mark: GoogleMark, className: 'border border-slate-200 bg-white' },
  { key: 'apple', label: '애플', Mark: AppleMark, className: 'bg-slate-900 text-white' },
] as const;

/**
 * SNS 로그인 줄.
 *
 * 전부 아직 못 쓴다 — 카카오·네이버는 서버에서 받는 부분만 있고 SDK가 안 붙었다.
 * 눌리는 척하지 않게 disabled 로 두고, 왜 못 쓰는지 title 로 알려준다.
 */
function SocialRow() {
  return (
    <div className="flex justify-center gap-3">
      {SOCIALS.map(({ key, label, Mark, className }) => (
        <button
          key={key}
          type="button"
          disabled
          title={`${label} 로그인 — 준비 중입니다`}
          aria-label={`${label} 로그인 (준비 중)`}
          className={`flex size-11 items-center justify-center rounded-full opacity-40 ${className}`}
        >
          <Mark className="size-5" />
        </button>
      ))}
    </div>
  );
}

/**
 * 사업자 정보.
 *
 * 로그인 화면은 밖에서도 열리는 자리라 여기에 둔다. 전화번호는 눌러서 바로 걸리게 한다 —
 * 휴대폰으로 열어보고 전화하는 일이 대부분이다.
 */
function BizFooter() {
  return (
    <footer className="mt-10 border-t border-slate-100 pt-6 text-center text-[11px] leading-relaxed text-slate-400">
      <p className="font-semibold text-slate-500">카비어 주식회사</p>
      <p className="mt-1.5">
        대표자 : 조재혁, 유진욱
        <span className="mx-1.5 text-slate-300">|</span>
        사업자등록번호 : 889-81-03879
      </p>
      <p className="mt-0.5">통신판매업신고 : 제 2026-경기안산-0474</p>
      <p className="mt-0.5">경기도 안산시 단원구 원포공원1로 59, A동 5층 2호 (초지동, 신명트윈타워)</p>
      <p className="mt-1.5">
        대표번호{' '}
        <a href="tel:07041382017" className="underline-offset-2 hover:text-slate-600 hover:underline">
          070-4138-2017
        </a>
        <span className="mx-1.5 text-slate-300">|</span>
        고객센터{' '}
        <a href="tel:01022856017" className="underline-offset-2 hover:text-slate-600 hover:underline">
          010-2285-6017
        </a>
      </p>
      <p className="mt-3 text-slate-300">© {new Date().getFullYear()} CARVIOR Corp.</p>
    </footer>
  );
}
