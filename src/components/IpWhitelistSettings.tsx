import { useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { useCurrentIp } from '../lib/useCurrentIp';

const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

export default function IpWhitelistSettings() {
  const { state, addWhitelistIp, removeWhitelistIp } = useStore();
  const { ip: myIp, loading: ipLoading } = useCurrentIp();
  const [input, setInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!IP_PATTERN.test(trimmed)) {
      setFormError('올바른 IPv4 형식이 아니에요 (예: 123.45.67.89)');
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
          목록이 비어있으면 모든 IP에서 출근 등록이 가능합니다. IP를 하나라도 추가하면, 목록에 없는 IP에서는 출근 버튼이 비활성화돼요.
          <br />
          ⚠️ 참고용 데모 구현입니다 — 클라이언트가 자체 보고하는 공인 IP로 판단하는 방식이라(브라우저에서 확인) 실제 보안 경계로 쓰려면 서버에서 요청의 실제 소스 IP를 검사하는 백엔드 연동이 필요해요.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">현재 접속 IP:</span>
          <span className="font-mono font-semibold text-slate-700">{ipLoading ? '확인 중...' : myIp ?? '확인 불가'}</span>
          {myIp && !state.ipWhitelist.includes(myIp) && (
            <button
              onClick={() => addWhitelistIp(myIp)}
              className="ml-auto flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={12} /> 화이트리스트에 추가
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setFormError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="예: 123.45.67.89"
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
                <span className="font-mono text-slate-700">{ip}</span>
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
