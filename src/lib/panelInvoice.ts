import * as XLSX from 'xlsx';

/**
 * 판금 청구서를 넣을 수 있는 사람.
 *
 * 서버의 approvers.ts 와 같은 두 이름이다. 화면에서 가리는 건 단추를 숨기는 것뿐이고
 * 진짜 판단은 서버가 한다 — 화면만 가리면 요청을 직접 보낼 수 있다. 그래도 볼 수 없는
 * 단추를 띄워 두면 눌러보고 거절당하니 여기서도 같이 가린다.
 *
 * 이름이 바뀌면 여기와 서버 두 곳을 같이 고친다.
 */
export const PANEL_INVOICE_EDITORS = ['안원용', '테스트관리자'];

export function canEditPanelInvoice(name: string | null | undefined): boolean {
  return PANEL_INVOICE_EDITORS.includes((name ?? '').trim());
}

// ── 청구서 엑셀 읽기 ──────────────────────────────

/** 청구서에 적힌 칸 이름 — 시트마다 조금씩 다르게 적혀 와서 여러 이름을 받는다 */
const FIELD = {
  plate: ['차량번호', '차번호', '번호'],
  name: ['차명', '차종', '차량명'],
  count: ['판수', '판', '수량'],
  work: ['작업내용', '내용', '작업'],
  total: ['금액', '합계', '청구금액', '총액'],
  supply: ['공급가액', '공급가'],
  vat: ['세액', '부가세'],
} as const;

export interface PanelInvoiceRow {
  vehicleNumber: string;
  vehicleName: string;
  panelCount: number;
  work: string;
  amount: number;
}


export interface PanelInvoiceSheet {
  name: string;
  rows: PanelInvoiceRow[];
  total: number;
}

export interface PanelInvoiceRead {
  /** 청구서 꼴로 읽힌 시트들. 대산 파일은 거래처마다 한 장씩 130장이 넘는다 */
  sheets: PanelInvoiceSheet[];
  /** 처음 골라 둘 시트 — 내 이름과 같은 장이 있으면 그 장이다 */
  picked: string;
  /** 한 장도 못 읽었을 때 무엇을 봤는지. 화면에 그대로 띄워 어디가 어긋났는지 보이게 한다 */
  looked: { sheet: string; headers: string[] }[];
}

const norm = (v: unknown) => String(v ?? '').replace(/\s/g, '').trim();

export function invoiceNumber(v: unknown): number {
  if (typeof v === 'number') return Math.round(v);
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * 칸 이름이 조금 달라도 찾아낸다.
 *
 * 똑같이 적힌 것을 먼저 보고, 없으면 그 말이 들어간 칸을 본다 — "차량번호(뒤4자리)"
 * 처럼 괄호를 붙여 보내는 달이 있다.
 */
function columnOf(header: unknown[], names: readonly string[]): number {
  const cells = header.map(norm);
  for (const want of names) {
    const exact = cells.indexOf(want);
    if (exact >= 0) return exact;
  }
  for (const want of names) {
    const loose = cells.findIndex((c) => c.includes(want));
    if (loose >= 0) return loose;
  }
  return -1;
}

/** 한 장에서 줄을 읽어낸다. 머리줄을 못 찾으면 빈 손으로 돌아온다 */
function readSheet(sheet: XLSX.WorkSheet): { rows: PanelInvoiceRow[]; headers: string[] } {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });

  /*
    머리줄이 첫 줄에 있다고 보지 않는다.

    대산 청구서는 첫 줄이 거래처 이름이고 둘째 줄이 날짜·차명·차량번호다. 첫 줄만 보면
    칸 이름을 하나도 못 찾아 "읽을 줄이 없습니다"만 뜬다.
  */
  for (let i = 0; i < Math.min(grid.length, 30); i += 1) {
    const header = grid[i] ?? [];
    const plateCol = columnOf(header, FIELD.plate);
    const totalCol = columnOf(header, FIELD.total);
    const supplyCol = columnOf(header, FIELD.supply);
    if (plateCol < 0 || (totalCol < 0 && supplyCol < 0)) continue;

    const vatCol = columnOf(header, FIELD.vat);
    const nameCol = columnOf(header, FIELD.name);
    const countCol = columnOf(header, FIELD.count);
    const workCol = columnOf(header, FIELD.work);
    const at = (row: unknown[], col: number) => (col >= 0 ? row[col] : '');

    const rows = grid
      .slice(i + 1)
      .map((row) => ({
        vehicleNumber: String(at(row, plateCol) ?? '').trim(),
        vehicleName: String(at(row, nameCol) ?? '').trim(),
        panelCount: invoiceNumber(at(row, countCol)),
        work: String(at(row, workCol) ?? '').trim(),
        // 금액 칸이 비어 있으면 공급가 + 세액으로 낸다 — 합계를 안 적어 보내는 시트가 있다
        amount:
          invoiceNumber(at(row, totalCol)) || invoiceNumber(at(row, supplyCol)) + invoiceNumber(at(row, vatCol)),
      }))
      // 합계 줄과 빈 줄을 걷어낸다
      .filter((r) => r.vehicleNumber && r.amount > 0 && !/합계|소계|계$/.test(r.vehicleNumber));

    return { rows, headers: header.map((c) => String(c ?? '').trim()).filter(Boolean) };
  }

  const first = grid[0] ?? [];
  return { rows: [], headers: first.map((c) => String(c ?? '').trim()).filter(Boolean) };
}

/**
 * 청구서 엑셀에서 줄을 읽어낸다.
 *
 * 첫 장만 보지 않는다. 대산은 거래처마다 한 장씩 담아 백 장이 넘는 파일 하나를 보내는데,
 * 첫 장은 이름·금액만 적힌 집계표다. 줄이 나오는 장을 다 모아 두고 어느 장을 넣을지는
 * 사람이 고른다 — 아무 장이나 먼저 골라 넣으면 남의 거래처 판금비가 우리 차에 붙는다.
 *
 * 내 이름과 같은 장이 있으면 그 장을 먼저 띄운다.
 */
export function readPanelInvoice(book: XLSX.WorkBook, prefer?: string | null): PanelInvoiceRead {
  const sheets: PanelInvoiceSheet[] = [];
  const looked: { sheet: string; headers: string[] }[] = [];

  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const got = readSheet(sheet);
    if (got.rows.length > 0) {
      sheets.push({ name, rows: got.rows, total: got.rows.reduce((s, r) => s + r.amount, 0) });
    } else {
      looked.push({ sheet: name, headers: got.headers });
    }
  }

  const mine = norm(prefer ?? '');
  const picked = (mine && sheets.find((s) => norm(s.name) === mine)?.name) || sheets[0]?.name || '';

  return { sheets, picked, looked: sheets.length > 0 ? [] : looked.slice(0, 10) };
}
