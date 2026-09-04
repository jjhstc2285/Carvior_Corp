import { ConsultationKind } from '@prisma/client';

/**
 * 구글 시트 '알선 상담 정리' 를 앱이 쓰는 모양으로 바꾼다.
 *
 * 한 번 옮겨오기 위한 코드다 — 옮긴 뒤에는 앱이 정답이고 시트는 보지 않는다.
 * 다만 시트에 계속 쌓이는 동안에는 여러 번 돌릴 수 있어야 해서, 원래 번호(sourceId)로
 * 이미 넣은 건은 건너뛴다.
 *
 * 시트 한 줄의 생김새:
 *   번호 | 제목 | 상담일자 | 차량명 | 차량번호 | 광고 플랫폼 | 고객 연락처 | 상담자 | 상담내용 | 등록자 | 등록일
 */

/** 0부터 세는 열 번호 */
const COL = {
  no: 1,
  date: 3,
  vehicleName: 4,
  vehicleNumber: 5,
  platform: 6,
  phone: 7,
  counselor: 8,
  content: 9,
} as const;

export interface ParsedConsultation {
  sourceId: string;
  kind: ConsultationKind;
  date: string; // YYYY-MM-DD
  vehicleNumber: string;
  vehicleName: string;
  platform: string;
  customerPhone: string;
  /** 시트에 적힌 상담자 이름 — 직원과 맞춰 본다 */
  counselor: string;
  content: string;
}

export interface SheetParseResult {
  items: ParsedConsultation[];
  skipped: { no: string; reason: string }[];
}

/** 따옴표 있는 CSV — 상담내용에 줄바꿈과 쉼표가 들어 있다. */
function parseCsv(text: string): string[][] {
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

/**
 * 내수인가 수출인가.
 *
 * 요즘 줄은 "수출-차량 문의" 처럼 앞에 붙여 적는다. 예전 줄은 그런 규칙 없이 적혀 있어
 * 문장 안에 '수출'이 들어가면 수출로 본다("가격 네고 문의 -수출").
 * 아무 말도 없으면 알선(내수)이다 — 이 시트가 '알선 상담 정리'다.
 */
function classify(content: string): ConsultationKind {
  const text = content.trim();
  if (/^\s*수출/.test(text)) return ConsultationKind.EXPORT;
  if (/^\s*내수/.test(text)) return ConsultationKind.BROKERAGE;
  return text.includes('수출') ? ConsultationKind.EXPORT : ConsultationKind.BROKERAGE;
}

/**
 * "2026.08.31" → "2026-08-31".
 * 시트가 점으로 적는다. 다른 꼴이 오면 건너뛴다 — 날짜를 짐작해 넣으면 목록 순서가 어긋난다.
 */
function toDate(text: string): string | null {
  const m = text.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * 연락처.
 *
 * 시트가 숫자로 읽어서 앞의 0이 잘려 있다 — "1033660800" 은 010-3366-0800 이다.
 * 열 자리면서 1로 시작하면 0을 되붙인다. 그 밖의 꼴은 적힌 그대로 둔다(잘못 고치면
 * 손님한테 다른 번호로 전화한다).
 */
export function normalizePhone(text: string): string {
  const raw = text.trim();
  if (!raw) return '';

  const digits = raw.replace(/[^\d]/g, '');
  const full = digits.length === 10 && digits.startsWith('1') ? `0${digits}` : digits;

  if (full.length === 11 && full.startsWith('01')) {
    return `${full.slice(0, 3)}-${full.slice(3, 7)}-${full.slice(7)}`;
  }
  if (full.length === 10 && full.startsWith('0')) {
    return `${full.slice(0, 3)}-${full.slice(3, 6)}-${full.slice(6)}`;
  }
  return raw;
}

export function parseConsultationSheet(csv: string): SheetParseResult {
  const items: ParsedConsultation[] = [];
  const skipped: { no: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const row of parseCsv(csv)) {
    const at = (i: number) => (row[i] ?? '').trim();
    const no = at(COL.no);

    // 머리글·빈 줄·구분선을 거른다. 번호가 숫자인 줄만 상담이다.
    if (!/^\d+$/.test(no)) continue;
    if (seen.has(no)) {
      skipped.push({ no, reason: '시트에 같은 번호가 두 번 있습니다' });
      continue;
    }
    seen.add(no);

    const date = toDate(at(COL.date));
    if (!date) {
      skipped.push({ no, reason: `상담일자를 읽지 못했습니다 (${at(COL.date) || '빈칸'})` });
      continue;
    }

    const content = at(COL.content);
    items.push({
      sourceId: no,
      kind: classify(content),
      date,
      vehicleNumber: at(COL.vehicleNumber).slice(0, 30),
      vehicleName: at(COL.vehicleName).slice(0, 60),
      platform: at(COL.platform).slice(0, 30),
      customerPhone: normalizePhone(at(COL.phone)).slice(0, 20),
      counselor: at(COL.counselor),
      content,
    });
  }

  return { items, skipped };
}
