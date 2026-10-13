/** 경조사 구분 — 화면과 폼이 같은 목록을 쓴다 */
export type CondolenceKind = 'FUNERAL' | 'WEDDING' | 'HOLIDAY' | 'ETC';

export const KINDS: CondolenceKind[] = ['FUNERAL', 'WEDDING', 'HOLIDAY', 'ETC'];

export const KIND_LABEL: Record<CondolenceKind, string> = {
  FUNERAL: '장례',
  WEDDING: '결혼',
  HOLIDAY: '명절',
  ETC: '기타',
};

export const KIND_STYLE: Record<CondolenceKind, string> = {
  FUNERAL: 'bg-slate-100 text-slate-700',
  WEDDING: 'bg-rose-50 text-rose-700',
  HOLIDAY: 'bg-amber-50 text-amber-700',
  ETC: 'bg-sky-50 text-sky-700',
};

/**
 * 당사자와의 관계 — 부고·청첩장에 적힌 그대로 고른다.
 *
 * 자유 입력도 되게 두지만 고를 수 있으면 표기가 갈리지 않는다("모친" / "어머님" /
 * "어머니"가 섞이면 나중에 세지 못한다).
 */
export const SUBJECTS = ['본인', '부친', '모친', '배우자', '자녀', '형제', '자매', '장인', '장모'] as const;

/** 늘 얹는 화환값 — 다를 수 있어 고칠 수 있게 둔다 */
export const DEFAULT_WREATH = 45_000;

export interface Condolence {
  id: string;
  kind: CondolenceKind;
  person: string;
  relation: string;
  /** 연락처 — 받은 쪽은 나중에 갚는다. 그때 연락할 번호를 대장에 남겨 둔다 */
  phone: string;
  subject: string;
  eventOn: string;
  amount: number;
  wreath: boolean;
  wreathPrice: number;
  place: string;
  memo: string;
  recordedBy: string;
}

/**
 * 자주 내는 금액 — 눌러서 넣는다.
 *
 * 20만원을 치려고 0을 다섯 번 누르면 하나 더 치거나 덜 치기 쉽다. 경조사비는 몇 가지
 * 금액으로 거의 정해져 있어서 눌러 넣는 쪽이 빠르고 덜 틀린다.
 */
export const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 300_000, 500_000];

/**
 * 손으로 친 날짜를 읽는다 — '10/13', '26-10-13', '20261013', '1013'.
 *
 * 달력을 띄워 고르는 건 한 해 전 날짜로 갈 때 품이 많이 든다. 치는 대로 읽어 주고,
 * 읽은 날짜를 옆에 적어 보여 준다 — 잘못 읽었으면 사람이 바로 안다.
 *
 * 해를 안 적으면 올해로 본다. 올해로 뒀더니 앞으로 한참 뒤가 되면 작년으로 본다
 * (지난 일을 적는 대장이라 그렇다).
 */
export function parseEventDate(text: string, today = new Date()): string {
  const year = today.getFullYear();
  let y = 0;
  let m = 0;
  let d = 0;

  // 끊어 적은 것부터 본다 — '1/5'는 붙여 쓴 '15'와 다르다
  const three = text.match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/);
  const two = text.match(/(\d{1,2})\D+(\d{1,2})/);
  const digits = text.replace(/[^0-9]/g, '');

  if (three) {
    y = Number(three[1]) < 100 ? 2000 + Number(three[1]) : Number(three[1]);
    m = Number(three[2]);
    d = Number(three[3]);
  } else if (two) {
    y = year;
    m = Number(two[1]);
    d = Number(two[2]);
  } else if (digits.length === 8) {
    [y, m, d] = [+digits.slice(0, 4), +digits.slice(4, 6), +digits.slice(6, 8)];
  } else if (digits.length === 6) {
    [y, m, d] = [2000 + +digits.slice(0, 2), +digits.slice(2, 4), +digits.slice(4, 6)];
  } else if (digits.length === 4) {
    [y, m, d] = [year, +digits.slice(0, 2), +digits.slice(2, 4)];
  } else if (digits.length === 3) {
    [y, m, d] = [year, +digits.slice(0, 1), +digits.slice(1, 3)];
  } else {
    return '';
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return '';

  const made = new Date(y, m - 1, d);
  // 2월 30일 같은 날은 없다 — 넘겨 잡힌 날짜를 걸러낸다
  if (made.getMonth() !== m - 1 || made.getDate() !== d) return '';

  // 해를 안 적었는데 한참 뒤가 되면 작년 일이다(지난 일을 적는 대장이다)
  const noYear = !three && digits.length <= 4;
  if (noYear && made.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
    made.setFullYear(year - 1);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${made.getFullYear()}-${pad(made.getMonth() + 1)}-${pad(made.getDate())}`;
}
