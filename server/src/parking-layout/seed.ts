/**
 * 처음 한 번 넣는 주차장 구조 — 코드에 박혀 있던 그대로다.
 *
 * 표가 비어 있을 때만 넣는다. 그 뒤로는 화면에서 고치고, 여기는 안 본다 —
 * 두 곳에서 고치면 어느 쪽이 맞는지 알 수 없게 된다.
 */

export interface SeedLot {
  lot: string;
  label?: string;
  area: '본관' | '외부';
  bandColor: string;
  zones: string[];
  /** 안 주면 본관 기본값(앞1·앞2·뒤1·뒤2) */
  slots?: string[];
}

/** 1행·2행 … N행 */
const rows = (n: number): string[] => Array.from({ length: n }, (_, i) => `${i + 1}행`);

/** 1번·2번 … N번 */
const cols = (n: number): string[] => Array.from({ length: n }, (_, i) => `${i + 1}번`);

export const SEED_PARKING_LOTS: SeedLot[] = [
  // ── 본관 ──────────────────────────────
  {
    lot: 'B4F-B05',
    area: '본관',
    bandColor: '#facc15',
    zones: ['9구역', '10구역', '11구역', '12구역', '13구역', '14구역', '15구역', '16구역'],
  },
  {
    lot: 'B4F-B06',
    area: '본관',
    bandColor: '#4ade80',
    zones: ['17-1구역', '17-2구역', '18-1구역', '18-2구역', '19구역', '19-1구역', '19-2구역', '가로주차'],
  },
  {
    lot: '5F-B19',
    area: '본관',
    bandColor: '#f472b6',
    zones: ['A구역', 'B구역', 'C구역', 'D구역', 'E구역', 'F구역', 'G구역', 'H구역', 'I구역', 'J구역'],
  },
  {
    lot: 'B2F-B08',
    area: '본관',
    bandColor: '#60a5fa',
    zones: ['1구역', '2구역', '3구역', '4구역', '계단실'],
  },

  // ── 외부 ──────────────────────────────
  //
  // 늘어놓는 순서는 '차량 외부 주차장 이동 우선순위'를 그대로 따른다. 배치도를 훑는
  // 순서와 차를 어디로 보낼지 정하는 순서가 같아야 한 화면에서 판단이 끝난다.
  { lot: '평동 20-23', area: '외부', bandColor: '#fdba74', zones: cols(11), slots: rows(3) },
  { lot: '고색동 218-1 (팬슬)', area: '외부', bandColor: '#d8b4fe', zones: cols(7), slots: rows(3) },
  // 4,000만원 이상 고가차를 따로 두는 곳. 다섯 대까지 들어간다.
  { lot: '배양동 창고', area: '외부', bandColor: '#fcd34d', zones: cols(5), slots: rows(1) },
  { lot: '배양동 58-13', area: '외부', bandColor: '#bef264', zones: cols(7), slots: rows(12) },
  // 고색동 A·B·C — A·B는 수출 전용, C는 일반광고 전용
  { lot: '고색동 213-4', label: '고색동 213-4/A주차장', area: '외부', bandColor: '#67e8f9', zones: cols(8), slots: rows(2) },
  { lot: '고색동 205-1', label: '고색동 205-1/B주차장', area: '외부', bandColor: '#a5b4fc', zones: cols(3), slots: rows(9) },
  { lot: '고색동 203-2', label: '고색동 203-2/C주차장', area: '외부', bandColor: '#fca5a5', zones: cols(5), slots: rows(5) },
];
