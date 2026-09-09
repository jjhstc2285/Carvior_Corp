import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../store';
import { alertError } from '../lib/alert';
import type { Employee } from '../types';

/**
 * 지금 누가 자리에 있고 무엇을 하고 있는지.
 *
 * 예전에는 30분 동안 컴퓨터를 안 만지면 자동으로 자리비움을 올렸다. 그런데 마당에 나가
 * 차를 보는 게 일인 사람들이라 조작이 없는 게 자리를 비운 게 아니었고, 관리자에게는
 * 알림만 쌓였다. 자동으로 넘겨짚는 대신 본인이 한 줄 적게 한다.
 *
 * 근태 신청(연차·외근)과는 다르다. 그건 승인을 받는 기록이고 이건 지금 옆자리에 대고
 * 말하는 것에 가깝다 — 승인도 이력도 없이 지금 값만 들고 있는다.
 */

/** 자주 쓰는 것만 눌러서 고르게. 그 밖의 것은 직접 적는다. */
const PRESETS: { emoji: string; text: string }[] = [
  { emoji: '💺', text: '자리' },
  { emoji: '💬', text: '상담 중' },
  { emoji: '📞', text: '통화 중' },
  { emoji: '🚗', text: '외근 중' },
  { emoji: '🅿️', text: '차 보는 중' },
  { emoji: '🍜', text: '식사 중' },
  { emoji: '🏦', text: '은행' },
  { emoji: '🏥', text: '병원' },
  { emoji: '🚬', text: '잠깐 자리비움' },
  { emoji: '🙅', text: '방해 금지' },
];

/** 상태 옆에 붙일 이모지 — 골라 쓰라고 넉넉히 둔다. */
const EMOJIS = ['💺', '💬', '📞', '🚗', '🅿️', '🍜', '☕', '🏦', '🏥', '🚬', '🙅', '💻', '📄', '🔧', '🧽', '🎉'];

/** 오래된 상태는 흐리게 — 어제 적어둔 '외근 중'이 오늘까지 붙어 있으면 안 보느니만 못하다. */
function isStale(at: string | null | undefined): boolean {
  return !at || dayjs().diff(dayjs(at), 'hour') >= 4;
}

export default function StatusBar() {
  const { state, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState('💬');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * 지금 근무 중인 사람의 id.
   *
   * 남의 출퇴근 기록은 못 본다(내 출퇴근 시각은 남에게 보일 일이 아니다).
   * 누구인지만 따로 받아온다.
   */
  const [workingIds, setWorkingIds] = useState<string[]>([]);

  const loadWorking = useCallback(async () => {
    try {
      setWorkingIds(await api<string[]>('/attendance/working'));
    } catch {
      // 못 받아와도 내 상태를 적는 건 되어야 한다 — 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void loadWorking();
  }, [loadWorking]);

  const me = state.employees.find(e => e.id === state.currentEmployeeId) ?? null;

  // 상태를 적은 사람을 앞에 둔다 — 지금 무엇을 하는지가 이 칸의 목적이다.
  const working = state.employees
    .filter(e => e.active && workingIds.includes(e.id))
    .sort((a, b) => Number(Boolean(b.statusText)) - Number(Boolean(a.statusText)) || a.name.localeCompare(b.name));

  const save = async (next: { emoji: string | null; text: string | null }) => {
    setBusy(true);
    try {
      await api('/employees/me/status', { method: 'PATCH', body: next });
      await refresh();
      setOpen(false);
    } catch (e) {
      void alertError('상태를 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  const label = (e: Employee) =>
    [e.statusEmoji, e.statusText].filter(Boolean).join(' ') || '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-bold text-slate-800">지금 근무 중 {working.length}명</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            출근을 찍고 아직 퇴근을 안 찍은 사람입니다. 상태는 본인이 적습니다.
          </p>
        </div>
        {me && (
          <button
            onClick={() => {
              setEmoji(me.statusEmoji || '💬');
              setText(me.statusText ?? '');
              setOpen(v => !v);
            }}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            {me.statusText ? `${me.statusEmoji ?? ''} ${me.statusText}` : '내 상태 적기'}
          </button>
        )}
      </div>

      {open && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.text}
                disabled={busy}
                onClick={() => void save({ emoji: p.emoji, text: p.text })}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {p.emoji} {p.text}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {/* 직접 적을 때 붙일 이모지 */}
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`rounded-lg px-1.5 py-1 text-base transition-colors ${
                  emoji === e ? 'bg-indigo-100 ring-1 ring-indigo-300' : 'hover:bg-slate-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void save({ emoji, text });
              }}
              maxLength={40}
              placeholder="직접 적기 — 예: 고색동 차 보러 갑니다"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              disabled={busy}
              onClick={() => void save({ emoji, text })}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              올리기
            </button>
            {me?.statusText && (
              <button
                disabled={busy}
                onClick={() => void save({ emoji: null, text: null })}
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="상태 내리기"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {working.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">아직 출근한 사람이 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 px-5 py-4">
          {working.map(e => (
            <li
              key={e.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs ${
                e.id === state.currentEmployeeId
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span className="font-semibold text-slate-800">{e.name}</span>
              <span className="text-slate-400">{e.position}</span>
              {label(e) && (
                <span className={isStale(e.statusAt) ? 'text-slate-300' : 'text-slate-600'}>
                  · {label(e)}
                  {e.statusAt && (
                    <span className="ml-1 text-[10px] text-slate-300">{dayjs(e.statusAt).format('HH:mm')}</span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
