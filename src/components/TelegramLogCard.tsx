import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';

/**
 * 방에 내보낸 것.
 *
 * 지금까지는 보냈는지 안 보냈는지가 서버 로그에만 남았다. PM2 안에 있어서 사람이 못
 * 보고 며칠 지나면 밀려 사라진다 — "그 차 올라갔나?"를 텔레그램 방을 뒤져서 확인해야 했다.
 *
 * 못 보낸 것도 같이 뜬다. 안 간 걸 모르는 게 제일 나쁘다 — 방이 끊기면 쪽지는 안 가는데
 * 화면에서는 아무 일도 안 일어나서, 며칠 뒤에야 "요즘 안 오네" 하고 안다.
 *
 * 보는 자리는 관리자뿐이다. 입금방과 매입방에는 금액이 든다.
 */

const ROOMS = [
  { key: 'SALE', label: '입금방', hint: '차량판매가가 바뀌면 — 광고가·코드가' },
  { key: 'PURCHASE', label: '매입방', hint: '차를 사오면 — 실매입금액·구전' },
  { key: 'BROADCAST', label: '공지방', hint: '전 직원이 보는 자리 — 금액은 안 갑니다' },
] as const;

type RoomKey = (typeof ROOMS)[number]['key'];

interface LogRow {
  id: string;
  text: string;
  ok: boolean;
  reason: string;
  vehicleNumber: string;
  createdAt: string;
}

export default function TelegramLogCard() {
  const [room, setRoom] = useState<RoomKey>('SALE');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (key: RoomKey) => {
    setBusy(true);
    setError(null);
    try {
      setRows(await api<LogRow[]>(`/telegram/logs/${key}`));
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : '가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(room);
  }, [load, room]);

  const failed = rows.filter(r => !r.ok).length;
  const current = ROOMS.find(r => r.key === room);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">텔레그램 기록</h2>
        {/* 방마다 가려 본다 — 섞어 두면 어느 방에 뭐가 갔는지 셈이 안 된다 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {ROOMS.map(r => (
            <button
              key={r.key}
              onClick={() => setRoom(r.key)}
              className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                room === r.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(room)}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      <p className="mt-1 text-[11px] text-slate-400">
        {current?.hint} · 최근 100건
        {/* 못 간 게 있으면 먼저 말한다 — 안 간 걸 모르는 게 제일 나쁘다 */}
        {failed > 0 && <b className="ml-1 font-bold text-red-600">못 보낸 것 {failed}건</b>}
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {!busy && rows.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-slate-400">
            아직 이 방으로 나간 게 없습니다.
            {/* 방이 안 적혀 있으면 아무것도 안 나간다 — 그걸 먼저 의심해야 한다 */}
            <span className="mt-1 block text-[11px]">
              서버 <code>.env</code> 에 방 번호가 있는지 확인해 주세요.
            </span>
          </p>
        )}
        {rows.map(r => (
          <div
            key={r.id}
            className={`rounded-xl border px-3 py-2 ${
              r.ok ? 'border-slate-200 bg-slate-50/60' : 'border-red-200 bg-red-50/60'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {r.ok ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <Check size={11} /> 보냄
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600">
                  <AlertTriangle size={11} /> 못 보냄
                </span>
              )}
              <span className="text-[11px] tabular-nums text-slate-400">
                {dayjs(r.createdAt).format('MM.DD HH:mm')}
              </span>
              {r.vehicleNumber && (
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  {r.vehicleNumber}
                </span>
              )}
              <button
                onClick={() => void navigator.clipboard.writeText(r.text).then(() => setCopied(r.id))}
                className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                title="글을 그대로 복사합니다"
              >
                <Copy size={11} /> {copied === r.id ? '복사됨' : '복사'}
              </button>
            </div>
            {/* 보낸 글 그대로 — 방에 뜬 것과 같은 꼴로 보여야 견줄 수 있다 */}
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700">
              {r.text}
            </pre>
            {!r.ok && r.reason && <p className="mt-1 text-[11px] text-red-600">{r.reason}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
