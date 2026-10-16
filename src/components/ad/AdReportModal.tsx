import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { NotebookPen, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { AD_SPEND_CHANNELS, type AdReport } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 광고 운영 현황 메모.
 *
 * 대행사에서 주차마다 보고가 온다 — 예산·클릭수·CPC·제외 키워드까지 여러 줄짜리다.
 * 광고비 표의 메모 칸(한 줄)에는 안 들어가서 카톡에만 남고 흘러갔다.
 *
 * 화면에 늘어놓지 않고 모달로 연다 — 평소엔 금액만 보고, 필요할 때 들여다보는 글이다.
 * 붙여 넣은 그대로 줄바꿈을 살려 보여준다.
 */
const PLACEHOLDER = [
  '[애즈 9월 2주차 운영 현황]',
  '-일 예산 20,000원 기준으로 지속 운영',
  '-클릭수 35회 → 394회로 증가',
  '-평균 CPC 약 353원',
  '…',
  '',
  '받은 내용을 그대로 붙여 넣으세요. 줄바꿈이 그대로 남습니다.',
].join('\n');

export default function AdReportModal({
  month,
  channel,
  onClose,
  onChanged,
}: {
  month: string;
  /** 광고비 줄에서 열면 그 채널만. 빈 값이면 그 달 전체 */
  channel: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [rows, setRows] = useState<AdReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formChannel, setFormChannel] = useState(channel || AD_SPEND_CHANNELS[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AdReport[]>(`/ad-reports?month=${month}&channel=${encodeURIComponent(channel)}`));
    } catch (e) {
      void alertError('운영 메모를 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [month, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  // 긴 글을 쓰다가 Esc 한 번에 날리면 안 된다 — 쓰는 중엔 안 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !writing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, writing]);

  const startWrite = () => {
    setFormChannel(channel || AD_SPEND_CHANNELS[0]);
    // 대개 주차별로 온다 — 제목 틀을 미리 넣어 준다
    setTitle(`${dayjs(`${month}-01`).format('M월')} ${Math.ceil(dayjs().date() / 7)}주차`);
    setBody('');
    setEditId(null);
    setWriting(true);
  };

  const startEdit = (r: AdReport) => {
    setFormChannel(r.channel);
    setTitle(r.title);
    setBody(r.body);
    setEditId(r.id);
    setWriting(true);
  };

  const save = async () => {
    if (!body.trim()) {
      void alertError('내용을 적어 주세요', '');
      return;
    }
    setSaving(true);
    try {
      if (editId) await api(`/ad-reports/${editId}`, { method: 'PATCH', body: { channel: formChannel, title, body } });
      else await api('/ad-reports', { method: 'POST', body: { month, channel: formChannel, title, body } });
      setWriting(false);
      setEditId(null);
      await load();
      onChanged?.();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: AdReport) => {
    const ok = await confirmDanger(`${r.title || r.channel} 메모를 지울까요?`, '되돌릴 수 없습니다.');
    if (!ok) return;
    try {
      await api(`/ad-reports/${r.id}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <NotebookPen size={16} className="text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">
            운영 현황 메모
            <span className="ml-2 font-medium text-slate-400">
              {dayjs(`${month}-01`).format('YYYY년 M월')}
              {channel && ` · ${channel}`}
            </span>
          </h3>
          <div className="ml-auto flex items-center gap-2">
            {!writing && (
              <button
                onClick={startWrite}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus size={13} /> 메모 쓰기
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {writing && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <input
                  value={formChannel}
                  onChange={e => setFormChannel(e.target.value)}
                  list="ad-report-channels"
                  placeholder="구글 애즈"
                  className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="9월 2주차"
                  className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              {/* 카톡으로 온 보고를 통째로 붙여 넣는 자리 — 넉넉하게 둔다 */}
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={14}
                placeholder={PLACEHOLDER}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{body.length.toLocaleString()}자</span>
                <button
                  onClick={() => {
                    setWriting(false);
                    setEditId(null);
                  }}
                  className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          )}

          {loading && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}
          {!loading && rows.length === 0 && !writing && (
            <p className="py-12 text-center text-sm text-slate-400">
              이 달에 적은 운영 메모가 없습니다. [메모 쓰기]로 대행사 보고를 그대로 붙여 넣으세요.
            </p>
          )}

          {rows.map(r => (
            <article key={r.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {r.channel}
                </span>
                {r.title && <b className="text-sm text-slate-800">{r.title}</b>}
                <span className="text-[11px] text-slate-400">
                  {dayjs(r.createdAt).format('M/D')}
                  {r.author && ` · ${r.author}`}
                </span>
                <button
                  onClick={() => startEdit(r)}
                  className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                >
                  고치기
                </button>
                <button
                  onClick={() => void remove(r)}
                  className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="삭제"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {/* 붙여 넣은 그대로 — 줄바꿈을 살린다 */}
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{r.body}</p>
            </article>
          ))}
        </div>

        <datalist id="ad-report-channels">
          {AD_SPEND_CHANNELS.map(c => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
