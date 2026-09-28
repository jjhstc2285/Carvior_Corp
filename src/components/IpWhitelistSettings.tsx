import { useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { useCurrentIp } from '../lib/useCurrentIp';
import { ipAllowed, ipMatches, suggestRange } from '../lib/ipMatch';

/** 한 개(123.45.67.89) · 대역(123.45.67.* · 123.45.*) · CIDR(123.45.67.0/24) */
const IP_PATTERN = /^(?:(?:\d{1,3}|\*)\.){1,3}(?:\d{1,3}|\*)(?:\/\d{1,2})?$/;

export default function IpWhitelistSettings() {
  const { state, addWhitelistIp, removeWhitelistIp } = useStore();
  const { ip: myIp, loading: ipLoading } = useCurrentIp();
  const [input, setInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!IP_PATTERN.test(trimmed)) {
      setFormError('IP 또는 대역 형식이 아니에요 (예: 123.45.67.89 · 123.45.67.*)');
      return;
    }
    addWhitelistIp(trimmed);
    setInput('');
    setFormError(null);
  };

  const enabled = state.ipWhitelist.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">출근 등록 IP 화이트리스트</h2>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-500 ring-slate-500/20'}`}>
          {enabled ? '제한 적용 중' : '제한 없음 (전체 허용)'}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs leading-relaxed text-slate-400">
          목록이 비어있으면 모든 IP에서 출근 등록이 가능합니다. IP를 하나라도 추가하면 목록에 없는 IP에서는 출근이 거부돼요.
          판단은 서버가 요청의 실제 소스 IP로 합니다(Apache 뒤라 X-Forwarded-For를 봅니다).
          <br />
          ⚠️ IP는 <strong className="font-semibold text-slate-500">사무실 네트워크까지만</strong> 가릅니다 — 같은 WiFi를 쓰는 휴대폰도
          공인 IP가 같아서 구분되지 않아요. 자리 PC에서만 찍히게 하려면 아래 &lsquo;출근 단말&rsquo;을 함께 등록하세요.
          <br />
          💡 공유기가 받는 공인 IP는 <strong className="font-semibold text-slate-500">수시로 바뀝니다</strong>. IP를 하나만 적어 두면
          공유기를 껐다 켠 다음 날 아침에 전 직원이 출근을 못 찍어요. <span className="font-mono">123.45.67.*</span> 처럼
          <strong className="font-semibold text-slate-500"> 대역으로 열어 두세요</strong> (<span className="font-mono">123.45.67.0/24</span> 도 같은 뜻).
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">현재 접속 IP:</span>
          <span className="font-mono font-semibold text-slate-700">{ipLoading ? '확인 중...' : myIp ?? '확인 불가'}</span>
          {myIp && !ipAllowed(state.ipWhitelist, myIp) && (
            <span className="ml-auto flex items-center gap-1.5">
              {/* 대역을 먼저 권한다 — 한 개만 넣으면 다음에 또 막힌다 */}
              {suggestRange(myIp) && (
                <button
                  onClick={() => addWhitelistIp(suggestRange(myIp)!)}
                  title="끝자리가 바뀌어도 막히지 않습니다"
                  className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Plus size={12} /> 대역 열기 ({suggestRange(myIp)})
                </button>
              )}
              <button
                onClick={() => addWhitelistIp(myIp)}
                className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
              >
                <Plus size={12} /> 이 IP만
              </button>
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setFormError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="예: 123.45.67.89 또는 123.45.67.*"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
        {formError && <p className="mt-1.5 text-xs text-red-500">{formError}</p>}

        {state.ipWhitelist.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-50 rounded-lg border border-slate-100">
            {state.ipWhitelist.map(ip => (
              <li key={ip} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-slate-700">{ip}</span>
                  {ip.includes('*') || ip.includes('/') ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">대역</span>
                  ) : null}
                  {/* 어느 줄 덕분에 지금 들어와 있는지 보이면 지울 때 실수하지 않는다 */}
                  {myIp && ipMatches(ip, myIp) && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      현재 접속
                    </span>
                  )}
                </span>
                <button
                  onClick={() => removeWhitelistIp(ip)}
                  className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
