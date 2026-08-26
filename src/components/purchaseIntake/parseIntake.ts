import dayjs from 'dayjs';

/**
 * 카톡으로 주고받던 매입 인수 내역을 그대로 붙여넣으면 칸을 채워준다.
 *
 * 실제로 오가는 형식이 이렇다:
 *   ▶고객번호 : 010-3036-3333
 *   ▶고객이름 : 이동훈
 *   매입 - 아우디 평촌 류호성상조회장
 *   ▶날짜 : 26년 8월 25일
 *   ▶실차 확인자 : 검차업체(예나)
 *   ...
 *   ▶실매입금액 : 2750만원 + 구전 50만원 총 2800만원
 *
 * 못 알아본 줄은 그냥 넘긴다 — 파서가 완벽할 필요는 없고, 채워진 칸을 눈으로 확인한 뒤
 * 저장하는 흐름이다. 손으로 다시 치는 수고만 덜면 된다.
 */

export interface ParsedIntake {
  date?: string; // YYYY-MM-DD
  customerPhone?: string;
  customerName?: string;
  source?: string;
  inspector?: string;
  vehicleName?: string;
  vehicleNumber?: string;
  modelYear?: string;
  fuel?: string;
  keyCount?: number;
  mileage?: number;
  note?: string;
  purchaseAmount?: number;
  brokerFee?: number;
}

/** "▶고객이름 : 이동훈" → ["고객이름", "이동훈"] */
function splitLabel(line: string): [string, string] | null {
  const cleaned = line.replace(/^[\s▶▷►*·\-•]+/, '').trim();
  const at = cleaned.indexOf(':');
  if (at < 0) return null;
  // 라벨의 공백은 표기가 흔들려서("실차 확인자"/"실차확인자") 지우고 비교한다.
  return [cleaned.slice(0, at).replace(/\s+/g, ''), cleaned.slice(at + 1).trim()];
}

function digitsOf(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * "2750만원" → 27,500,000 / "27,500,000원" → 27,500,000
 * 만원 표기가 기본이라 '만'이 붙어 있으면 10,000을 곱한다.
 */
function toWon(value: string): number {
  const amount = digitsOf(value);
  if (!amount) return 0;
  return /만/.test(value) ? amount * 10_000 : amount;
}

/** "26년 8월 25일" / "2026-08-25" / "2026.8.25" 를 모두 받는다. */
function toDate(value: string): string | undefined {
  const korean = value.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) {
    const [, y, m, d] = korean;
    // 두 자리로 적으면 2000년대로 본다("26년" → 2026년).
    const year = y.length <= 2 ? 2000 + Number(y) : Number(y);
    return dayjs(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`).format('YYYY-MM-DD');
  }

  const numeric = value.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
  if (numeric) {
    const [, y, m, d] = numeric;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * 실매입금액 줄에서 매입가와 구전을 나눠 담는다.
 * "2750만원 + 구전 50만원 총 2800만원" → { purchaseAmount: 27500000, brokerFee: 500000 }
 * 총액은 읽지 않는다 — 저장하지 않고 두 값을 더해서 쓴다.
 */
function parseAmounts(value: string): { purchaseAmount: number; brokerFee?: number } {
  const broker = value.match(/구전[^\d]*([\d,]+\s*만?\s*원?)/);
  // 구전·총액 부분을 걷어낸 나머지에서 첫 금액을 매입가로 본다.
  const rest = value.replace(/구전[^+]*/g, '').replace(/총[^+]*/g, '');
  const first = rest.match(/([\d,]+\s*만?\s*원?)/);

  return {
    purchaseAmount: first ? toWon(first[1]) : toWon(value),
    ...(broker ? { brokerFee: toWon(broker[1]) } : {}),
  };
}

export function parseIntakeText(text: string): ParsedIntake {
  const result: ParsedIntake = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const pair = splitLabel(line);
    if (!pair) {
      // 라벨 없이 오는 매입처 줄 — "매입 - 아우디 평촌 류호성상조회장"
      const source = line.match(/^\s*매입\s*[-–—]\s*(.+)$/);
      if (source) result.source = source[1].trim();
      continue;
    }

    const [label, value] = pair;
    if (!value) continue;

    switch (label) {
      case '고객번호':
      case '연락처':
      case '전화번호':
        result.customerPhone = value;
        break;
      case '고객이름':
      case '고객명':
        result.customerName = value;
        break;
      case '매입':
      case '매입처':
        result.source = value;
        break;
      case '날짜':
      case '매입일':
        result.date = toDate(value);
        break;
      case '실차확인자':
      case '확인자':
        result.inspector = value;
        break;
      case '차명':
      case '차량명':
        result.vehicleName = value;
        break;
      case '차량번호':
        result.vehicleNumber = value.replace(/\s+/g, '');
        break;
      case '연식':
        // "2020년식" → "2020"
        result.modelYear = value.replace(/[^\d]/g, '').slice(0, 4);
        break;
      case '연료':
        result.fuel = value;
        break;
      case '차키갯수':
      case '차키개수':
      case '키갯수':
        result.keyCount = digitsOf(value);
        break;
      case '특이사항':
        result.note = value;
        break;
      case '주행거리':
        result.mileage = digitsOf(value);
        break;
      case '실매입금액':
      case '매입금액': {
        const amounts = parseAmounts(value);
        result.purchaseAmount = amounts.purchaseAmount;
        if (amounts.brokerFee !== undefined) result.brokerFee = amounts.brokerFee;
        break;
      }
      default:
        break;
    }
  }

  return result;
}
