import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { onSocketEvent, SOCKET_EVENT } from '../../lib/socket';
import type { PurchaseIntake } from '../../types';

/**
 * 매입 관리 화면 전용 상태.
 * 다른 목록 화면과 같은 이유로 전역 store를 거치지 않는다.
 */

export type PurchaseIntakeInput = Omit<
  PurchaseIntake,
  'id' | 'totalAmount' | 'employeeId' | 'employee' | 'createdAt' | 'updatedAt'
> & {
  /**
   * 되사온 차 — 같은 번호가 가까운 날짜에 있어도 그대로 넣는다.
   *
   * 저장하는 값이 아니라 '알고도 넣는다'는 표시다. 서버는 이게 없으면 같은 차를
   * 두 번 넣지 못하게 막는다.
   */
  allowDuplicate?: boolean;
};

export interface PurchaseIntakeApi {
  items: PurchaseIntake[];
  loading: boolean;
  error: string | null;
  /** 성공하면 null, 실패하면 화면에 그대로 띄울 메시지를 돌려준다. */
  add: (input: PurchaseIntakeInput) => Promise<string | null>;
  edit: (id: string, patch: Partial<PurchaseIntakeInput>) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  reload: () => Promise<void>;
}

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/** 달로 보거나(month), 기간으로 보거나(range), 둘 다 비우면 전체를 본다. */
export function usePurchaseIntake(
  month: string,
  query: string,
  range?: { from: string; to: string } | null,
): PurchaseIntakeApi {
  const [items, setItems] = useState<PurchaseIntake[]>([]);
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
      else if (range) {
        params.set('from', range.from);
        params.set('to', range.to);
      }
      if (query.trim()) params.set('q', query.trim());
      const suffix = params.toString() ? `?${params}` : '';

      const rows = await api<PurchaseIntake[]>(`/purchase-intake${suffix}`);
      // 응답이 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않게 한다.
      if (myReq !== reqId.current) return;
      setItems(rows);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(message(e, '매입 내역을 불러오지 못했습니다.'));
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [month, query, range?.from, range?.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // 카비어에서 계약이 자동으로 들어오면 열어둔 목록도 따라가게 한다 — 새로고침하지 않아도 보이게.
  useEffect(() => onSocketEvent(SOCKET_EVENT.purchaseIntake, () => void load()), [load]);

  const add = useCallback(
    async (input: PurchaseIntakeInput) => {
      try {
        await api('/purchase-intake', { method: 'POST', body: input });
        await load();
        return null;
      } catch (e) {
        return message(e, '등록하지 못했습니다.');
      }
    },
    [load],
  );

  const edit = useCallback(
    async (id: string, patch: Partial<PurchaseIntakeInput>) => {
      try {
        const updated = await api<PurchaseIntake>(`/purchase-intake/${id}`, { method: 'PATCH', body: patch });
        setItems(prev => prev.map(row => (row.id === id ? updated : row)));
        return null;
      } catch (e) {
        return message(e, '저장하지 못했습니다.');
      }
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api(`/purchase-intake/${id}`, { method: 'DELETE' });
        await load();
        return null;
      } catch (e) {
        return message(e, '삭제하지 못했습니다.');
      }
    },
    [load],
  );

  return { items, loading, error, add, edit, remove, reload: load };
}
