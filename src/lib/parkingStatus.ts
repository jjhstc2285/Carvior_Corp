import type { ParkingStatus } from '../types';

/**
 * 주차 상태별 색.
 *
 * 구역도는 백 칸이 넘게 늘어서 있어서 한눈에 훑는 화면이다. 예전에는 차가 있는 칸이
 * 전부 같은 주황색이고 상태는 작은 점 하나로만 구분했는데, 그 점을 보려면 칸마다
 * 눈을 대야 했다. 칸 배경 자체를 상태 색으로 칠해 멀리서도 갈라 보이게 한다.
 *
 * 한 곳에 모아둔 이유: 구역도·목록·등록창이 같은 색을 써야 하는데 각자 들고 있으면
 * 하나만 고쳐놓고 나머지를 잊는다.
 */
export interface ParkingStatusStyle {
  /** 구역도 칸 배경 */
  cell: string;
  /** 차량번호 앞 점 */
  dot: string;
  /** 목록의 알약 뱃지 */
  pill: string;
}

export const PARKING_STATUS_STYLE: Record<ParkingStatus, ParkingStatusStyle> = {
  DISPLAY: {
    cell: 'bg-sky-50 text-slate-800 hover:bg-sky-100',
    dot: 'bg-sky-500',
    pill: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  },
  RESERVED: {
    // 출고대기 — 나갈 준비가 끝난 차. 초록.
    cell: 'bg-emerald-100 text-emerald-950 hover:bg-emerald-200',
    dot: 'bg-emerald-600',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  SOLD: {
    // 엔카 진단예정 — 손대면 안 되는 차라 제일 눈에 띄어야 한다. 빨강.
    cell: 'bg-red-100 text-red-950 hover:bg-red-200',
    dot: 'bg-red-600',
    pill: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  MOVING: {
    cell: 'bg-slate-200 text-slate-700 hover:bg-slate-300',
    dot: 'bg-slate-500',
    pill: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  },
  REPAIR: {
    // 카모두수정 — 수정 들어간 차는 자리에 있어도 손대면 안 된다. 진한 민트.
    cell: 'bg-teal-300 text-teal-950 hover:bg-teal-400',
    dot: 'bg-teal-700',
    pill: 'bg-teal-100 text-teal-800 ring-teal-700/20',
  },
};
