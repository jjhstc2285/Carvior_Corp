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
    return { ipWhitelist: [], settlements: [], consultations: [], parkingVehicles: [], attendanceRequests: [], vehiclePosts: [], brokerageSettlements: [], purchaseSettlements: [], ...parsed } as AppState;
  } catch {
    const seeded = generateMockState();
    saveState(seeded);
    return seeded;
  }
}

// 사진(base64)까지 들어가면 브라우저 localStorage 한도(약 5MB)를 넘길 수 있어서 실패를 알려준다
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('저장 실패 — 브라우저 저장 공간 부족으로 보입니다.', e);
    return false;
  }
}

export function resetState(): AppState {
  const seeded = generateMockState();
  saveState(seeded);
  return seeded;
}
