import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { api, ApiError, getPropertyPass, setPropertyPass } from '../lib/api';

/**
 * 돈 장부 잠금 — 비밀번호를 넣어야 안이 보인다.
 *
 * 로그인만으로는 안 연다. 보증금·월세·상조회비처럼 자리를 비운 사이 열린 화면이 그대로
 * 남으면 안 되는 값이라, 탭에 들어올 때 한 번 더 받는다.
 *
 * 부동산과 같은 통행증을 쓴다 — 같은 성격의 장부를 두 번 칠 이유가 없다. 한쪽을 열면
 * 다른 쪽도 열리고, 한 시간이 지나면 둘 다 다시 잠긴다.
 *
 * 비밀번호는 서버(.env)에만 둔다. 화면에 박으면 소스를 받은 사람이 다 본다.
 */
export default function LedgerLock({ title, children }: { title: string; children: ReactNode }) {
  const [locked, setLocked] = useState(() => !getPropertyPass());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    통행증이 시간 지나 막히면 다시 잠근다.

    서버가 '다시 넣어 주세요'로 돌려보내면 api 가 알려준다 — 그걸 못 받으면 화면은 열려
    있는데 아무것도 안 불러와지는 상태로 남는다.
  */
  useEffect(() => {
    const relock = () => setLocked(true);
    window.addEventListener('ledger-locked', relock);
    return () => window.removeEventListener('ledger-locked', relock);
  }, []);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const { pass } = await api<{ pass: string }>('/properties/unlock', { method: 'POST', body: { code } });
      setPropertyPass(pass);
      setCode('');
      setLocked(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '열지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!locked) return <>{children}</>;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Lock size={22} className="mx-auto text-slate-400" />
        <h1 className="mt-2 text-base font-bold text-slate-800">{title}</h1>
        <p className="mt-1 text-xs text-slate-500">
          대외비 화면입니다. 로그인과 별개로 <b>비밀번호</b>를 한 번 더 넣어야 열립니다.
        </p>
        <input
          id="ledger-lock-code"
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void unlock()}
          placeholder="비밀번호"
          autoFocus
          className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-indigo-400"
        />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <button
          onClick={() => void unlock()}
          disabled={busy || !code.trim()}
          className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? '확인 중…' : '열기'}
        </button>
        <p className="mt-3 text-[11px] text-slate-400">
          한 시간이 지나면 다시 잠깁니다. 자리를 비울 때 화면이 열린 채로 남지 않게 하려는 것입니다.
        </p>
      </div>
    </div>
  );
}
