import { useRef, useState, type KeyboardEvent } from 'react';
import type { Dayjs } from 'dayjs';
import { CheckSquare, Square, Trash2 } from 'lucide-react';
import type { WorkLog } from '../../types';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  day: Dayjs;
  logs: WorkLog[];
  /** 전체 직원 보기에서는 남의 일지를 섞어 보여주므로 입력칸을 감춘다. */
  canAdd: boolean;
  /** 전체 직원 보기일 때만 각 줄에 작성자 이름을 붙인다. */
  ownerName?: (employeeId: string) => string;
  onAdd: (content: string) => void;
  onToggle: (log: WorkLog) => void;
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
}

export default function WorkLogDayCard({ day, logs, canAdd, ownerName, onAdd, onToggle, onEdit, onRemove }: Props) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // Enter로 저장한 직후 blur가 한 번 더 들어와 같은 줄이 두 번 저장되는 걸 막는다.
  // state는 다음 렌더에야 바뀌므로 ref로 "이미 처리했다"를 즉시 남긴다.
  const draftRef = useRef('');
  const editingRef = useRef<string | null>(null);

  const isToday = day.isSame(new Date(), 'day');
  const weekday = day.day();
  const doneCount = logs.filter(l => l.done).length;

  const changeDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value);
  };

  const submitNew = () => {
    const content = draftRef.current.trim();
    if (!content) return;
    changeDraft('');
    onAdd(content);
  };

  const startEdit = (log: WorkLog) => {
    editingRef.current = log.id;
    setEditingId(log.id);
    setEditDraft(log.content);
  };

  const closeEdit = () => {
    editingRef.current = null;
    setEditingId(null);
  };

  const commitEdit = (log: WorkLog) => {
    if (editingRef.current !== log.id) return;
    closeEdit();
    const content = editDraft.trim();
    if (!content || content === log.content) return;
    onEdit(log.id, content);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, log: WorkLog) => {
    if (e.key === 'Enter') commitEdit(log);
    if (e.key === 'Escape') closeEdit(); // 되돌리기 — blur가 뒤따라도 commitEdit이 막힌다
  };

  return (
    <div
      className={`flex min-h-40 flex-col rounded-2xl border bg-white ${
        isToday ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'
      }`}
    >
      <div className="flex items-baseline justify-between border-b border-slate-100 px-3 py-2.5">
        <p className="flex items-baseline gap-1">
          <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-slate-800'}`}>{day.date()}일</span>
          <span
            className={`text-xs font-medium ${
              weekday === 0 ? 'text-red-400' : weekday === 6 ? 'text-blue-400' : 'text-slate-400'
            }`}
          >
            {WEEKDAY[weekday]}
          </span>
        </p>
        {logs.length > 0 && (
          <span className={`text-[11px] font-medium ${doneCount === logs.length ? 'text-emerald-500' : 'text-slate-400'}`}>
            {doneCount}/{logs.length}
          </span>
        )}
      </div>

      <ul className="flex-1 space-y-0.5 px-1.5 py-2">
        {logs.map(log => (
          <li key={log.id} className="group flex items-start gap-1.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
            <button
              onClick={() => onToggle(log)}
              className={`mt-px shrink-0 ${log.done ? 'text-indigo-500' : 'text-slate-300 hover:text-slate-400'}`}
              aria-label={log.done ? '완료 취소' : '완료 표시'}
            >
              {log.done ? <CheckSquare size={15} /> : <Square size={15} />}
            </button>

            {editingId === log.id ? (
              <input
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                onKeyDown={e => onEditKeyDown(e, log)}
                onBlur={() => commitEdit(log)}
                autoFocus
                className="min-w-0 flex-1 rounded border border-indigo-300 px-1 py-0.5 text-[13px] outline-none"
              />
            ) : (
              <button
                onClick={() => startEdit(log)}
                className={`min-w-0 flex-1 wrap-break-word text-left text-[13px] leading-snug ${
                  log.done ? 'text-slate-400 line-through' : 'text-slate-700'
                }`}
              >
                {log.content}
                {ownerName && (
                  <span className="ml-1 whitespace-nowrap text-[11px] text-slate-400">· {ownerName(log.employeeId)}</span>
                )}
              </button>
            )}

            <button
              onClick={() => onRemove(log.id)}
              className="shrink-0 text-slate-300 opacity-60 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="삭제"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}

        {logs.length === 0 && !canAdd && <li className="px-1.5 py-1 text-[12px] text-slate-300">기록 없음</li>}
      </ul>

      {canAdd && (
        <div className="px-2 pb-2">
          <input
            value={draft}
            onChange={e => changeDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNew(); }}
            onBlur={submitNew}
            placeholder="+ 할 일"
            className="w-full rounded-lg border border-transparent bg-slate-50 px-2 py-1.5 text-[13px] outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />
        </div>
      )}
    </div>
  );
}
