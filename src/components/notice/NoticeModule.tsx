import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Megaphone, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import type { Role } from '../../types';

/**
 * 사내 게시판 — 전 직원이 보는 공지.
 *
 * 지금은 텔레그램 공지방으로만 돌린다. 방에 들어온 뒤의 글만 보이고, 지난 공지를 찾으려면
 * 올려 가며 뒤져야 한다. 들어오면 보이는 자리에 남겨 둔다.
 *
 * 읽는 건 전 직원, 쓰는 건 관리자다. 아무나 쓰게 두면 공지가 아니라 게시물이 된다.
 *
 * 금액은 여기에도 안 적는다 — 전 직원이 보는 자리라는 점은 공지방과 같다.
 */

export interface Notice {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  author?: { id: string; name: string; position: string } | null;
}

export const NOTICE_TONE: Record<string, string> = {
  공지: 'bg-rose-100 text-rose-700',
  업무: 'bg-emerald-100 text-emerald-700',
  일반: 'bg-slate-100 text-slate-600',
};

const CATEGORIES = ['공지', '업무', '일반'] as const;

export default function NoticeModule({ role }: { role: Role }) {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | 'all'>('all');
  const [open, setOpen] = useState<Notice | null>(null);
  const [writing, setWriting] = useState<Notice | 'new' | null>(null);

  const canWrite = role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setRows(await api<Notice[]>('/notices'));
    } catch (e) {
      void alertError('공지를 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (picked === 'all' ? rows : rows.filter(r => r.category === picked)),
    [rows, picked],
  );

  const remove = async (row: Notice) => {
    const ok = await confirmDanger(`"${row.title}" 공지를 지울까요?`, '되돌릴 수 없습니다.');
    if (!ok) return;
    try {
      await api(`/notices/${row.id}`, { method: 'DELETE' });
      setOpen(null);
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">사내 게시판</h2>
        <p className="mt-1 text-sm text-slate-500">
          전 직원이 봅니다. 금액은 적지 마세요 — 공지방과 같은 자리입니다.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canWrite && (
          <button
            onClick={() => setWriting('new')}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> 공지 올리기
          </button>
        )}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {(['all', ...CATEGORIES] as const).map(c => (
            <button
              key={c}
              onClick={() => setPicked(c)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                picked === c ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {c === 'all' ? '전체' : c}{' '}
              <span className="font-bold">
                {c === 'all' ? rows.length : rows.filter(r => r.category === c).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {loading && <p className="px-5 py-10 text-center text-sm text-slate-400">불러오는 중…</p>}
        {!loading && shown.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-slate-400">아직 올라온 공지가 없습니다.</p>
        )}
        <ul className="divide-y divide-slate-50">
          {shown.map(n => (
            <li key={n.id}>
              <button
                onClick={() => setOpen(n)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50"
              >
                {/* 고정한 글은 위에 오고 핀을 꽂는다 — 왜 위에 있는지가 보여야 한다 */}
                {n.pinned && <Pin size={13} className="shrink-0 text-rose-500" />}
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${NOTICE_TONE[n.category] ?? ''}`}>
                  {n.category}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{n.title}</span>
                <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                  {n.author?.name}
                  {n.author?.position ? ` ${n.author.position}` : ''}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{dayjs(n.createdAt).format('YYYY.MM.DD')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <NoticeView
          notice={open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setWriting(open);
            setOpen(null);
          }}
          onRemove={() => void remove(open)}
        />
      )}

      {writing && (
        <NoticeForm
          editing={writing === 'new' ? null : writing}
          onClose={() => setWriting(null)}
          onSaved={async () => {
            setWriting(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function NoticeView({
  notice,
  canWrite,
  onClose,
  onEdit,
  onRemove,
}: {
  notice: Notice;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${NOTICE_TONE[notice.category] ?? ''}`}>
            {notice.category}
          </span>
          <h3 className="min-w-0 flex-1 text-lg font-bold text-slate-900">{notice.title}</h3>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {notice.author?.name}
          {notice.author?.position ? ` ${notice.author.position}` : ''} · {dayjs(notice.createdAt).format('YYYY.MM.DD HH:mm')}
        </p>
        {/* 줄바꿈을 그대로 살린다 — 공지는 줄을 나눠 적는 글이다 */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{notice.body || '내용이 없습니다.'}</p>

        {canWrite && (
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={onRemove}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} /> 지우기
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Pencil size={14} /> 고치기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NoticeForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Notice | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [category, setCategory] = useState(editing?.category ?? '일반');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  /* 보내고 나서 닫는다 — 안 기다리고 닫으면 실패해도 올라간 것처럼 보인다 */
  const save = async () => {
    if (!title.trim()) {
      void alertError('제목을 적어 주세요');
      return;
    }
    setSaving(true);
    try {
      const body2 = { category, title: title.trim(), body, pinned };
      if (editing) await api(`/notices/${editing.id}`, { method: 'PATCH', body: body2 });
      else await api('/notices', { method: 'POST', body: body2 });
      await onSaved();
    } catch (e) {
      void alertError('올리지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <Megaphone size={16} className="text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">{editing ? '공지 고치기' : '공지 올리기'}</h3>
          <button onClick={onClose} className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-md px-2.5 py-1.5 transition-colors ${
                    category === c ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {/* 고정은 아껴 쓴다 — 다 고정하면 고정이 아니다 */}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" />
              맨 위에 고정
            </label>
          </div>

          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            maxLength={120}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            placeholder="내용을 적어 주세요. 전 직원이 봅니다 — 금액은 적지 마세요."
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? '올리는 중…' : editing ? '고치기' : '올리기'}
          </button>
        </div>
      </div>
    </div>
  );
}
