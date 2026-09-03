// 구글 시트지의 주차장 구조를 그대로 옮긴 설정 — 구역도 화면이 이걸 보고 표를 그린다.
// 주차장이나 구역이 바뀌면 여기만 고치면 된다.
export interface ParkingLotConfig {
  lot: string;
  bandColor: string; // 상단 배너 배경색(시트지의 노랑/초록/자홍 배너 재현)
  zones: string[];
  /** 어느 건물·구역 묶음인지 — 화면에서 묶어 보여준다 */
  group: '본관' | '외부';
  /**
   * 한 구역에 몇 대를 겹쳐 대는지. 안 주면 본관 기본값(앞1·앞2·뒤1·뒤2)을 쓴다.
   *
   * 외부 주차장은 시트에서도 앞/뒤 구분 없이 줄만 늘어서 있고 줄 수도 제각각이라
   * (평동 3줄, 배양동 12줄) 주차장마다 따로 정한다.
   */
  slots?: string[];
}

/** 1행·2행 … N행 */
const rowSlots = (n: number): string[] => Array.from({ length: n }, (_, i) => `${i + 1}행`);

/** 1번·2번 … N번 */
const numberedZones = (n: number): string[] => Array.from({ length: n }, (_, i) => `${i + 1}번`);

/**
 * 한 구역 안에 차를 앞뒤로 겹쳐 대는 실제 주차장 관행을 반영 — 구역 하나당 앞/뒤로 각 2대까지.
 * 시트지도 구역마다 네 줄(앞 두 줄, 뒤 두 줄)로 되어 있다.
 */
export const PARKING_SLOTS = ['앞1', '앞2', '뒤1', '뒤2'] as const;

export const PARKING_LOTS: ParkingLotConfig[] = [
  // ── 본관 ──────────────────────────────
  {
    lot: 'B4F-B05',
    group: '본관',
    bandColor: '#facc15',
    zones: ['9구역', '10구역', '11구역', '12구역', '13구역', '14구역', '15구역', '16구역'],
  },
  {
    lot: 'B4F-B06',
    group: '본관',
    bandColor: '#4ade80',
    zones: ['17-1구역', '17-2구역', '18-1구역', '18-2구역', '19구역', '19-1구역', '19-2구역', '가로주차'],
  },
  {
    lot: '5F-B19',
    group: '본관',
    bandColor: '#f472b6',
    zones: ['A구역', 'B구역', 'C구역', 'D구역', 'E구역', 'F구역', 'G구역', 'H구역', 'I구역', 'J구역'],
  },
  {
    lot: 'B2F-B08',
    group: '본관',
    bandColor: '#60a5fa',
    zones: ['1구역', '2구역', '3구역', '4구역', '계단실'],
  },

  // ── 외부 ──────────────────────────────
  //
  // 시트지의 외부 주차장은 구역 이름이 없고 줄 수도 제각각이다(평동 3줄, 배양동 12줄).
  // 그래서 왼쪽부터 번호(1번·2번…), 위에서부터 줄(1행·2행…)로 잡았다.
  // 칸 수는 시트에 차가 들어차 있던 범위에 맞췄다 — 실제와 다르면 이 목록만 고치면 된다.
  //
  // 늘어놓는 순서는 '차량 외부 주차장 이동 우선순위'를 그대로 따른다. 배치도를 훑는 순서와
  // 차를 어디로 보낼지 정하는 순서가 같아야 한 화면에서 판단이 끝난다.
  { lot: '평동 20-23', group: '외부', bandColor: '#fdba74', zones: numberedZones(11), slots: rowSlots(3) },
  { lot: '고색동 218-1 (팬슬)', group: '외부', bandColor: '#d8b4fe', zones: numberedZones(7), slots: rowSlots(3) },
  // 4,000만원 이상 고가차를 따로 두는 곳. 다섯 대까지 들어간다.
  { lot: '배양동 창고', group: '외부', bandColor: '#fcd34d', zones: numberedZones(5), slots: rowSlots(1) },
  { lot: '배양동 58-13', group: '외부', bandColor: '#bef264', zones: numberedZones(7), slots: rowSlots(12) },
  // 고색동 A·B·C — A·B는 수출 전용, C는 일반광고 전용
  { lot: '고색동 213-4', group: '외부', bandColor: '#67e8f9', zones: numberedZones(8), slots: rowSlots(2) },
  { lot: '고색동 205-1', group: '외부', bandColor: '#a5b4fc', zones: numberedZones(3), slots: rowSlots(8) },
  { lot: '고색동 203-2', group: '외부', bandColor: '#fca5a5', zones: numberedZones(5), slots: rowSlots(5) },
];

/** 그 주차장이 쓰는 줄 목록 — 안 정해뒀으면 본관 기본값 */
export function slotsOf(lot: ParkingLotConfig): readonly string[] {
  return lot.slots ?? PARKING_SLOTS;
}

/** 화면 상단 묶음 탭 — 본관과 외부를 따로 본다(다 펼치면 표가 너무 길다). */
export const PARKING_GROUPS = ['본관', '외부'] as const;
export type ParkingGroup = (typeof PARKING_GROUPS)[number];
