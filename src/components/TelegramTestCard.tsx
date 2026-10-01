import { useState } from 'react';
import { Send } from 'lucide-react';
import { api, ApiError } from '../lib/api';

/**
 * 공지방 연결 확인.
 *
 * 공지는 실패해도 화면에서는 아무 일도 안 일어난다 — 차를 고치거나 파는 중에 텔레그램이
 * 느리다고 그 일이 멈추면 안 되기 때문에 실패를 로그에만 남긴다. 그래서 방이 끊겨도
 * 며칠 뒤에야 "요즘 공지가 안 오네" 하고 안다.
 *
 * 눌러서 한 줄 보내 본다. 방에 뜨면 연결된 것이고, 안 뜨면 여기 적힌 이유를 보고 고친다.
 */
export default function TelegramTestCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ sent: boolean; reason?: string }>('/telegram/test', { method: 'POST' });
      setResult(
        res.sent
          ? { ok: true, text: '보냈습니다. 공지방에 떴는지 확인해 주세요.' }
          : { ok: false, text: res.reason ?? '보내지 못했습니다.' },
      );
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiError ? e.message : '보내지 못했습니다.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">공지방 연결</h2>
        <button
          onClick={() => void send()}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <Send size={14} /> {busy ? '보내는 중…' : '확인 메시지 보내기'}
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        상담·키 불출·매입 등록 같은 일이 생기면 공지방으로 한 줄씩 나갑니다. 보내기가 실패해도 화면은 멀쩡하고 서버
        기록에만 남아서, 방이 끊기면 한참 뒤에야 알게 됩니다. 눌러서 한 줄 보내 보세요.
      </p>
      {result && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {result.text}
        </p>
      )}
    </section>
  );
}
