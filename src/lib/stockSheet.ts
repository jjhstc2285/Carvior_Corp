import { CAPITAL_COMPANIES, repayRuleOf, suggestRepayDate } from './stockFinance';

/**
 * 재고차량 장부(구글 시트)를 읽는다.
 *
 * 사무실 장부는 월별로 "9월 재고차량 현황" 같은 제목 줄과 합계 줄이 섞여 있고, 칸 순서도
 * 달마다 조금씩 다르다. 그래서 줄을 통째로 믿지 않고, 각 줄에서 알아볼 수 있는 것만
 * 집어낸다 — 못 읽은 줄은 버리지 않고 왜 못 읽었는지 같이 돌려준다.
 *
 * 읽는 것: 차량번호 · 차명 · 연식 · 제시일 · 재고금액 · 여신사(할부사) · 상환일자
 * 안 읽는 것: NO · 담당자 · 제시금액 — 제시금액은 전산에 둘 자리가 없다(매입가는 매입 관리에서 온다).
 *
 * 상환일자는 장부에 적힌 날을 쓴다. 캐피탈사와 실제로 정한 날이라 규칙으로 낸 날과
 * 다른 차가 많다(139대 중 100대). 규칙은 새로 잡는 차에 쓰는 것이고, 이미 적어둔
 * 차까지 다시 계산해 덮으면 갚는 날이 바뀌어 버린다.
 * 장부에는 "09월 14일"처럼 연도가 없으니, 제시일자를 지나도록 해를 넘겨 맞춘다 —
 * 갚는 날이 제시한 날보다 앞설 수는 없다. 적힌 날이 없으면 그때만 규칙으로 낸다.
 *
 * 이전일자는 제시일자와 같은 날로 넣는다 — 장부에 따로 적는 칸이 없고, 사무장님이
 * 둘을 같게 맞춰 달라고 하셨다.
 */

const PLATE = /(\d{2,3}[가-힣]\d{4})/;

/** 2026.04.13 · 2026-04-13 · 2026/4/13 — 연도가 있는 날짜만 받는다 */
const FULL_DATE = /(20\d{2})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/;

/** "09월 14일" · "10/15연장" — 여신사 칸 뒤에 붙는 날짜 메모 */
const MONTH_DAY = /^\d{1,2}\s*[월/.\-]\s*\d{1,2}/;

/** 연도 없이 적힌 상환일 — "09월 14일" */
const MONTH_DAY_ONLY = /^(\d{1,2})\s*월\s*(\d{1,2})\s*일$/;

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
  /** 상환일자 — 장부에 적힌 날. 없으면 여신사 규칙으로 낸다 */
  repayDate: string | null;
  /** 장부에 적힌 날인가(아니면 규칙으로 낸 것) — 화면에서 구분해 보여준다 */
  repayFromSheet: boolean;
}

export interface StockSheetSkip {
  line: string;
  reason: string;
}

export interface StockSheetParse {
  rows: StockSheetRow[];
  skipped: StockSheetSkip[];
}

/**
 * 주소창에서 복사한 시트 주소를 CSV 주소로 바꾼다.
 *
 * 사람이 건네주는 건 언제나 .../edit?usp=sharing 꼴이다. 그걸 그대로 받으면 HTML이
 * 오고 한 줄도 못 읽는다. 문서 번호와 탭(gid)만 뽑아 다시 만든다.
 * 이미 export 주소면 그대로 둔다.
 */
export function toCsvUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  if (raw.includes('/export')) return raw;

  const id = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(raw)?.[1];
  if (!id) return raw;
  // 탭을 지정하지 않으면 첫 번째 탭을 읽는다
  const gid = /[#&?]gid=(\d+)/.exec(raw)?.[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
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

/**
 * 연도 없이 적힌 날("09월 14일")에 해를 붙인다.
 *
 * 갚는 날은 제시한 날보다 뒤다. 제시한 해로 먼저 맞춰 보고, 그게 제시일보다 앞서면
 * 다음 해로 넘긴다 — 1월·2월 칸이 이듬해인 것도 이 규칙으로 저절로 맞는다.
 */
export function withYearAfter(monthDay: string, after: string): string | null {
  const m = MONTH_DAY_ONLY.exec(monthDay.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year = Number(after.slice(0, 4));
  if (!year) return null;
  const same = `${year}-${pad(month)}-${pad(day)}`;
  return same >= after ? same : `${year + 1}-${pad(month)}-${pad(day)}`;
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

    /*
      여신사.

      오른쪽 끝에서 찾되, 아는 이름인 칸을 고른다. 장부에는 여신사 뒤에 "07월 06일",
      "10/15연장" 같은 칸이 더 붙어 있는 줄이 많아서, 그냥 맨 뒤 글자 칸을 집으면
      날짜를 여신사로 읽는다.
      아는 이름이 하나도 없으면 맨 뒤 칸을 그대로 들고 와 화면에 보여준다 —
      무엇을 못 알아봤는지는 보여야 고칠 수 있다.
    */
    const textCells = trimmed.filter(c => /[가-힣A-Za-z]/.test(c) && c !== vehicleModel && !NOISE.test(c));
    const capitalRaw =
      [...textCells].reverse().find(c => canonicalCapital(c)) ??
      [...textCells].reverse().find(c => !FULL_DATE.test(c) && !MONTH_DAY.test(c)) ??
      '';
    const stockCapital = canonicalCapital(capitalRaw);

    /*
      상환일자 — 장부에 적힌 날이 먼저다.

      여신사 뒤에도 "07월 06일" 같은 칸이 붙어 있어서, 앞에서부터 처음 나오는 것을 쓴다
      (장부는 상환일자를 여신사 앞에 적는다).
    */
    const writtenRepay = trimmed.map(c => withYearAfter(c, offerDate)).find((d): d is string => d !== null);
    const repayDate = writtenRepay ?? (stockCapital ? suggestRepayDate(stockCapital, offerDate) : null);

    rows.push({
      vehicleNumber,
      vehicleModel,
      modelYear,
      offerDate,
      stockAmount,
      stockCapital,
      capitalRaw: capitalRaw.trim(),
      repayDate,
      repayFromSheet: writtenRepay !== undefined,
    });
    seen.add(vehicleNumber);
  }

  return { rows, skipped };
}

/** 그대로 넣어도 되는 줄인가 — 여신사를 못 알아보면 상환일자를 못 내서 재고차량으로 안 넘어간다. */
export function isImportable(row: StockSheetRow): boolean {
  return Boolean(row.stockCapital) && Boolean(row.repayDate) && row.stockAmount > 0;
}
