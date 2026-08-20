import type { AppState } from '../types';
import { generateMockState } from './mockData';

const STORAGE_KEY = 'attendance-app-state-v1';

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = generateMockState();
    saveState(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // 이전 버전 localStorage 데이터엔 새로 추가된 필드가 없을 수 있음 — 마이그레이션 기본값
    return { ipWhitelist: [], settlements: [], consultations: [], parkingVehicles: [], attendanceRequests: [], ...parsed } as AppState;
  } catch {
    const seeded = generateMockState();
    saveState(seeded);
    return seeded;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): AppState {
  const seeded = generateMockState();
  saveState(seeded);
  return seeded;
}
