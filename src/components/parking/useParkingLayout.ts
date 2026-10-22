import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PARKING_LOTS, toLayout, type ParkingLotConfig, type ServerLot } from '../../lib/parkingLayout';

/**
 * 주차장 구조를 서버에서 받아 온다.
 *
 * 코드에 박혀 있던 값이라 화면 여러 곳이 그걸 바로 가져다 썼다. 이제는 차량관리팀이
 * 고칠 수 있어야 하므로 받아 와서 쓴다 — 고친 순간 배치도·등록 창이 같이 따라간다.
 *
 * 못 받아오면 코드에 있던 구조를 그대로 쓴다. 주차 배치도가 통째로 빈 화면이 되는 것보다
 * 조금 지난 구조라도 보이는 쪽이 낫다.
 */
export interface ParkingLayout {
  lots: ParkingLotConfig[];
  /** 아직 받아오는 중인가 — 처음 한 번만 참이다 */
  loading: boolean;
  reload: () => Promise<void>;
}

export function useParkingLayout(): ParkingLayout {
  const [lots, setLots] = useState<ParkingLotConfig[]>(PARKING_LOTS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setLots(toLayout(await api<ServerLot[]>('/parking-layout')));
    } catch {
      // 못 받아오면 코드에 있던 구조로 그린다 — 빈 화면보다 낫다
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { lots, loading, reload };
}
