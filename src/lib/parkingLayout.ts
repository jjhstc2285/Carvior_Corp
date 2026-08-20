// 엑셀 시트지의 주차장 구조를 그대로 옮긴 설정 — 그리드 화면(구역 컬럼)과 목업 데이터 생성이
// 같은 소스를 쓰도록 여기 한 곳에 모아둔다. 실제 운영 시 주차장/구역이 바뀌면 여기만 고치면 됨.
export interface ParkingLotConfig {
  lot: string;
  bandColor: string; // 상단 배너 배경색(엑셀 시트지의 노랑/초록/자홍 배너 재현)
  zones: string[];
}

export const PARKING_LOTS: ParkingLotConfig[] = [
  {
    lot: 'B4F-B05',
    bandColor: '#facc15',
    zones: ['9구역', '10구역', '11구역', '12구역', '13구역', '14구역', '15구역', '16구역'],
  },
  {
    lot: 'B4F-B06',
    bandColor: '#4ade80',
    zones: ['17-1구역', '17-2구역', '18-1구역', '18-2구역', '19구역', '19-1구역', '19-2구역', '가로주차'],
  },
  {
    lot: '5F-B19',
    bandColor: '#f472b6',
    zones: ['A구역', 'B구역', 'C구역', 'D구역', 'E구역', 'F구역', 'G구역', 'H구역', 'I구역', 'J구역'],
  },
];

// 한 구역 안에 차를 앞뒤로 겹쳐 대는 실제 주차장 관행을 반영 — 구역(칸) 하나당 앞/뒤로 각 2대까지
export const PARKING_SLOTS = ['앞1', '앞2', '뒤1', '뒤2'] as const;
