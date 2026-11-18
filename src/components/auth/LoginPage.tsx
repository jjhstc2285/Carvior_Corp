import { useState, type FormEvent } from 'react';
import { Building2, ClipboardList, Loader2, User } from 'lucide-react';
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

type Tab = 'owner' | 'manager' | 'staff';

/**
 * 탭은 로그인 방식이 아니라 **누구인가**로 나눈다.
 *
 * 셋 다 아이디·비밀번호로 똑같이 들어온다. 그런데 계정을 어떻게 얻느냐가 다르다 —
 * 대표님은 상사를 열면서 계정이 생기고, 사무장님은 대표님이 만들어 주시고, 직원은
 * 스스로 신청해서 승인을 받는다. 처음 온 사람이 막히는 자리가 바로 거기다.
 *
 * 그래서 탭이 바꾸는 것은 입력칸이 아니라 **아래 단추**다. 고른 자리에 맞는 가입 길
 * 하나만 보여준다. 세 개를 한꺼번에 늘어놓으면 셋 다 안 읽는다.
 */
const TABS: { key: Tab; label: string; Icon: typeof Building2 }[] = [
  { key: 'owner', label: '상사 대표', Icon: Building2 },
  { key: 'manager', label: '사무장', Icon: ClipboardList },
  { key: 'staff', label: '직원', Icon: User },
];

/**
 * 로그인 화면.
 *
 * 밖에서 제일 먼저 열리는 자리다 — 상사 대표님이 제품을 보러 들어오는 문이기도 해서
 * 사내 화면보다 한 겹 더 다듬어 둔다.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>('owner');
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
            {/* 탭 — 누구로 들어오는가 */}
            <div className="flex overflow-hidden rounded-t-2xl border border-b-0 border-slate-200 bg-slate-50">
              {TABS.map(({ key, label, Icon }, i) => {
                const on = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    aria-pressed={on}
                    className={
                      'flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] transition ' +
                      (i > 0 ? 'border-l border-slate-200 ' : '') +
                      (on ? 'bg-white font-bold text-slate-900' : 'font-medium text-slate-400 hover:text-slate-600')
                    }
                  >
                    <Icon size={14} className={on ? 'text-violet-600' : 'text-slate-300'} />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-b-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
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
                  className={field + ' mt-2.5'}
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
                  <span className="shrink-0 text-[11px] text-slate-400">SNS 연동 후 사용 가능해요</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>

                <div className="mt-4">
                  <SocialRow />
                </div>
              </form>
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

            <SignupCta tab={tab} onOwner={() => setMode('ownerSignup')} onStaff={() => setMode('signup')} />
          </>
        )}

        <BizFooter />
      </main>
    </div>
  );
}

/**
 * 고른 자리에 맞는 가입 길 하나.
 *
 * 사무장님에게는 단추를 주지 않는다. 사무장 계정은 대표님이 만들어 주시는 것이지
 * 스스로 신청하는 게 아니라서, 누를 것을 두면 눌러 보고 막힌다.
 */
function SignupCta({ tab, onOwner, onStaff }: { tab: Tab; onOwner: () => void; onStaff: () => void }) {
  const OUTLINE =
    'mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50/60 ' +
    'text-[14px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50';

  if (tab === 'owner') {
    return (
      <>
        <button onClick={onOwner} className={OUTLINE}>
          대표자 회원가입
        </button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
          사용료는 없습니다. 확인 전화를 드린 뒤 상사를 열어 드립니다.
        </p>
      </>
    );
  }

  if (tab === 'manager') {
    return (
      <p className="mt-5 text-center text-[12px] leading-relaxed text-slate-400">
        사무장님 계정은 <b className="font-bold text-slate-600">대표님이 만들어 드립니다.</b>
        <br />
        아직 상사가 열려 있지 않다면 대표님께 먼저 말씀해 주세요.
      </p>
    );
  }

  return (
    <>
      <button onClick={onStaff} className={OUTLINE}>
        직원 회원가입
      </button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
        대표님이 상사를 연 뒤에 신청하실 수 있습니다. 대표님·사무장님이 승인하면 들어오십니다.
      </p>
    </>
  );
}

const SOCIALS = [
  { key: 'naver', label: '네이버', Mark: NaverMark, className: 'bg-[#03C75A] text-white' },
  { key: 'kakao', label: '카카오', Mark: KakaoMark, className: 'bg-[#FEE500] text-[#191600]' },
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
          title={label + ' 로그인 — 준비 중입니다'}
          aria-label={label + ' 로그인 (준비 중)'}
          className={'flex size-11 items-center justify-center rounded-full opacity-40 ' + className}
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
