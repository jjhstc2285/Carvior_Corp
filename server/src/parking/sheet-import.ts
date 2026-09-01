import { isValidPlate, normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 구글 시트지의 주차 배치를 읽어 앱이 쓰는 모양으로 바꾼다.
 *
 * 한 번 옮겨오기 위한 코드다 — 옮긴 뒤에는 앱이 정답이고 시트는 보지 않는다.
 * 그래서 시트 구조를 일반화하지 않고, 지금 시트에 있는 그대로를 좌표로 박아둔다.
 * 시트가 바뀌면 이 표를 고치는 게 추측으로 파싱하는 것보다 안전하다.
 *
 * 시트 한 덩어리의 생김새:
 *   행 N     : 주차장 이름 (B4F-B05 …)
 *   행 N+1   : 구역 이름  (9구역, 10구역 …)
 *   행 N+2   : 앞1        ← 이후 두 줄 간격으로 앞2 / 뒤1 / 뒤2
 *   행 N+3   : 그 줄의 메모(3시, 재검, 외부 고색 …)
 */

/** 0부터 세는 행/열 번호. 시트를 CSV로 받은 그대로의 좌표다. */
interface SheetBlock {
  lot: string;
  /** 구역 이름이 적힌 행 */
  zoneRow: number;
  /** 그 행에서 구역이 차지하는 열 범위(끝 포함) */
  fromCol: number;
  toCol: number;
  /** 앞1 · 앞2 · 뒤1 · 뒤2 가 적힌 행 네 개 */
  slotRows: [number, number, number, number];
}

const SLOT_NAMES = ['앞1', '앞2', '뒤1', '뒤2'] as const;

/**
 * 외부 주차장.
 *
 * 본관과 달리 구역 이름 행이 없고 줄 수도 제각각이다(평동 3줄, 배양동 12줄).
 * 그래서 시트의 열을 왼쪽부터 1번·2번…, 행을 위에서부터 1행·2행…으로 잡는다.
 * 시트에 적힌 순서가 곧 실제 배치라 자리 뜻이 어긋나지는 않지만, 이름은 우리가 붙인 것이다.
 */
interface ExternalBlock {
  lot: string;
  /** 차량번호가 적힌 행들 — 위에서부터 1행·2행… 이 된다 */
  rows: number[];
  /** 그 행에서 차가 놓인 열 범위(끝 포함) — 왼쪽부터 1번·2번… 이 된다 */
  fromCol: number;
  toCol: number;
}

const EXTERNAL_BLOCKS: ExternalBlock[] = [
  { lot: '평동 20-23', rows: [41, 43, 45], fromCol: 1, toCol: 11 },
  { lot: '고색동 218-1 (팬슬)', rows: [53, 55, 57], fromCol: 2, toCol: 8 },
  { lot: '고색동 205-1', rows: [77, 79, 81, 83, 85, 87, 89, 91], fromCol: 2, toCol: 4 },
  { lot: '고색동 213-4', rows: [75, 77], fromCol: 7, toCol: 14 },
  { lot: '고색동 203-2', rows: [64, 66, 68, 70, 72], fromCol: 12, toCol: 16 },
  {
    lot: '배양동 58-13',
    rows: [103, 105, 107, 109, 111, 113, 115, 117, 121, 123, 125, 127],
    fromCol: 7,
    toCol: 13,
  },
];

/** 본관 — 구역 이름 행이 있고 앞/뒤 네 줄로 반듯하게 짜여 있다. */
const BLOCKS: SheetBlock[] = [
  { lot: 'B4F-B05', zoneRow: 4, fromCol: 1, toCol: 8, slotRows: [5, 7, 9, 11] },
  { lot: 'B4F-B06', zoneRow: 4, fromCol: 9, toCol: 16, slotRows: [5, 7, 9, 11] },
  { lot: '5F-B19', zoneRow: 15, fromCol: 1, toCol: 10, slotRows: [16, 18, 20, 22] },
  { lot: 'B2F-B08', zoneRow: 28, fromCol: 1, toCol: 5, slotRows: [29, 31, 33, 35] },
];

export interface ParsedSpot {
  lot: string;
  zone: string;
  slot: string;
  vehicleNumber: string;
  /** 차량번호 아래 줄에 적혀 있던 말 — 비고로 옮긴다 */
  memo: string;
}

export interface SkippedCell {
  where: string;
  value: string;
  reason: string;
}

export interface SheetParseResult {
  spots: ParsedSpot[];
  skipped: SkippedCell[];
}

/** 따옴표 없는 단순 CSV — 구글 시트 export 는 값에 쉼표가 있을 때만 따옴표를 쓴다. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const at = (rows: string[][], r: number, c: number) => (rows[r]?.[c] ?? '').trim();

/**
 * 시트 전체를 훑어 차량번호를 모은다.
 *
 * 자리 배치와 달리 어느 칸에 있든 상관없다 — 외부 주차장이든 메모 옆이든,
 * 차량번호 꼴이면 우리가 들고 있는 차다. 차량관리에 올려두면 주유·수리비를 붙이고
 * 상담·정산에서 차량번호로 찾을 수 있다.
 */
export function collectPlates(csv: string): string[] {
  const seen = new Set<string>();
  for (const row of parseCsv(csv)) {
    for (const cell of row) {
      const plate = normalizePlate(cell.trim());
      if (isValidPlate(plate)) seen.add(plate);
    }
  }
  return [...seen];
}

export function parseParkingSheet(csv: string): SheetParseResult {
  const rows = parseCsv(csv);
  const spots: ParsedSpot[] = [];
  const skipped: SkippedCell[] = [];
  // 같은 차가 시트 여러 곳에 적혀 있는 경우가 있다(옮기고 지우지 않은 자리). 처음 것만 쓴다.
  const seen = new Map<string, string>();

  for (const block of BLOCKS) {
    for (let col = block.fromCol; col <= block.toCol; col += 1) {
      const zone = at(rows, block.zoneRow, col);
      if (!zone) continue;

      block.slotRows.forEach((slotRow, i) => {
        const raw = at(rows, slotRow, col);
        if (!raw) return;

        const where = `${block.lot} ${zone} ${SLOT_NAMES[i]}`;
        const plate = normalizePlate(raw);

        // 차량번호 칸에 '재검', '도로', '입구' 같은 말이 적혀 있기도 하다.
        if (!isValidPlate(plate)) {
          skipped.push({ where, value: raw, reason: '차량번호가 아닙니다' });
          return;
        }
        const already = seen.get(plate);
        if (already) {
          skipped.push({ where, value: plate, reason: `이미 ${already}에 있습니다` });
          return;
        }
        seen.set(plate, where);

        spots.push({
          lot: block.lot,
          zone,
          slot: SLOT_NAMES[i],
          vehicleNumber: plate,
          // 바로 아랫줄이 그 자리의 메모다.
          memo: at(rows, slotRow + 1, col),
        });
      });
    }
  }

  // ── 외부 주차장 ──
  for (const block of EXTERNAL_BLOCKS) {
    block.rows.forEach((row, rowIndex) => {
      for (let col = block.fromCol; col <= block.toCol; col += 1) {
        const raw = at(rows, row, col);
        if (!raw) continue;

        const zone = `${col - block.fromCol + 1}번`;
        const slot = `${rowIndex + 1}행`;
        const where = `${block.lot} ${zone} ${slot}`;
        const plate = normalizePlate(raw);

        // 외부 칸에는 '도로', '입구', '집안 가로라인' 같은 표시가 섞여 있다.
        if (!isValidPlate(plate)) {
          skipped.push({ where, value: raw, reason: '차량번호가 아닙니다' });
          continue;
        }
        const already = seen.get(plate);
        if (already) {
          skipped.push({ where, value: plate, reason: `이미 ${already}에 있습니다` });
          continue;
        }
        seen.set(plate, where);

        spots.push({ lot: block.lot, zone, slot, vehicleNumber: plate, memo: at(rows, row + 1, col) });
      }
    });
  }

  return { spots, skipped };
}
