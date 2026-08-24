import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { WorkLog } from '../../types';

/**
 * 작업일지는 store(전역)를 거치지 않고 이 훅이 직접 들고 있는다.
 *
 * store의 쓰기 헬퍼는 매번 전체 데이터를 다시 받아오는데(refresh),
 * 체크박스를 연달아 누르는 화면에서는 그 비용이 그대로 지연으로 보인다.
 * 여기서는 보고 있는 주(週)만 받아오고, 체크/삭제는 화면부터 바꾼 뒤 서버에 보낸다.
 */
export interface WorkLogsApi {
  logs: WorkLog[];
  loading: boolean;
  error: string | null;
  add: (date: string, content: string) => Promise<void>;
  toggle: (log: WorkLog) => Promise<void>;
  edit: (id: string, content: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/** 서버 응답에 딸려오는 employee 객체는 화면에서 안 쓰므로 걷어낸다(store.flatten과 같은 이유). */
function flatten(row: WorkLog & { employee?: unknown }): WorkLog {
  const { employee: _employee, ...rest } = row;
  return rest;
}

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * @param from  조회 시작일 YYYY-MM-DD
 * @param to    조회 종료일 YYYY-MM-DD
 * @param employeeId  관리자가 다른 직원 일지를 볼 때 지정(직원은 서버가 본인으로 고정)
 */
export function useWorkLogs(from: string, to: string, employeeId: string): WorkLogsApi {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ from, to, ...(employeeId ? { employeeId } : {}) });
      const rows = await api<(WorkLog & { employee?: unknown })[]>(`/work-logs?${query}`);
      // 주를 빠르게 넘기면 이전 요청이 늦게 도착할 수 있다 — 최신 요청만 반영한다.
      if (myReq !== reqId.current) return;
      setLogs(rows.map(flatten));
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(message(e, '작업일지를 불러오지 못했습니다.'));
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [from, to, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (date: string, content: string) => {
      try {
        const row = await api<WorkLog & { employee?: unknown }>('/work-logs', {
          method: 'POST',
          body: { date, content, ...(employeeId ? { employeeId } : {}) },
        });
        setLogs((prev) => [...prev, flatten(row)]);
        setError(null);
      } catch (e) {
        setError(message(e, '할 일을 추가하지 못했습니다.'));
      }
    },
    [employeeId],
  );

  const toggle = useCallback(async (log: WorkLog) => {
    const done = !log.done;
    setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, done } : l)));
    try {
      await api(`/work-logs/${log.id}`, { method: 'PATCH', body: { done } });
      setError(null);
    } catch (e) {
      // 서버가 거부하면 체크 상태를 되돌린다 — 화면만 바뀌어 있으면 더 헷갈린다.
      setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, done: !done } : l)));
      setError(message(e, '완료 상태를 바꾸지 못했습니다.'));
    }
  }, []);

  const edit = useCallback(async (id: string, content: string) => {
    const before = logs.find((l) => l.id === id);
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, content } : l)));
    try {
      await api(`/work-logs/${id}`, { method: 'PATCH', body: { content } });
      setError(null);
    } catch (e) {
      if (before) setLogs((prev) => prev.map((l) => (l.id === id ? before : l)));
      setError(message(e, '내용을 수정하지 못했습니다.'));
    }
  }, [logs]);

  const remove = useCallback(async (id: string) => {
    const before = logs;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    try {
      await api(`/work-logs/${id}`, { method: 'DELETE' });
      setError(null);
    } catch (e) {
      setLogs(before);
      setError(message(e, '할 일을 삭제하지 못했습니다.'));
    }
  }, [logs]);

  return { logs, loading, error, add, toggle, edit, remove, reload: load };
}
