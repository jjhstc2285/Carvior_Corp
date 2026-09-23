import { useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * 표 제목줄을 잡아 끌어 열 순서를 바꾼다.
 *
 * 누구는 월세부터 보고 누구는 만료일부터 본다. 화면마다 따로 만들면 끌리는 느낌이
 * 조금씩 달라지고, 한 곳만 고치면 나머지는 그대로 남는다 — 한 벌로 둔다.
 *
 * 바꾼 차례는 그 브라우저에만 남는다(localStorage). 사람마다 다르게 두는 게 맞고,
 * 서버에 두면 남이 바꾼 차례가 내 화면을 흔든다.
 */

export interface Column {
  key: string;
  label: string;
  /** 'text-right' · 'text-center' — 제목과 칸을 같이 맞춘다 */
  align?: string;
  /** 제목줄에서 줄바꿈하지 않을 칸 */
  nowrap?: boolean;
  /** 제목에 붙는 설명 — 계산식처럼 한 줄로 못 적는 것 */
  title?: string;
  /** 제목 글자색 같은 덧칠 */
  headClass?: string;
}

export function useColumnOrder(storageKey: string, columns: Column[]) {
  const keys = () => columns.map(c => c.key);

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[];
      const known = saved.filter(k => columns.some(c => c.key === k));
      // 기억해 둔 차례에 없는 새 칸은 뒤에 붙인다 — 칸이 늘어도 차례가 깨지지 않는다
      return [...known, ...keys().filter(k => !known.includes(k))];
    } catch {
      return keys();
    }
  });

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  /**
   * 잡은 칸을 놓은 자리로 옮긴다.
   *
   * 오른쪽으로 끌면 그 칸 뒤에, 왼쪽으로 끌면 그 칸 앞에 놓는다 — 늘 앞에만 넣으면
   * 오른쪽으로 옮길 때 한 칸 덜 간 것처럼 보인다.
   */
  const move = (from: string, to: string) => {
    if (from === to) return;
    setOrder(prev => {
      const after = prev.indexOf(from) < prev.indexOf(to);
      const next = prev.filter(k => k !== from);
      next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    localStorage.removeItem(storageKey);
    setOrder(keys());
  };

  /** 제목줄 — 차례대로 그리고 끌 수 있게 한다 */
  const headers = () =>
    order.map(key => {
      const col = columns.find(c => c.key === key);
      if (!col) return null;

      /*
        놓일 자리를 선으로 그린다. 어디로 가는지 모르면 놓고 나서야 알게 된다.
        테두리 대신 안쪽 그림자로 그려 칸이 밀리지 않게 한다.
      */
      const dragging = dragKey === key;
      const hovering = !!dragKey && overKey === key && !dragging;
      const after = hovering && order.indexOf(dragKey) < order.indexOf(key);
      const mark = !hovering ? '' : after ? 'shadow-[inset_-3px_0_0_0_#4f46e5]' : 'shadow-[inset_3px_0_0_0_#4f46e5]';

      return (
        <th
          key={key}
          draggable
          onDragStart={e => {
            setDragKey(key);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (overKey !== key) setOverKey(key);
          }}
          onDragLeave={() => setOverKey(prev => (prev === key ? null : prev))}
          onDrop={() => {
            if (dragKey) move(dragKey, key);
            setDragKey(null);
            setOverKey(null);
          }}
          onDragEnd={() => {
            setDragKey(null);
            setOverKey(null);
          }}
          title={col.title ? `${col.title}
— 끌어서 순서를 바꿉니다` : '끌어서 순서를 바꿉니다'}
          className={`select-none px-2.5 py-2.5 font-medium transition-colors ${col.align ?? ''} ${col.headClass ?? ''} ${
            col.nowrap === false ? '' : 'whitespace-nowrap'
          } ${mark} ${
            dragging
              ? 'cursor-grabbing bg-indigo-50 text-indigo-400 opacity-60'
              : hovering
                ? 'cursor-grabbing bg-indigo-50/70 text-indigo-700'
                : 'cursor-grab hover:bg-slate-100'
          }`}
        >
          <span className={`flex items-center gap-1 ${col.align === 'text-right' ? 'justify-end' : ''} ${col.align === 'text-center' ? 'justify-center' : ''}`}>
            {/* 끌 수 있는 자리라는 표 — 잡기 전에는 흐리게 */}
            <GripVertical size={11} className={dragKey ? 'text-indigo-400' : 'text-slate-300'} />
            {col.label}
          </span>
        </th>
      );
    });

  /**
   * 한 줄의 칸들 — 제목줄과 같은 차례로 깐다.
   *
   * 제목과 내용이 따로 놀면 순서를 바꾸는 순간 값이 엉뚱한 칸에 들어간다.
   */
  const cells = (map: Record<string, ReactNode>, rowClass = '') =>
    order.map(key => {
      const col = columns.find(c => c.key === key);
      return (
        <td
          key={key}
          className={`px-2.5 py-1.5 ${col?.align ?? ''} ${col?.nowrap === false ? '' : 'whitespace-nowrap'} ${
            dragKey === key ? 'bg-indigo-50/40' : ''
          } ${rowClass}`}
        >
          {map[key]}
        </td>
      );
    });

  return { order, headers, cells, reset, dragKey, count: columns.length };
}

/** 바꾼 차례를 처음으로 되돌리는 단추 — 화면마다 같은 자리에 둔다 */
export function ColumnResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      title="제목줄을 끌어 옮긴 차례를 처음으로 되돌립니다"
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
    >
      열 순서 초기화
    </button>
  );
}
