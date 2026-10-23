import { useState } from 'react';
import { Hash, Send } from 'lucide-react';
import { api, ApiError } from '../lib/api';

interface Room {
  id: string;
  title: string;
  type: string;
}

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
  /*
    방 번호 찾기.

    .env 에 적는 방 번호(-1001234567890 같은 음수)가 어디에도 안 적혀 있다. 초대 링크
    (t.me/+...)는 사람을 부르는 열쇠일 뿐 보낼 때 쓰는 값이 아니다.

    지금까지는 주소창에 봇 토큰을 넣고 getUpdates 를 쳐서 눈으로 찾아야 했다 —
    토큰이 브라우저 기록에 남는다. 여기서 누르면 서버가 찾아 번호만 돌려준다.
  */
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomNote, setRoomNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const findRooms = async () => {
    setRoomBusy(true);
    setRoomNote(null);
    try {
      const res = await api<{ rooms: Room[]; reason?: string }>('/telegram/chats');
      setRooms(res.rooms);
      setRoomNote(res.reason ?? null);
    } catch (e) {
      setRooms([]);
      setRoomNote(e instanceof ApiError ? e.message : '방을 찾지 못했습니다.');
    } finally {
      setRoomBusy(false);
    }
  };

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

      {/*
        방 번호 찾기 — .env 에 적을 값을 여기서 집는다.

        봇이 본 방만 나온다. 텔레그램은 봇을 부르기 전 이야기를 안 준다 — 방에 봇을
        넣고 아무 말이나 한 줄 쳐야 그때부터 보인다.
      */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-bold text-slate-600">방 번호 찾기</h3>
          <button
            onClick={() => void findRooms()}
            disabled={roomBusy}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Hash size={12} /> {roomBusy ? '찾는 중…' : '봇이 들어간 방 보기'}
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          방에 <b>@anyonecar_bot</b> 을 넣고 아무 말이나 한 줄 친 다음 누르세요. 나온 번호를 서버 <code>.env</code> 에
          적습니다 — 공지방은 <code>TELEGRAM_CHAT_ID</code>, 금액이 오가는 입금확인방은{' '}
          <code>TELEGRAM_SALE_CHAT_ID</code>. 초대 링크(t.me/+…)는 방 번호가 아닙니다.
        </p>
        {rooms && rooms.length > 0 && (
          <ul className="mt-2 space-y-1">
            {rooms.map(r => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{r.title}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{r.type}</span>
                <code className="shrink-0 font-mono text-slate-800">{r.id}</code>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(r.id).then(() => setCopied(r.id));
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                >
                  {copied === r.id ? '복사됨' : '복사'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {roomNote && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{roomNote}</p>}
      </div>
    </section>
  );
}
