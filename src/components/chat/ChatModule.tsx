import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import dayjs from 'dayjs';
import { MessageSquare, Send } from 'lucide-react';
import { useStore } from '../../store';
import type { Role } from '../../types';
import { useChat } from './useChat';

interface Props {
  role: Role;
}

export default function ChatModule({ role }: Props) {
  const { state } = useStore();
  const chat = useChat(state.currentEmployeeId);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = role === 'ADMIN';

  /**
   * 왼쪽 목록은 '대화가 있는 사람'이 아니라 '보낼 수 있는 사람 전체'다 —
   * 아직 한 번도 주고받지 않은 상대도 보여야 말을 걸 수 있다.
   *
   * 관리자에게는 직원 전원이, 직원에게는 관리자 전원이 뜬다.
   */
  const rows = useMemo(() => {
    const convOf = new Map(chat.conversations.map(c => [c.partner.id, c]));

    return state.employees
      .filter(e => e.active && e.id !== state.currentEmployeeId)
      .filter(e => (isAdmin ? e.role !== 'ADMIN' : e.role === 'ADMIN'))
      .map(e => {
        const conv = convOf.get(e.id);
        return {
          id: conv?.id ?? `new:${e.id}`,
          partner: { id: e.id, name: e.name, position: e.position },
          lastMessage: conv?.lastMessage ?? null,
          lastMessageAt: conv?.lastMessageAt ?? null,
          unread: conv?.unread ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.unread !== b.unread) return b.unread - a.unread;
        return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
      });
  }, [chat.conversations, state.employees, state.currentEmployeeId, isAdmin]);

  // 상대가 한 명뿐이면 고를 것이 없으니 바로 열어준다(관리자가 한 명인 회사).
  // chat 객체는 매 렌더 새로 만들어지므로 의존성에는 필요한 것만 넣는다(넣으면 무한 루프).
  const { open: openChat, openWith } = chat;
  const onlyPartnerId = rows.length === 1 ? rows[0].partner.id : null;
  useEffect(() => {
    if (onlyPartnerId && !openWith) openChat(onlyPartnerId);
  }, [onlyPartnerId, openWith, openChat]);

  // 새 메시지가 붙으면 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  const submit = () => {
    const body = draft.trim();
    if (!body || chat.sending) return;
    setDraft('');
    void chat.send(body);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter로 보내고, 줄바꿈은 Shift+Enter (메신저 관습)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // 이름만으로는 누군지 헷갈리는 경우가 있어 직급을 같이 보여준다.
  const opened = chat.openWith ? state.employees.find(e => e.id === chat.openWith) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">메시지</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdmin
            ? '직원을 고르면 바로 메시지를 보낼 수 있어요. 브라우저를 열어둔 직원에게는 즉시 표시됩니다.'
            : '관리자를 고르면 그 사람에게만 갑니다. 브라우저를 열어두면 답장이 바로 표시됩니다.'}
        </p>
      </div>

      {chat.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{chat.error}</p>}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="max-h-128 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              {isAdmin ? '직원이 없습니다.' : '관리자가 없습니다.'}
            </p>
          ) : (
              <ul className="divide-y divide-slate-50">
                {rows.map(r => (
                  <li key={r.id}>
                    <button
                      onClick={() => chat.open(r.partner.id)}
                      className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${
                        chat.openWith === r.partner.id ? 'bg-indigo-50/60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          {r.partner.name}
                          <span className="text-[11px] font-normal text-slate-400">{r.partner.position}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {r.lastMessage?.body ?? '대화 없음'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {r.lastMessageAt && (
                          <p className="text-[10px] text-slate-400">{dayjs(r.lastMessageAt).format('M/D')}</p>
                        )}
                        {r.unread > 0 && (
                          <span className="mt-1 inline-flex min-w-4 justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {r.unread}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </aside>

        <section className="flex h-128 flex-col rounded-2xl border border-slate-200 bg-white">
          {!chat.openWith ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageSquare size={26} className="text-slate-300" />
              <p className="mt-2 text-sm text-slate-400">
                왼쪽에서 {isAdmin ? '직원' : '관리자'}을 선택해 대화를 시작하세요.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5 border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">{opened?.name ?? '대화'}</p>
                {opened?.position && <span className="text-xs text-slate-400">{opened.position}</span>}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {chat.loading && <p className="text-center text-xs text-slate-400">불러오는 중…</p>}
                {!chat.loading && chat.messages.length === 0 && (
                  <p className="py-10 text-center text-xs text-slate-400">아직 주고받은 메시지가 없습니다.</p>
                )}

                {chat.messages.map(m => {
                  const mine = m.senderId === state.currentEmployeeId;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!mine && (
                          <p className="mb-0.5 text-[11px] text-slate-400">
                            {m.sender.name}
                            {m.sender.position && <span className="ml-1">{m.sender.position}</span>}
                          </p>
                        )}
                        <div
                          className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                            mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {m.body}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                          {dayjs(m.createdAt).format('M/D HH:mm')}
                          {mine && (m.readAt ? <span className="text-indigo-400">읽음</span> : <span>안읽음</span>)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="flex items-end gap-2 border-t border-slate-100 px-3 py-3">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  placeholder="메시지를 입력하세요 (Enter 전송 / Shift+Enter 줄바꿈)"
                  className="min-h-10 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
                <button
                  onClick={submit}
                  disabled={chat.sending || !draft.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  <Send size={14} /> 전송
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
