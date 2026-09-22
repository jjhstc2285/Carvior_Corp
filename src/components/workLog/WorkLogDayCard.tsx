import { useRef, useState, type KeyboardEvent } from 'react';
import type { Dayjs } from 'dayjs';
import { CheckSquare, ChevronsLeftRight, Square, Trash2 } from 'lucide-react';
import type { WorkLog } from '../../types';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  day: Dayjs;
  logs: WorkLog[];
  /** 전체 직원 보기에서는 남의 일지를 섞어 보여주므로 입력칸을 감춘다. */
  canAdd: boolean;
  /** 전체 직원 보기일 때만 각 줄에 작성자 이름을 붙인다. */
  ownerName?: (employeeId: string) => string;
  /**
   * 남의 일지를 볼 때. 체크·수정·삭제를 못 하게 한다.
   * 서버도 막지만, 버튼이 보이면 눌러보고 거절당한다.
   */
  readOnly?: boolean;
  /** 완료한 일을 감춘 경우 몇 줄이 빠졌는지 — 빈 칸처럼 보이지 않게 적어 준다 */
  hiddenCount?: number;
  /** 이 날을 접는다 — 적을 게 없는 날은 띠로 줄여 다른 날을 넓게 쓴다 */
  onCollapse?: () => void;
  /**
   * 가로를 다 쓰는 자리인가.
   *
   * 일곱 칸으로 나눠 놓으면 한 칸이 좁아 '엔카 진단완료차량 성능지 등록 및 광고수정'
   * 한 줄이 네 줄로 접힌다. 날짜를 위아래로 쌓을 때는 한 줄을 넓게 쓰고, 할 일은
   * 여러 열로 깔아 가로를 채운다.
   */
  wide?: boolean;
  onAdd: (content: string) => void;
  onToggle: (log: WorkLog) => void;
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
}

/**
 * 줄 수에 맞춰 늘어나는 칸.
 *
 * 한 줄짜리 input 이면 Shift+Enter 로 줄을 바꿀 수가 없다. textarea 로 두되
 * 적은 만큼만 커지게 한다 — 빈 줄을 미리 잡아 두면 카드가 쓸데없이 길어진다.
 */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export default function WorkLogDayCard({
  day,
  logs,
  canAdd,
  ownerName,
  readOnly = false,
  hiddenCount = 0,
  onCollapse,
  wide = false,
  onAdd,
  onToggle,
  onEdit,
  onRemove,
}: Props) {
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

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, log: WorkLog) => {
    // Shift+Enter 는 줄바꿈이라 그대로 흘려보낸다.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit(log);
    }
    if (e.key === 'Escape') closeEdit(); // 되돌리기 — blur가 뒤따라도 commitEdit이 막힌다
  };

  return (
    <div
      /*
        높이를 미리 잡아 두지 않는다.

        빈 칸에 160px 을 깔아 두니 아무것도 안 적힌 날이 화면 한 뼘씩 차지했다 —
        일곱 칸이면 그게 그대로 쌓여서 정작 적힌 날이 아래로 밀린다. 적은 만큼만 차지한다.
      */
      className={`flex flex-col rounded-2xl border bg-white ${
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
        <span className="flex items-baseline gap-1.5">
          {logs.length > 0 && (
            <span className={`text-[11px] font-medium ${doneCount === logs.length ? 'text-emerald-500' : 'text-slate-400'}`}>
              {doneCount}/{logs.length}
            </span>
          )}
          {/* 안 쓰는 날은 접어서 다른 날에 자리를 넘긴다 */}
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="이 날 접기"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
              aria-label="이 날 접기"
            >
              <ChevronsLeftRight size={13} />
            </button>
          )}
        </span>
      </div>

      <ul
        className={
          wide
            ? 'grid gap-x-5 gap-y-0.5 px-2 py-1.5 sm:grid-cols-2 xl:grid-cols-3'
            : 'space-y-0.5 px-1.5 py-1.5'
        }
      >
        {logs.map(log => (
          <li key={log.id} className="group flex items-start gap-1.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
            <button
              onClick={() => onToggle(log)}
              disabled={readOnly}
              className={`mt-px shrink-0 disabled:cursor-default ${log.done ? 'text-indigo-500' : 'text-slate-300 hover:text-slate-400'}`}
              aria-label={log.done ? '완료 취소' : '완료 표시'}
            >
              {log.done ? <CheckSquare size={15} /> : <Square size={15} />}
            </button>

            {editingId === log.id ? (
              <textarea
                rows={1}
                value={editDraft}
                ref={autoGrow}
                onChange={e => {
                  setEditDraft(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={e => onEditKeyDown(e, log)}
                onBlur={() => commitEdit(log)}
                autoFocus
                className="min-w-0 flex-1 resize-none rounded border border-indigo-300 px-1 py-0.5 text-[13px] leading-snug outline-none"
              />
            ) : (
              <button
                onClick={() => startEdit(log)}
                disabled={readOnly}
                className={`min-w-0 flex-1 whitespace-pre-wrap wrap-break-word text-left text-[13px] leading-snug disabled:cursor-default ${
                  log.done ? 'text-slate-400 line-through' : 'text-slate-700'
                }`}
              >
                {log.content}
                {ownerName && (
                  <span className="ml-1 whitespace-nowrap text-[11px] text-slate-400">· {ownerName(log.employeeId)}</span>
                )}
              </button>
            )}

            {!readOnly && (
              <button
                onClick={() => onRemove(log.id)}
                className="shrink-0 text-slate-300 opacity-60 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="삭제"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}

        {logs.length === 0 && !canAdd && <li className="px-1.5 py-1 text-[12px] text-slate-300">기록 없음</li>}
        {/* 감춘 줄이 몇 개인지 적어 둔다 — 안 그러면 다 지운 것처럼 보인다 */}
        {hiddenCount > 0 && (
          <li className="px-1.5 py-1 text-[11px] text-slate-300">완료한 일 {hiddenCount}개는 감췄습니다</li>
        )}
      </ul>

      {canAdd && (
        <div className="px-2 pb-2">
          {/* Enter 로 등록, Shift+Enter 로 줄바꿈 — 한 항목에 여러 줄을 적는다 */}
          <textarea
            rows={1}
            value={draft}
            ref={autoGrow}
            onChange={e => {
              changeDraft(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitNew();
              }
            }}
            onBlur={submitNew}
            placeholder="+ 할 일 (Shift+Enter 줄바꿈)"
            className="w-full resize-none rounded-lg border border-transparent bg-slate-50 px-2 py-1.5 text-[13px] leading-snug outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />
        </div>
      )}
    </div>
  );
}
