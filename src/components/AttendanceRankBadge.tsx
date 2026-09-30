import { RANK_MARK, type AttendanceRankRow } from '../lib/attendanceRank';

/**
 * 출퇴근 성실도 표 — 이름 옆에 붙는다.
 *
 * 3등까지 왕관·은·동을 달고, 등수에는 못 들었어도 한 번도 안 늦고 안 빠졌으면 개근을 단다.
 * 스무 명 중 셋만 표를 받으면 나머지는 볼 일이 없는데, 개근은 누구나 받을 수 있다 —
 * 순위는 하나뿐이지만 성실은 여럿일 수 있다.
 *
 * 붙을 게 없으면 아무것도 그리지 않는다.
 */
export default function AttendanceRankBadge({
  row,
  size = 'sm',
}: {
  row?: AttendanceRankRow | null;
  size?: 'sm' | 'md';
}) {
  if (!row) return null;

  const mark = RANK_MARK[row.rank];
  const pad = size === 'sm' ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-[11px]';
  const detail = `${row.normal}일 정상 · 지각 ${row.late} · 조퇴 ${row.earlyLeave} · 누락 ${row.missing}`;

  if (mark) {
    return (
      <span className={`shrink-0 rounded font-bold ${mark.className} ${pad}`} title={`출퇴근 ${mark.label} — ${detail}`}>
        {mark.emoji} {mark.label}
      </span>
    );
  }

  if (row.perfect) {
    return (
      <span
        className={`shrink-0 rounded bg-emerald-100 font-bold text-emerald-700 ${pad}`}
        title={`개근 — ${detail}`}
      >
        ⭐ 개근
      </span>
    );
  }

  return null;
}
