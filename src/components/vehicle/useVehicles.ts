import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { ManagedVehicle, VehicleExpenseKind, VehicleExpenseLog, VehicleUsageNote } from '../../types';

/**
 * 차량관리 화면 전용 상태.
 *
 * 작업일지와 같은 이유로 전역 store를 거치지 않는다 — 체크박스를 연달아 누르는 화면이라
 * 한 번 누를 때마다 전체 데이터를 다시 받아오면 그대로 지연으로 보인다.
 * 체크·삭제는 화면부터 바꾸고, 서버가 거부하면 되돌린다.
 */

export interface NewExpense {
  vehicleId: string;
  kind: VehicleExpenseKind;
  amount: number;
  note?: VehicleUsageNote;
  /** 무엇에 쓴 돈인지 — 소모품 수리·기타에서 쓴다 */
  memo?: string;
}

export type VehicleFlags = Pick<
  ManagedVehicle,
  // 체크박스 셋
  | 'prepared'
  | 'advertised'
  | 'moveBlocked'
  // 주차 배치 기준 — 어느 주차장에 세울지가 이 값들로 갈린다
  | 'priceManwon'
  | 'fuel'
  | 'bodyType'
  | 'saleType'
  | 'isTaxi'
  // 재고 금융(제시)
  | 'modelYear'
  | 'mileage'
  | 'firstRegisteredOn'
  | 'cashVehicle'
  | 'offerDate'
  | 'transferDate'
  | 'stockCapital'
  | 'stockAmount'
  | 'repayDate'
>;

export interface VehiclesApi {
  vehicles: ManagedVehicle[];
  expenses: VehicleExpenseLog[];
  loading: boolean;
  error: string | null;
  /** 성공하면 null, 실패하면 화면에 그대로 띄울 메시지를 돌려준다. */
  addVehicle: (vehicleNumber: string, vehicleModel: string) => Promise<string | null>;
  toggleFlag: (vehicle: ManagedVehicle, patch: Partial<VehicleFlags>) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  addExpense: (input: NewExpense) => Promise<string | null>;
  editExpense: (id: string, patch: { amount?: number; date?: string; note?: VehicleUsageNote; memo?: string }) => Promise<string | null>;
  removeExpense: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export function useVehicles(): VehiclesApi {
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpenseLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const [vehicleRows, expenseRows] = await Promise.all([
        api<ManagedVehicle[]>('/vehicles'),
        api<VehicleExpenseLog[]>('/vehicles/expenses'),
      ]);
      if (myReq !== reqId.current) return;
      setVehicles(vehicleRows);
      setExpenses(expenseRows);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(message(e, '차량 정보를 불러오지 못했습니다.'));
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addVehicle = useCallback(async (vehicleNumber: string, vehicleModel: string) => {
    try {
      const row = await api<ManagedVehicle>('/vehicles', { method: 'POST', body: { vehicleNumber, vehicleModel } });
      setVehicles(prev => [row, ...prev]);
      return null;
    } catch (e) {
      return message(e, '차량을 등록하지 못했습니다.');
    }
  }, []);

  const toggleFlag = useCallback(async (vehicle: ManagedVehicle, patch: Partial<VehicleFlags>) => {
    // 상품화를 끄면 광고완료도 같이 꺼진다(서버와 같은 규칙을 화면에서도 먼저 반영).
    const next = { ...vehicle, ...patch };
    if (!next.prepared) next.advertised = false;

    setVehicles(prev => prev.map(v => (v.id === vehicle.id ? next : v)));
    try {
      await api(`/vehicles/${vehicle.id}`, { method: 'PATCH', body: patch });
      setError(null);
    } catch (e) {
      setVehicles(prev => prev.map(v => (v.id === vehicle.id ? vehicle : v)));
      setError(message(e, '변경사항을 저장하지 못했습니다.'));
    }
  }, []);

  const removeVehicle = useCallback(async (id: string) => {
    const before = { vehicles, expenses };
    setVehicles(prev => prev.filter(v => v.id !== id));
    // 차량이 지워지면 그 차의 주유·배터리 이력도 서버에서 함께 사라진다.
    setExpenses(prev => prev.filter(e => e.vehicleId !== id));
    try {
      await api(`/vehicles/${id}`, { method: 'DELETE' });
      setError(null);
    } catch (e) {
      setVehicles(before.vehicles);
      setExpenses(before.expenses);
      setError(message(e, '차량을 삭제하지 못했습니다.'));
    }
  }, [vehicles, expenses]);

  const addExpense = useCallback(async (input: NewExpense) => {
    try {
      const row = await api<VehicleExpenseLog>('/vehicles/expenses', { method: 'POST', body: input });
      setExpenses(prev => [row, ...prev]);
      return null;
    } catch (e) {
      return message(e, '이력을 등록하지 못했습니다.');
    }
  }, []);

  const editExpense = useCallback(
    async (id: string, patch: { amount?: number; date?: string; note?: VehicleUsageNote }) => {
      try {
        const row = await api<VehicleExpenseLog>(`/vehicles/expenses/${id}`, { method: 'PATCH', body: patch });
        setExpenses(prev => prev.map(e => (e.id === id ? row : e)));
        return null;
      } catch (e) {
        return message(e, '이력을 수정하지 못했습니다.');
      }
    },
    [],
  );

  const removeExpense = useCallback(async (id: string) => {
    const before = expenses;
    setExpenses(prev => prev.filter(e => e.id !== id));
    try {
      await api(`/vehicles/expenses/${id}`, { method: 'DELETE' });
      setError(null);
    } catch (e) {
      setExpenses(before);
      setError(message(e, '이력을 삭제하지 못했습니다.'));
    }
  }, [expenses]);

  return {
    vehicles,
    expenses,
    loading,
    error,
    addVehicle,
    toggleFlag,
    removeVehicle,
    addExpense,
    editExpense,
    removeExpense,
    reload: load,
  };
}
