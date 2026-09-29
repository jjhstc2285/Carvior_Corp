import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

/**
 * 표 제목줄을 눌러 정렬한다.
 *
 * 목록이 길어지면 찾는 방법이 눈으로 훑는 것밖에 없다. 재검이 급한 차부터 보고 싶을
 * 때도, 어느 주차장에 몇 대인지 셀 때도 마찬가지다.
 *
 * 누르면 오름차순 → 내림차순 → 원래대로 세 걸음을 돈다. 원래대로가 있어야 한다 —
 * 정렬을 걸어 본 사람이 처음 화면으로 못 돌아가면 새로고침을 찾게 된다.
 *
 * 고른 정렬은 기억하지 않는다. 다음에 열었을 때 남의 정렬이 걸려 있으면 목록이
 * 달라 보여서 무엇이 바뀐 건지 헷갈린다 — 정렬은 지금 이 자리에서만 쓰는 것이다.
 */

export type SortDir = 'asc' | 'desc';

export interface SortColumn<T> {
  key: string;
  label: string;
  /** 무엇으로 견줄지. 숫자·문자·날짜 문자열 다 된다. 없으면 못 누르는 칸이다 */
  value?: (row: T) => string | number | null | undefined;
  align?: string;
  className?: string;
  /** 제목에 마우스를 올렸을 때 나오는 설명 */
  title?: string;
}

export function useTableSort<T>(columns: SortColumn<T>[]) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  /** 오름 → 내림 → 없음 */
  const click = (key: string) =>
    setSort(prev => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });

  /**
   * 값을 견준다.
   *
   * 빈 칸은 어느 쪽으로 정렬하든 뒤로 보낸다. 담당자가 없는 차가 맨 위에 몰려 있으면
   * 정렬을 건 까닭(누가 뭘 맡았나)이 화면 밖으로 밀린다.
   */
  const compare = (a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir) => {
    const emptyA = a === null || a === undefined || a === '';
    const emptyB = b === null || b === undefined || b === '';
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;

    const gap =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : // 숫자가 섞인 이름은 사람이 세는 차례로 — "구역 2" 가 "구역 10" 앞이다
          String(a).localeCompare(String(b), 'ko', { numeric: true });
    return dir === 'asc' ? gap : -gap;
  };

  /** 정렬을 건 목록. 안 걸었으면 받은 차례 그대로 돌려준다 */
  const apply = (rows: T[]): T[] => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.value) return rows;
    // 원본을 건드리지 않는다 — 다른 데서 같은 배열을 보고 있을 수 있다
    return [...rows].sort((a, b) => compare(col.value!(a), col.value!(b), sort.dir));
  };

  /** 제목줄 — 누를 수 있는 칸에는 화살표를 붙인다 */
  const headers = (): ReactNode =>
    columns.map(col => {
      const on = sort?.key === col.key;
      const sortable = !!col.value;
      return (
        <th
          key={col.key}
          onClick={sortable ? () => click(col.key) : undefined}
          title={col.title ?? (sortable ? '눌러서 정렬합니다' : undefined)}
          aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
          className={`px-5 py-2.5 font-medium ${col.align ?? ''} ${col.className ?? ''} ${
            sortable ? 'cursor-pointer select-none hover:bg-slate-50' : ''
          } ${on ? 'text-indigo-600' : ''}`}
        >
          <span
            className={`inline-flex items-center gap-1 ${col.align === 'text-right' ? 'flex-row-reverse' : ''}`}
          >
            {col.label}
            {/*
              누를 수 있는 칸이라는 표. 안 걸린 칸은 아주 흐리게 둔다 — 열 개 칸에
              진한 화살표가 다 붙어 있으면 지금 어디로 정렬됐는지가 안 보인다.
            */}
            {sortable &&
              (on ? (
                sort!.dir === 'asc' ? (
                  <ArrowUp size={12} />
                ) : (
                  <ArrowDown size={12} />
                )
              ) : (
                <ChevronsUpDown size={11} className="text-slate-300" />
              ))}
          </span>
        </th>
      );
    });

  return { sort, apply, headers, reset: () => setSort(null), sorted: sort !== null };
}
