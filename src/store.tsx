import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { api, ApiError } from './lib/api';
import { useAuth } from './authStore';
import type { AuthUser } from './lib/auth';
import { SOCKET_EVENT, onSocketEvent } from './lib/socket';
import type {
  AppNotification,
  AppState,
  AttendanceRecord,
  AttendanceRequest,
  AttendanceRequestKind,
  BrokerageSettlement,
  ConsultationRecord,
  CorrectionRequest,
  Employee,
  ParkingVehicle,
  PurchaseSettlement,
  SettlementRecord,
  VehiclePost,
} from './types';

const EMPTY_STATE: AppState = {
  employees: [],
  records: [],
  requests: [],
  notifications: [],
  currentEmployeeId: '',
  ipWhitelist: [],
  settlements: [],
  brokerageSettlements: [],
  purchaseSettlements: [],
  consultations: [],
  parkingVehicles: [],
  attendanceRequests: [],
  vehiclePosts: [],
};

type Upsert<T, K extends string> = Omit<T, 'id' | K> & { id?: string };

interface Store {
  state: AppState;
  loading: boolean;
  error: string | null;
  /** 현재 보고 있는 월(YYYY-MM) — 출퇴근 조회 범위 */
  month: string;
  setMonth: (month: string) => void;
  refresh: () => Promise<void>;

  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;

  submitCorrectionRequest: (input: {
    date: string;
    reason: string;
    requestedClockIn: string | null;
    requestedClockOut: string | null;
  }) => Promise<void>;
  approveRequest: (requestId: string, note?: string) => Promise<void>;
  rejectRequest: (requestId: string, note: string) => Promise<void>;

  submitAttendanceRequest: (input: { date: string; kind: AttendanceRequestKind; reason: string }) => Promise<void>;
  approveAttendanceRequest: (requestId: string, note?: string) => Promise<void>;
  rejectAttendanceRequest: (requestId: string, note: string) => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  addWhitelistIp: (ip: string) => Promise<void>;
  removeWhitelistIp: (ip: string) => Promise<void>;

  upsertSettlement: (record: Upsert<SettlementRecord, 'createdAt'>) => Promise<void>;
  deleteSettlement: (id: string) => Promise<void>;
  upsertBrokerageSettlement: (record: Upsert<BrokerageSettlement, 'createdAt'>) => Promise<void>;
  deleteBrokerageSettlement: (id: string) => Promise<void>;
  upsertPurchaseSettlement: (record: Upsert<PurchaseSettlement, 'createdAt' | 'prepTotal' | 'prepBreakdown' | 'grandTotal' | 'vehicleCost' | 'grandTotalWon'>) => Promise<void>;
  deletePurchaseSettlement: (id: string) => Promise<void>;

  upsertConsultation: (record: Upsert<ConsultationRecord, 'createdAt' | 'files'>) => Promise<void>;
  deleteConsultation: (id: string) => Promise<void>;

  upsertParkingVehicle: (record: Upsert<ParkingVehicle, 'updatedAt'>) => Promise<void>;
  deleteParkingVehicle: (id: string) => Promise<void>;

