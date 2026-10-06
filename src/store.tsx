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
  /** 오늘 구내식당에서 먹었는지 적는다 — null 이면 다시 출퇴근 시각으로 자동 판정 */
  setMeal: (used: boolean | null) => Promise<void>;

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
  /** 구역도에서 끌어다 놓기 — 빈 칸이면 이동, 차가 있으면 맞바꿈 */
  moveParkingVehicle: (id: string, to: { lot: string; zone: string; slot: string }) => Promise<void>;

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

    /*
      한 곳이 막혀도 나머지는 보여준다.

      예전에는 열한 개를 Promise.all 로 묶어서, 그중 하나(상담·정산 어느 하나)가 500 이면
      화면 전체가 '데이터를 불러오지 못했습니다'로 비었다. 그러면 출근 단추까지 사라진다 —
      상담 목록이 안 나오는 것과 출근을 못 찍는 것은 무게가 다르다.

      못 받은 목록은 빈 채로 두고, 무엇이 막혔는지만 알린다.
    */
    const failed: string[] = [];
    const get = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await run();
      } catch {
        failed.push(label);
        return fallback;
      }
    };

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
        ipWhitelist,
      ] = await Promise.all([
        // 직원 명단과 오늘 기록은 없으면 아무것도 못 한다 — 이 둘만 막히면 오류로 본다
        api<Employee[]>('/employees'),
        api<AttendanceRecord[]>(`/attendance/records?month=${month}`),
        get('정정 요청', () => api<CorrectionRequest[]>('/attendance/corrections'), []),
        get('근태 신청', () => api<AttendanceRequest[]>('/attendance/requests'), []),
        get('알림', () => api<AppNotification[]>('/attendance/notifications'), []),
        /*
          간편 정산은 화면에서 내렸다 — 부르지 않는다.

          로그인할 때마다 표 하나를 통째로 받아오는데 그걸 쓰는 화면이 없다. 서버는
          그 표를 읽어 JSON으로 만들고, 그 일을 사람 수만큼 한다.
          되살릴 일이 생기면 이 줄을 원래대로 돌리면 된다.
        */
        Promise.resolve<SettlementRecord[]>([]),
        get('알선·수출 정산', () => api<BrokerageSettlement[]>('/settlements/brokerage'), []),
        get('매입 정산', () => api<PurchaseSettlement[]>('/settlements/purchase'), []),
        get('상담', () => api<ConsultationRecord[]>('/consultations'), []),
        get('주차장', () => api<ParkingVehicle[]>('/parking'), []),
        isAdmin ? get('IP 목록', () => api<{ ip: string }[]>('/attendance/ip-whitelist'), []) : Promise.resolve([]),
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
        ipWhitelist: ipWhitelist.map((w) => w.ip),
        currentEmployeeId: user.id,
      });

      // 막힌 목록이 있으면 그것만 알린다 — 출퇴근은 그대로 찍을 수 있다
      setError(failed.length > 0 ? `${failed.join(' · ')}을(를) 불러오지 못했습니다.` : null);
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

  /**
   * 근태 승인함 — 신청이 들어오거나 처리되면 그 두 목록만 다시 받는다.
   *
   * 알림과 따로 듣는 이유: 알림은 읽을 거리라 목록만 갱신하면 되지만, 승인함은 화면에
   * 떠 있는 대기 목록이 바뀌어야 한다. 예전에는 알림 토스트만 뜨고 목록은 그대로여서
   * 매번 새로고침해야 했다.
   */
  useEffect(() => {
    if (!user) return;
    return onSocketEvent(SOCKET_EVENT.attendanceInbox, () => {
      void Promise.all([
        api<CorrectionRequest[]>('/attendance/corrections'),
        api<AttendanceRequest[]>('/attendance/requests'),
      ])
        .then(([requests, attendanceRequests]) =>
          setState(prev => ({
            ...prev,
            requests: requests.map(flatten),
            attendanceRequests: attendanceRequests.map(flatten),
          })),
        )
        .catch(() => {
          // 실패해도 다음 새로고침에 맞춰진다.
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
      setMeal: (used) => run(() => api('/attendance/meal', { method: 'PATCH', body: { used } })),

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
        // 대역에 든 빗금이 주소 칸에서 막히므로 물음표 뒤로 보낸다
        run(() => api(`/attendance/ip-whitelist?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' })),

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
      moveParkingVehicle: (id, to) =>
        run(() => api('/parking/move', { method: 'POST', body: { id, ...to } }), reloadParking),

    };
  }, [state, loading, error, month, load]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
