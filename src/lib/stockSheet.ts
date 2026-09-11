import { CAPITAL_COMPANIES, repayRuleOf, suggestRepayDate } from './stockFinance';

/**
 * 재고차량 장부(구글 시트)를 읽는다.
 *
 * 사무실 장부는 월별로 "9월 재고차량 현황" 같은 제목 줄과 합계 줄이 섞여 있고, 칸 순서도
 * 달마다 조금씩 다르다. 그래서 줄을 통째로 믿지 않고, 각 줄에서 알아볼 수 있는 것만
 * 집어낸다 — 못 읽은 줄은 버리지 않고 왜 못 읽었는지 같이 돌려준다.
 *
 * 읽는 것: 차량번호 · 차명 · 연식 · 제시일 · 재고금액 · 여신사(할부사)
 * 안 읽는 것: NO · 담당자 · 제시금액 · 장부에 적힌 상환일자
 *   - 제시금액은 전산에 둘 자리가 없다(매입가는 매입 관리에서 온다).
 *   - 상환일자는 여신사와 제시일자로 다시 낸다. 장부에는 "09월 14일"처럼 연도가 없는
 *     칸이 많고, 규칙이 바뀌면(KB가 석 달 → 다섯 달) 옛 날짜가 그대로 남기 때문이다.
 *
 * 이전일자는 제시일자와 같은 날로 넣는다 — 장부에 따로 적는 칸이 없고, 사무장님이
 * 둘을 같게 맞춰 달라고 하셨다.
 */

const PLATE = /(\d{2,3}[가-힣]\d{4})/;

/** 2026.04.13 · 2026-04-13 · 2026/4/13 — 연도가 있는 날짜만 받는다 */
const FULL_DATE = /(20\d{2})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/;

/** 장부의 제목·합계·머리글 줄 — 차가 아니라서 조용히 넘긴다 */
const NOISE = /(현황|상환금액|합계|기준|소계|차량번호|담당자|여신사)/;

const pad = (n: number) => String(n).padStart(2, '0');

export interface StockSheetRow {
  vehicleNumber: string;
  vehicleModel: string;
  modelYear: string;
  /** 제시일자 — 이전일자도 같은 날로 넣는다 */
  offerDate: string;
  stockAmount: number;
  /** 시트에 적힌 여신사를 전산에서 쓰는 이름으로 맞춘 것 */
  stockCapital: string;
  /** 시트에 적힌 그대로 — 못 알아본 이름을 화면에 보여주려고 남긴다 */
  capitalRaw: string;
  /** 여신사 규칙으로 낸 상환일자. 모르는 여신사면 null */
  repayDate: string | null;
}

export interface StockSheetSkip {
  line: string;
  reason: string;
}

export interface StockSheetParse {
  rows: StockSheetRow[];
  skipped: StockSheetSkip[];
}

/** 따옴표 있는 CSV — 금액의 쉼표("8,000,000")가 칸을 가르지 않게 한다. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** "8,000,000" · "₩8,000,000" → 8000000 */
function moneyOf(cell: string): number {
  const digits = cell.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function dateOf(cell: string): string | null {
  const m = FULL_DATE.exec(cell);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${pad(month)}-${pad(day)}`;
}

/**
 * 시트에 적힌 여신사를 전산에서 쓰는 이름으로 맞춘다.
 *
 * 장부에는 '우리', 'KB', '알페라'처럼 줄여 적는다. 상환일자를 내는 규칙이 이름을
 * 통째로 견주지 않고 들어 있는 말로 찾으므로, 그 규칙을 그대로 써서 맞춘다.
 */
export function canonicalCapital(raw: string): string {
  const rule = repayRuleOf(raw);
  if (rule) return rule.label;
  // 규칙에 없는 이름이라도 목록에 그대로 있으면 그 이름을 쓴다
  const exact = CAPITAL_COMPANIES.find(c => c === raw.trim());
  return exact ?? '';
}

/**
 * 붙여넣거나 받아온 장부를 읽는다.
 *
 * 칸 순서를 못 박지 않는다 — 차량번호가 있는 칸을 찾고, 나머지는 생김새로 가린다.
 * 달마다 칸이 하나씩 밀려 있어도 읽히게 하려는 것이다.
 */
export function parseStockSheet(csv: string): StockSheetParse {
  const rows: StockSheetRow[] = [];
  const skipped: StockSheetSkip[] = [];
  const seen = new Set<string>();

  for (const cells of parseCsv(csv)) {
    const trimmed = cells.map(c => c.trim());
    const line = trimmed.filter(Boolean).join(' ');
    if (!line) continue;

    const plate = PLATE.exec(line.replace(/\s+/g, ''));
    if (!plate) {
      if (!NOISE.test(line)) skipped.push({ line, reason: '차량번호를 못 찾았습니다' });
      continue;
    }
    const vehicleNumber = plate[1];
    if (seen.has(vehicleNumber)) {
      skipped.push({ line, reason: '같은 차량번호가 위에 또 있습니다' });
      continue;
    }

    const plateAt = trimmed.findIndex(c => c.replace(/\s+/g, '').includes(vehicleNumber));

    // 차명 — 차량번호 다음 칸부터 처음 나오는 '글자가 든' 칸
    const vehicleModel = trimmed.slice(plateAt + 1).find(c => c && !/^[\d,.\s]+$/.test(c) && !FULL_DATE.test(c)) ?? '';
    if (!vehicleModel) {
      skipped.push({ line, reason: '차명을 못 찾았습니다' });
      continue;
    }

    // 제시일자 — 줄에서 처음 나오는 온전한 날짜
    const offerDate = trimmed.map(dateOf).find((d): d is string => d !== null);
    if (!offerDate) {
      skipped.push({ line, reason: '제시일(연·월·일)을 못 찾았습니다' });
      continue;
    }

    // 재고금액 — 백만원이 넘는 금액 칸 중 마지막. 장부는 제시금액 다음에 재고금액이 온다.
    const amounts = trimmed.filter(c => /^[\d,]+$/.test(c)).map(moneyOf).filter(n => n >= 1_000_000);
    const stockAmount = amounts.length > 0 ? amounts[amounts.length - 1] : 0;
    if (stockAmount <= 0) {
      skipped.push({ line, reason: '재고금액을 못 찾았습니다' });
      continue;
    }

    // 연식 — 칸 하나가 네 자리 연도뿐일 때만 본다(금액과 헷갈리지 않게)
    const modelYear = trimmed.find(c => /^(19|20)\d{2}$/.test(c)) ?? '';

    // 여신사 — 장부는 오른쪽 끝에 적으니 뒤에서부터 찾는다
    const capitalRaw =
      [...trimmed].reverse().find(c => /[가-힣A-Za-z]/.test(c) && c !== vehicleModel && !FULL_DATE.test(c) && !NOISE.test(c)) ?? '';
    const stockCapital = canonicalCapital(capitalRaw);

    rows.push({
      vehicleNumber,
      vehicleModel,
      modelYear,
      offerDate,
      stockAmount,
      stockCapital,
      capitalRaw: capitalRaw.trim(),
      // 이전일자(=제시일자)부터 여신사 규칙대로 센다
      repayDate: stockCapital ? suggestRepayDate(stockCapital, offerDate) : null,
    });
    seen.add(vehicleNumber);
  }

  return { rows, skipped };
}

/** 그대로 넣어도 되는 줄인가 — 여신사를 못 알아보면 상환일자를 못 내서 재고차량으로 안 넘어간다. */
export function isImportable(row: StockSheetRow): boolean {
  return Boolean(row.stockCapital) && Boolean(row.repayDate) && row.stockAmount > 0;
}