  upsertVehiclePost: (record: {
    id?: string;
    site: string;
    vehicleNumber: string;
    vehicleModel: string;
    customerPhone: string;
    content: string;
    photos: string[];
  }) => Promise<void>;
  deleteVehiclePost: (id: string) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

/** 서버 응답에 딸려오는 employee 객체를 걷어내고 화면이 쓰는 평평한 모양으로 맞춘다. */
function flatten<T>(row: T): T {
  const { employee: _employee, ...rest } = row as T & { employee?: unknown };
  return rest as T;
}

/**
 * 내 계정이 명단에 반드시 들어있게 보정한다.
 *
 * /employees는 서버에서 5분 캐시되고 비활성 직원은 빠지기 때문에, 방금 만든 계정으로
 * 로그인하면 잠깐 명단에서 내가 빠져 보일 수 있다. 화면 여러 곳이 "내 정보는 목록에 있다"를
 * 전제로 짜여 있어서, 그 틈에 화면이 통째로 죽는 걸 여기서 막는다.
 */
function withCurrentUser(employees: Employee[], user: AuthUser): Employee[] {
  if (employees.some(e => e.id === user.id)) return employees;
  return [
    ...employees,
    { id: user.id, name: user.name, position: user.position, department: null, phones: [], role: user.role, active: true },
  ];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const isAdmin = user?.role === 'ADMIN';
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!user) {
      setState(EMPTY_STATE);
      return;
    }
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);

    try {
      // 화면 전체가 한 번에 뜨는 게 자연스러워서 병렬로 모두 받아온다.
      // 관리자 전용 목록(IP 화이트리스트)은 직원일 때 아예 요청하지 않는다(403 방지).
      const [
        employees,
        records,
        requests,
        attendanceRequests,
        notifications,
        settlements,
        brokerageSettlements,
        purchaseSettlements,
        consultations,
        parkingVehicles,
        vehiclePosts,
        ipWhitelist,
      ] = await Promise.all([
        api<Employee[]>('/employees'),
        api<AttendanceRecord[]>(`/attendance/records?month=${month}`),
        api<CorrectionRequest[]>('/attendance/corrections'),
        api<AttendanceRequest[]>('/attendance/requests'),
        api<AppNotification[]>('/attendance/notifications'),
        api<SettlementRecord[]>('/settlements/basic'),
        api<BrokerageSettlement[]>('/settlements/brokerage'),
        api<PurchaseSettlement[]>('/settlements/purchase'),
        api<ConsultationRecord[]>('/consultations'),
        api<ParkingVehicle[]>('/parking'),
        api<VehiclePost[]>('/vehicle-posts'),
        isAdmin ? api<{ ip: string }[]>('/attendance/ip-whitelist') : Promise.resolve([]),
      ]);

      // 응답이 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않게 한다.
      if (myReq !== reqId.current) return;

      setState({
        employees: withCurrentUser(employees, user),
        records: records.map(flatten),
        requests: requests.map(flatten),
        attendanceRequests: attendanceRequests.map(flatten),
        notifications,
        settlements: settlements.map(flatten),
        brokerageSettlements: brokerageSettlements.map(flatten),
        purchaseSettlements: purchaseSettlements.map(flatten),
        consultations: consultations.map(flatten),
        parkingVehicles: parkingVehicles.map(flatten),
        vehiclePosts: vehiclePosts.map(flatten),
        ipWhitelist: ipWhitelist.map((w) => w.ip),
        currentEmployeeId: user.id,
      });
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [user, month, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  // 실시간 알림 — 소켓으로 알림이 오면 알림 목록만 다시 받아온다.
  // 전체(load)를 다시 부르면 화면 전체가 깜빡이고 요청도 열 개가 넘게 나간다.
  useEffect(() => {
    if (!user) return;
    return onSocketEvent(SOCKET_EVENT.notification, () => {
      void api<AppNotification[]>('/attendance/notifications')
        .then(notifications => setState(prev => ({ ...prev, notifications })))
        .catch(() => {
          // 목록 갱신 실패는 조용히 넘긴다 — 다음 새로고침에 맞춰진다.
        });
    });
  }, [user]);

  const value = useMemo<Store>(() => {
    // 서버 상태가 정답이므로, 쓰기 후에는 전체를 다시 불러와 화면을 맞춘다.
    // 목록이 크지 않아 이 단순함이 낙관적 업데이트보다 낫다.
    //
    // 다만 구역도처럼 한 자리씩 계속 고치는 화면은 매번 열두 개 요청을 기다리게 되어
    // 눈에 띄게 굼뜨다. 그런 곳은 reload에 '그 목록만 받는 함수'를 넘긴다.
    const run = async (fn: () => Promise<unknown>, reload?: () => Promise<void>) => {
      await fn();
      await (reload ?? load)();
    };

    const reloadParking = async () => {
      const rows = await api<ParkingVehicle[]>('/parking');
      setState(prev => ({ ...prev, parkingVehicles: rows.map(flatten) }));
    };

    return {
      state,
      loading,
      error,
      month,
      setMonth,
      refresh: load,

      clockIn: () => run(() => api('/attendance/clock-in', { method: 'POST' })),
      clockOut: () => run(() => api('/attendance/clock-out', { method: 'POST' })),

      submitCorrectionRequest: (input) =>
        run(() =>
          api('/attendance/corrections', {
            method: 'POST',
            body: {
              date: input.date,
              reason: input.reason,
              ...(input.requestedClockIn ? { requestedClockIn: input.requestedClockIn } : {}),
              ...(input.requestedClockOut ? { requestedClockOut: input.requestedClockOut } : {}),
            },
          }),
        ),
      approveRequest: (id, note) =>
        run(() => api(`/attendance/corrections/${id}/approve`, { method: 'PATCH', body: { note } })),
      rejectRequest: (id, note) =>
        run(() => api(`/attendance/corrections/${id}/reject`, { method: 'PATCH', body: { note } })),

      submitAttendanceRequest: (input) => run(() => api('/attendance/requests', { method: 'POST', body: input })),
      approveAttendanceRequest: (id, note) =>
        run(() => api(`/attendance/requests/${id}/approve`, { method: 'PATCH', body: { note } })),
      rejectAttendanceRequest: (id, note) =>
        run(() => api(`/attendance/requests/${id}/reject`, { method: 'PATCH', body: { note } })),

      markNotificationRead: (id) => run(() => api(`/attendance/notifications/${id}/read`, { method: 'PATCH' })),
      markAllNotificationsRead: () => run(() => api('/attendance/notifications/read-all', { method: 'PATCH' })),

      addWhitelistIp: (ip) => run(() => api('/attendance/ip-whitelist', { method: 'POST', body: { ip } })),
      removeWhitelistIp: (ip) =>
        run(() => api(`/attendance/ip-whitelist/${encodeURIComponent(ip)}`, { method: 'DELETE' })),

      upsertSettlement: ({ id, ...body }) =>
        run(() =>
          id
            ? api(`/settlements/basic/${id}`, { method: 'PATCH', body })
            : api('/settlements/basic', { method: 'POST', body }),
        ),
      deleteSettlement: (id) => run(() => api(`/settlements/basic/${id}`, { method: 'DELETE' })),

      upsertBrokerageSettlement: ({ id, ...body }) =>
        run(() =>
          id
            ? api(`/settlements/brokerage/${id}`, { method: 'PATCH', body })
            : api('/settlements/brokerage', { method: 'POST', body }),
        ),
      deleteBrokerageSettlement: (id) => run(() => api(`/settlements/brokerage/${id}`, { method: 'DELETE' })),

      upsertPurchaseSettlement: ({ id, ...body }) =>
        run(() =>
          id
            ? api(`/settlements/purchase/${id}`, { method: 'PATCH', body })
            : api('/settlements/purchase', { method: 'POST', body }),
        ),
      deletePurchaseSettlement: (id) => run(() => api(`/settlements/purchase/${id}`, { method: 'DELETE' })),

      upsertConsultation: ({ id, ...body }) =>
        run(() =>
          id ? api(`/consultations/${id}`, { method: 'PATCH', body }) : api('/consultations', { method: 'POST', body }),
        ),
      deleteConsultation: (id) => run(() => api(`/consultations/${id}`, { method: 'DELETE' })),

      // 주차는 칸(lot+zone+slot) 기준 upsert라 신규/수정 모두 POST 하나로 처리된다.
      upsertParkingVehicle: ({ id: _id, ...body }) =>
        run(() => api('/parking', { method: 'POST', body }), reloadParking),
      deleteParkingVehicle: (id) => run(() => api(`/parking/${id}`, { method: 'DELETE' }), reloadParking),

      upsertVehiclePost: ({ id, ...body }) =>
        run(() =>
          id
            ? api(`/vehicle-posts/${id}`, { method: 'PATCH', body })
            : api('/vehicle-posts', { method: 'POST', body }),
        ),
      deleteVehiclePost: (id) => run(() => api(`/vehicle-posts/${id}`, { method: 'DELETE' })),
    };
  }, [state, loading, error, month, load]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
