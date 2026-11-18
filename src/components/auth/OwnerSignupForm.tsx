import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertSuccess } from '../../lib/alert';

interface Props {
  onBack: () => void;
}

const PHONE_PATTERN = /^[0-9-]{9,20}$/;

/**
 * 상사 개설 신청.
 *
 * 직원 가입과 다른 일이다. 직원은 이미 열려 있는 상사에 들어오지만, 여기는 상사 자체가
 * 아직 없다 — 대표님이 "우리 상사도 열어 달라"고 남기는 자리다.
 *
 * 아이디·비밀번호를 받지 않는다. 여기서 계정이 생기지 않기 때문이다. 받아 둘 곳도 없는
 * 비밀번호를 입력시키면, 로그인되는 줄 알고 기다리시게 된다.
 *
 * 누르면 상사가 열리는 것처럼 보이지 않게 말을 고른다 — 지금은 사람이 확인하고 손으로
 * 연다. 상사마다 데이터가 섞이지 않게 하는 작업이 끝나기 전까지는 그래야 한다.
 */
export default function OwnerSignupForm({ onBack }: Props) {
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [bizNumber, setBizNumber] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!shopName.trim()) {
      setError('상사 이름을 입력해 주세요.');
      return;
    }
    if (!ownerName.trim()) {
      setError('대표자 성함을 입력해 주세요.');
      return;
    }
    if (!PHONE_PATTERN.test(phone.trim())) {
      setError('연락처를 숫자와 - 로 입력해 주세요.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api('/auth/owner-signup', {
        method: 'POST',
        body: {
          shopName: shopName.trim(),
          ownerName: ownerName.trim(),
          phone: phone.trim(),
          bizNumber: bizNumber.trim(),
          email: email.trim(),
          region: region.trim(),
          headcount,
          memo: memo.trim(),
        },
        // 401이어도 로그인 화면으로 튕기지 않게 — 여기가 이미 로그인 전이다.
        skipAuthRedirect: true,
      });
      await alertSuccess(
        '신청이 접수됐습니다',
        '카비어에서 전화로 확인드린 뒤 상사를 열어 드립니다. 상사가 열리면 대표님 계정을 먼저 만들어 드리고, 그다음부터 직원이 가입 신청을 할 수 있습니다.',
      );
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

      <h2 className="text-base font-bold text-slate-800">상사 개설 신청</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-slate-500">
        <b>대표님·사무장님</b>이 신청하시는 자리입니다. 사용료는 없습니다.
        <br />
        확인 전화를 드린 뒤 상사를 열어 드립니다 — 지금은 한 곳씩 직접 열고 있어서
        신청하신 그 자리에서 바로 만들어지지는 않습니다.
      </p>

      {field('상사 이름', <input value={shopName} onChange={e => { setShopName(e.target.value); setError(null); }} placeholder="○○모터스" className={INPUT} />)}

      <div className="grid grid-cols-2 gap-3">
        {field('대표자 성함', <input value={ownerName} onChange={e => { setOwnerName(e.target.value); setError(null); }} placeholder="홍길동" className={INPUT} />)}
        {field(
          '연락처',
          <input
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            placeholder="010-0000-0000"
            inputMode="tel"
            className={INPUT}
          />,
        )}
      </div>

      {field('사업자등록번호', <input value={bizNumber} onChange={e => setBizNumber(e.target.value)} placeholder="000-00-00000" inputMode="numeric" className={INPUT} />, '선택 — 미리 주시면 개설이 빨라집니다')}

      <div className="grid grid-cols-2 gap-3">
        {field('단지·지역', <input value={region} onChange={e => setRegion(e.target.value)} placeholder="수원 권선구" className={INPUT} />)}
        {field(
          '직원 수',
          <select value={headcount} onChange={e => setHeadcount(e.target.value)} className={INPUT}>
            <option value="">선택 안 함</option>
            <option value="1-5">1~5명</option>
            <option value="6-15">6~15명</option>
            <option value="16-30">16~30명</option>
            <option value="31+">31명 이상</option>
          </select>,
        )}
      </div>

      {field('이메일', <input value={email} onChange={e => setEmail(e.target.value)} placeholder="선택" inputMode="email" className={INPUT} />)}

      {field(
        '하고 싶은 말',
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          rows={3}
          placeholder="지금 쓰시는 프로그램, 급한 것부터 알려주시면 그것부터 맞춰 드립니다."
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
        />,
      )}

      {error && <p className="mb-2 text-xs font-medium text-red-500">{error}</p>}

      <button
        onClick={() => void submit()}
        disabled={busy}
        className="h-12 w-full rounded-xl bg-violet-600 text-[15px] font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-100 disabled:text-violet-400"
      >
        {busy ? '신청 중…' : '상사 개설 신청'}
      </button>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
        급하시면 바로 전화 주셔도 됩니다 —{' '}
        <a href="tel:01022856017" className="font-semibold text-slate-500 underline-offset-2 hover:text-violet-600 hover:underline">
          010-2285-6017
        </a>
      </p>
    </div>
  );
}
