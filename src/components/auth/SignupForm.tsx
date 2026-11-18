import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertSuccess } from '../../lib/alert';
import { DEPARTMENTS } from '../../types';

interface Props {
  onBack: () => void;
}

const ID_PATTERN = /^[a-z0-9._-]{4,20}$/;

/**
 * 회원가입 신청.
 *
 * 상사에 들어오는 길이다. 상사는 이미 열려 있어야 한다 — 대표님이 상사를 열고 나서야
 * 직원이 신청할 수 있다. 반대 순서면 어느 상사 사람인지 알 수 없고 승인할 사람도 없다.
 *
 * 신청만 하고 계정은 대표님·사무장님이 승인할 때 생긴다. 승인 전에는 로그인되지 않는다 —
 * 아무나 가입해서 출퇴근·상담을 들여다보면 안 되기 때문이다.
 */
export default function SignupForm({ onBack }: Props) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id = loginId.trim().toLowerCase();
    if (!ID_PATTERN.test(id)) {
      setError('아이디는 영문 소문자·숫자·(._-) 조합 4~20자여야 합니다.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상으로 정해주세요.');
      return;
    }
    if (password !== passwordAgain) {
      setError('비밀번호가 서로 다릅니다.');
      return;
    }
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: {
          loginId: id,
          password,
          name: name.trim(),
          position: position.trim(),
          department,
          phone: phone.trim(),
        },
        // 401이어도 로그인 화면으로 튕기지 않게 — 여기가 이미 로그인 전이다.
        skipAuthRedirect: true,
      });
      await alertSuccess('가입 신청이 접수됐습니다', '관리자가 승인하면 이 아이디로 로그인할 수 있습니다.');
      onBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '신청하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );

  const INPUT =
    'h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-900 outline-none transition ' +
    'placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600">
        <ArrowLeft size={13} /> 로그인으로
      </button>

      <h2 className="text-base font-bold text-slate-800">직원 가입 신청</h2>
      <p className="mt-1 mb-4 text-xs text-slate-500">
        <b>이미 카비어 비즈를 쓰고 계신 상사</b>의 직원만 신청하실 수 있습니다.
        대표님·사무장님이 승인하면 이 아이디로 로그인됩니다.
      </p>

      {field(
        '아이디',
        <input
          value={loginId}
          onChange={e => { setLoginId(e.target.value); setError(null); }}
          placeholder="hong97"
          autoCapitalize="none"
          className={`${INPUT} font-mono`}
        />,
        '영문 소문자·숫자·(._-) 4~20자',
      )}

      {field('비밀번호', <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} className={INPUT} />, '8자 이상')}
      {field('비밀번호 확인', <input type="password" value={passwordAgain} onChange={e => { setPasswordAgain(e.target.value); setError(null); }} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} className={INPUT} />)}

      <div className="grid grid-cols-2 gap-3">
        {field('이름', <input value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="홍길동" className={INPUT} />)}
        {field('직급', <input value={position} onChange={e => setPosition(e.target.value)} placeholder="사원" className={INPUT} />)}
        {/* 작업일지를 팀끼리 나눠 보므로 어느 팀인지 처음부터 받아둔다 */}
        {field(
          '소속 팀',
          <select value={department} onChange={e => setDepartment(e.target.value)} className={INPUT}>
            <option value="">나중에 정함</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>,
        )}
      </div>
      {field('휴대폰 번호', <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" className={INPUT} />, '선택 — 적어두면 관리자가 본인 확인에 씁니다')}

      {error && <p className="mb-2 text-xs font-medium text-red-500">{error}</p>}

      <button
        onClick={() => void submit()}
        disabled={busy}
        className="h-12 w-full rounded-xl bg-violet-600 text-[15px] font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-100 disabled:text-violet-400"
      >
        {busy ? '신청 중…' : '가입 신청'}
      </button>
    </div>
  );
}
