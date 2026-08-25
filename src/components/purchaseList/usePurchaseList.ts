import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { PurchaseListItem, PurchaseListSummary } from '../../types';

/**
 * 매입리스트 화면 전용 상태.
 *
 * 차량관리·작업일지와 같은 이유로 전역 store를 거치지 않는다 — 표의 칸을 연달아 고치는
 * 화면이라, 한 칸 고칠 때마다 전체 데이터를 다시 받아오면 그대로 지연으로 보인다.
 */

export type PurchaseListInput = Partial<Omit<PurchaseListItem, 'id' | 'createdAt' | 'updatedAt'>> & {
  vehicleNumber: string;
  vehicleName: string;
};

export interface PurchaseListApi {
  items: PurchaseListItem[];
  summary: PurchaseListSummary | null;
  loading: boolean;
  error: string | null;
  /** 성공하면 null, 실패하면 화면에 그대로 띄울 메시지를 돌려준다. */
  add: (input: PurchaseListInput) => Promise<string | null>;
  edit: (id: string, patch: Partial<PurchaseListInput>) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  reload: () => Promise<void>;
}

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * @param month 상환일자 기준 월(YYYY-MM). 빈 문자열이면 전체 목록을 본다.
 * @param query 차량번호·차량명·담당자 검색어
 */
export function usePurchaseList(month: string, query: string): PurchaseListApi {
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [summary, setSummary] = useState<PurchaseListSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (query.trim()) params.set('q', query.trim());
      const suffix = params.toString() ? `?${params}` : '';

      const [rows, total] = await Promise.all([
        api<PurchaseListItem[]>(`/purchase-list${suffix}`),
        // 합계는 월을 고른 화면에서만 의미가 있다.
        month ? api<PurchaseListSummary>(`/purchase-list/summary?month=${month}`) : Promise.resolve(null),
      ]);

      // 응답이 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않게 한다.
      if (myReq !== reqId.current) return;
      setItems(rows);
      setSummary(total);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(message(e, '매입리스트를 불러오지 못했습니다.'));
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [month, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (input: PurchaseListInput) => {
      try {
        await api('/purchase-list', { method: 'POST', body: input });
        await load();
        return null;
      } catch (e) {
        return message(e, '등록하지 못했습니다.');
      }
    },
    [load],
  );

  const edit = useCallback(
    async (id: string, patch: Partial<PurchaseListInput>) => {
      try {
        const updated = await api<PurchaseListItem>(`/purchase-list/${id}`, { method: 'PATCH', body: patch });
        // 한 줄만 갈아끼운다 — 표 전체를 다시 받으면 고치던 자리가 튄다.
        setItems(prev => prev.map(row => (row.id === id ? updated : row)));
        // 금액·상환일자를 고치면 합계가 달라지므로 그때만 다시 받는다.
        if (patch.repaymentAmount !== undefined || patch.repayDate !== undefined || patch.stockAmount !== undefined) {
          await load();
        }
        return null;
      } catch (e) {
        return message(e, '저장하지 못했습니다.');
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api(`/purchase-list/${id}`, { method: 'DELETE' });
        await load();
        return null;
      } catch (e) {
        return message(e, '삭제하지 못했습니다.');
      }
    },
    [load],
  );

  return { items, summary, loading, error, add, edit, remove, reload: load };
}
