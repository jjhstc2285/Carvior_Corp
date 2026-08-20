import dayjs from 'dayjs';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppState, AttendanceRequest, AttendanceRequestKind, ConsultationRecord, CorrectionRequest, ParkingVehicle, SettlementRecord } from './types';
import { ATTENDANCE_REQUEST_KIND_LABEL } from './types';
import { loadState, resetState, saveState } from './lib/storage';

interface Store {
  state: AppState;
  setCurrentEmployeeId: (id: string) => void;
  submitCorrectionRequest: (input: {
    employeeId: string;
    date: string;
    reason: string;
    requestedClockIn: string | null;
    requestedClockOut: string | null;
  }) => void;
  approveRequest: (requestId: string, note?: string) => void;
  rejectRequest: (requestId: string, note: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clockIn: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  addWhitelistIp: (ip: string) => void;
  removeWhitelistIp: (ip: string) => void;
  upsertSettlement: (record: Omit<SettlementRecord, 'id' | 'createdAt'> & { id?: string }) => void;
  deleteSettlement: (id: string) => void;
  upsertConsultation: (record: Omit<ConsultationRecord, 'id' | 'createdAt'> & { id?: string }) => void;
  deleteConsultation: (id: string) => void;
  upsertParkingVehicle: (record: Omit<ParkingVehicle, 'id' | 'updatedAt'> & { id?: string }) => void;
  deleteParkingVehicle: (id: string) => void;
  submitAttendanceRequest: (input: { employeeId: string; date: string; kind: AttendanceRequestKind; reason: string }) => void;
  approveAttendanceRequest: (requestId: string, note?: string) => void;
  rejectAttendanceRequest: (requestId: string, note: string) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo<Store>(() => ({
    state,
    setCurrentEmployeeId: (id) => setState(s => ({ ...s, currentEmployeeId: id })),

    submitCorrectionRequest: ({ employeeId, date, reason, requestedClockIn, requestedClockOut }) => {
      setState(s => {
        const req: CorrectionRequest = {
          id: `req-${Date.now()}`,
          employeeId,
          date,
          reason,
          requestedClockIn,
          requestedClockOut,
          status: 'pending',
          createdAt: new Date().toISOString(),
          reviewedAt: null,
          reviewNote: null,
        };
        const emp = s.employees.find(e => e.id === employeeId);
        return {
          ...s,
          requests: [req, ...s.requests],
          notifications: [
            {
              id: `n-${Date.now()}`,
              type: 'correctionRequest',
              message: `${emp?.name ?? '직원'}님이 ${dayjs(date).format('M월 D일')} 근태 수정을 요청했습니다.`,
              employeeId,
              date,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ],
        };
      });
    },

    approveRequest: (requestId, note) => {
      setState(s => {
        const req = s.requests.find(r => r.id === requestId);
        if (!req) return s;
        const existing = s.records.find(r => r.employeeId === req.employeeId && r.date === req.date);
        const records = existing
          ? s.records.map(r => r === existing ? { ...r, clockIn: req.requestedClockIn, clockOut: req.requestedClockOut } : r)
          : [...s.records, { id: `r-${Date.now()}`, employeeId: req.employeeId, date: req.date, clockIn: req.requestedClockIn, clockOut: req.requestedClockOut }];
        return {
          ...s,
          records,
          requests: s.requests.map(r => r.id === requestId ? { ...r, status: 'approved', reviewedAt: new Date().toISOString(), reviewNote: note ?? null } : r),
        };
      });
    },

    rejectRequest: (requestId, note) => {
      setState(s => ({
        ...s,
        requests: s.requests.map(r => r.id === requestId ? { ...r, status: 'rejected', reviewedAt: new Date().toISOString(), reviewNote: note } : r),
      }));
    },

    markNotificationRead: (id) => {
      setState(s => ({ ...s, notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }));
    },

    markAllNotificationsRead: () => {
      setState(s => ({ ...s, notifications: s.notifications.map(n => ({ ...n, read: true })) }));
    },

    clockIn: (employeeId) => {
      setState(s => {
        const today = dayjs().format('YYYY-MM-DD');
        const now = dayjs().format('HH:mm');
        const existing = s.records.find(r => r.employeeId === employeeId && r.date === today);
        if (existing) {
          if (existing.clockIn) return s; // 이미 출근 찍음 — 중복 방지
          return { ...s, records: s.records.map(r => r === existing ? { ...r, clockIn: now } : r) };
        }
        return {
          ...s,
          records: [...s.records, { id: `r-${Date.now()}`, employeeId, date: today, clockIn: now, clockOut: null }],
        };
      });
    },

    clockOut: (employeeId) => {
      setState(s => {
        const today = dayjs().format('YYYY-MM-DD');
        const now = dayjs().format('HH:mm');
        const existing = s.records.find(r => r.employeeId === employeeId && r.date === today);
        if (!existing?.clockIn || existing.clockOut) return s; // 출근 전이거나 이미 퇴근 찍음
        return { ...s, records: s.records.map(r => r === existing ? { ...r, clockOut: now } : r) };
      });
    },

    addWhitelistIp: (ip) => {
      setState(s => (s.ipWhitelist.includes(ip) ? s : { ...s, ipWhitelist: [...s.ipWhitelist, ip] }));
    },

    removeWhitelistIp: (ip) => {
      setState(s => ({ ...s, ipWhitelist: s.ipWhitelist.filter(i => i !== ip) }));
    },

    upsertSettlement: (record) => {
      setState(s => {
        if (record.id) {
          return { ...s, settlements: s.settlements.map(r => r.id === record.id ? { ...r, ...record, id: r.id } : r) };
        }
        const created: SettlementRecord = { ...record, id: `s-${Date.now()}`, createdAt: new Date().toISOString() };
        return { ...s, settlements: [created, ...s.settlements] };
      });
    },

    deleteSettlement: (id) => {
      setState(s => ({ ...s, settlements: s.settlements.filter(r => r.id !== id) }));
    },

    upsertConsultation: (record) => {
      setState(s => {
        if (record.id) {
          return { ...s, consultations: s.consultations.map(r => r.id === record.id ? { ...r, ...record, id: r.id } : r) };
        }
        const created: ConsultationRecord = { ...record, id: `c-${Date.now()}`, createdAt: new Date().toISOString() };
        return { ...s, consultations: [created, ...s.consultations] };
      });
    },

    deleteConsultation: (id) => {
      setState(s => ({ ...s, consultations: s.consultations.filter(r => r.id !== id) }));
    },

    upsertParkingVehicle: (record) => {
      setState(s => {
        if (record.id) {
          return { ...s, parkingVehicles: s.parkingVehicles.map(r => r.id === record.id ? { ...r, ...record, id: r.id, updatedAt: new Date().toISOString() } : r) };
        }
        const created: ParkingVehicle = { ...record, id: `p-${Date.now()}`, updatedAt: new Date().toISOString() };
        return { ...s, parkingVehicles: [created, ...s.parkingVehicles] };
      });
    },

    deleteParkingVehicle: (id) => {
      setState(s => ({ ...s, parkingVehicles: s.parkingVehicles.filter(r => r.id !== id) }));
    },

    submitAttendanceRequest: ({ employeeId, date, kind, reason }) => {
      setState(s => {
        const req: AttendanceRequest = {
          id: `areq-${Date.now()}`,
          employeeId,
          date,
          kind,
          reason,
          status: 'pending',
          createdAt: new Date().toISOString(),
          reviewedAt: null,
          reviewNote: null,
        };
        const emp = s.employees.find(e => e.id === employeeId);
        return {
          ...s,
          attendanceRequests: [req, ...s.attendanceRequests],
          notifications: [
            {
              id: `n-${Date.now()}`,
              type: 'attendanceRequest',
              message: `${emp?.name ?? '직원'}님이 ${dayjs(date).format('M월 D일')} ${ATTENDANCE_REQUEST_KIND_LABEL[kind]}을 신청했습니다.`,
              employeeId,
              date,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ],
        };
      });
    },

    approveAttendanceRequest: (requestId, note) => {
      setState(s => ({
        ...s,
        attendanceRequests: s.attendanceRequests.map(r => r.id === requestId ? { ...r, status: 'approved', reviewedAt: new Date().toISOString(), reviewNote: note ?? null } : r),
      }));
    },

    rejectAttendanceRequest: (requestId, note) => {
      setState(s => ({
        ...s,
        attendanceRequests: s.attendanceRequests.map(r => r.id === requestId ? { ...r, status: 'rejected', reviewedAt: new Date().toISOString(), reviewNote: note } : r),
      }));
    },

    resetDemo: () => {
      setState(resetState());
    },
  }), [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
