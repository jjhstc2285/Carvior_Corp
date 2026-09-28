import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import type { WorkLog } from '../../types';

/**
 * 적은 업무일지를 그대로 엑셀로 내린다.
 *
 * 월말이면 각자 자기가 한 일을 정리해 올린다. 지금은 화면을 주 단위로 넘겨 가며 한 줄씩
 * 옮겨 적는데, 하루에 열 줄씩 스무 날이면 이백 줄을 손으로 옮기는 일이다. 옮기다 빠뜨리고,
 * 빠뜨린 건 안 한 일이 된다.
 *
 * 세거나 요약하지 않는다. 적은 그대로 — 날짜·요일·내용·완료 — 만 내린다. 각자 그 파일을
 * 받아서 자기 보고 형식에 맞춰 쓴다. 우리가 미리 모양을 잡아 두면 그 모양이 안 맞는
 * 사람은 다시 손을 대야 한다.
 */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export interface ExportOptions {
  logs: WorkLog[];
  /** 누구 것인지 — 파일 이름과 장 이름에 쓴다 */
  who: string;
  /** 어느 달인지 — YYYY-MM */
  month: string;
  /** 여러 사람 것이 섞였으면 이름 칸을 넣는다 */
  nameOf?: (employeeId: string) => string;
}

export function exportWorkLogs({ logs, who, month, nameOf }: ExportOptions): number {
  const sorted = [...logs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder,
  );

  const rows = sorted.map(log => {
    const d = dayjs(log.date);
    return {
      날짜: log.date,
      요일: WEEKDAY[d.day()],
      ...(nameOf ? { 이름: nameOf(log.employeeId) } : {}),
      내용: log.content,
      완료: log.done ? 'O' : '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);

  /*
    칸 너비를 잡아 둔다.

    내용 칸이 기본 너비면 '10시~12시 1186 차량 평동복원집에 입고, ks판집 차장님 픽업…'
    같은 줄이 ###로 잘려서, 받은 사람이 매번 칸을 늘리고 시작한다.
  */
  sheet['!cols'] = [
    { wch: 12 }, // 날짜
    { wch: 5 }, // 요일
    ...(nameOf ? [{ wch: 10 }] : []),
    { wch: 90 }, // 내용
    { wch: 6 }, // 완료
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, dayjs(month).format('YYYY년 M월'));
  XLSX.writeFile(wb, `업무일지_${who}_${dayjs(month).format('YYYYMM')}.xlsx`);

  return rows.length;
}
