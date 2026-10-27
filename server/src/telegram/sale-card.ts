import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * 입금방에 올리는 쪽지.
 *
 * 차 한 대에 여덟 줄이다. 지금까지는 사람이 카톡에 손으로 쳤다 — 적는 사람마다 줄 순서도
 * 띄어쓰기도 달랐고, 값을 고치고 나서 다시 올리는 걸 잊으면 방에 뜬 숫자와 시스템 숫자가
 * 달라졌다. 그 방을 보고 입금을 넣는 자리다.
 *
 * 쓰던 양식 그대로 맞춘다. 읽는 사람이 눈으로 훑는 자리라, 더 낫게 바꾸는 것보다 지금
 * 읽는 꼴 그대로가 낫다.
 *
 * 값은 만원으로 받는다. 방에 뜨는 꼴이 만원이라, 원으로 받아서 나누면 적는 사람이 화면에
 * 보이는 숫자와 치는 숫자가 달라진다 — 거기서 영 하나가 틀린다.
 *
 * 고치면 여덟 줄을 통째로 다시 올린다. 방에 뜬 줄을 조용히 고치면 그새 읽고 간 사람은
 * 옛 숫자를 들고 있게 된다 — 알림이 안 울려서 바뀐 줄도 모른다.
 *
 * 바뀐 줄은 굵게, 지난 값은 취소선으로 뒤에 붙인다. 텔레그램 봇은 글자에 색을 못 넣는다 —
 * 쓸 수 있는 건 굵게·기울임·취소선·밑줄뿐이라, 눈에 걸리는 쪽으로 고른다.
 */

/** 코드가 — 광고가에 늘 이만큼 붙는다(만원) */
export const CODE_PRICE_GAP_MAN = 90;

/** 입금 — 늘 같은 값(만원) */
export const DEPOSIT_MAN = -90;

/** 만원 단위 값의 테두리 — 1억 2천만원이면 12,000 이다. 자릿수를 잘못 친 걸 여기서 막는다 */
const MAN_MAX = 1_000_000;

export class SaleCardDto {
  /** 그 차를 판 사람. 타사·기타면 남의 딜러·상사 이름이 들어간다 */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dealer?: string;

  @IsString()
  @MaxLength(30)
  vehicleNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleName?: string;

  /** 매입가(만원). 모르면 0 — 줄을 비워 둔다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAN_MAX)
  purchasePrice?: number;

  /** 구전(만원) — 매입가 뒤에 '+45만원'으로 붙는 그 값이다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAN_MAX)
  brokerFee?: number;

  /** 광고가(만원) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAN_MAX)
  adPrice?: number;

  /** 코드가(만원). 0 이면 광고가 + 90 으로 적는다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAN_MAX)
  codePrice?: number;

  /** 입금(만원) — 늘 -90 이지만 고칠 수 있게 받는다 */
  @IsOptional()
  @IsInt()
  @Min(-MAN_MAX)
  @Max(MAN_MAX)
  deposit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;

  /** 맨 아래 괄호에 들어갈 한 줄 — 비우면 안 붙인다 */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  note?: string;

  /**
   * 어느 쪽지를 고쳐 올리는 것인가.
   *
   * 그 쪽지와 견줘서 바뀐 줄을 굵게 적는다. 안 넘기면 새로 올리는 것으로 친다 —
   * 그때는 아무 줄도 안 굵어진다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  basedOn?: string;
}

const NUM = (n: number) => n.toLocaleString();

/** 적을 게 없는 칸은 비워 둔다 — '0'을 적으면 0원에 샀다는 말이 된다 */
const orBlank = (text?: string) => (text ?? '').trim();

/**
 * 매입가 줄.
 *
 * 뒤에 붙는 '+45만원'은 구전이다. 이전비가 아니다 — 이전비는 매입가로 정해지는 값이라
 * 차마다 붙고, 그걸 적으면 모든 줄에 쓸데없는 숫자가 붙는다. 구전은 준 건에만 있다.
 *
 * 매입가를 모르면 비워 둔다. 모르는 값을 0으로 적으면 안 된다.
 */
function purchaseLine(card: SaleCardDto): string {
  const price = card.purchasePrice ?? 0;
  const broker = card.brokerFee ?? 0;
  if (price <= 0) return '';
  const base = `${NUM(price)}만원`;
  return broker > 0 ? `${base}+${NUM(broker)}만원` : base;
}

/** 여덟 줄 — 이름과 값으로. 적는 꼴과 굵게 칠하는 꼴이 같은 데서 나와야 안 어긋난다 */
function rowsOf(card: SaleCardDto): [string, string][] {
  const ad = card.adPrice ?? 0;
  // 코드가는 광고가 + 90 이 늘 맞는다. 받아 적게는 해 두되, 비우면 저절로 채운다
  const code = card.codePrice && card.codePrice > 0 ? card.codePrice : ad + CODE_PRICE_GAP_MAN;
  return [
    ['담당자', orBlank(card.dealer)],
    ['차량번호', orBlank(card.vehicleNumber)],
    ['차량명', orBlank(card.vehicleName)],
    ['매입가', purchaseLine(card)],
    ['광고가', NUM(ad)],
    ['코드가', NUM(code)],
    ['입금', NUM(card.deposit ?? DEPOSIT_MAN)],
    ['유입경로', orBlank(card.platform)],
  ];
}

/**
 * 올라간 쪽지에서 값을 집는다.
 *
 * 보낸 글을 그대로 남겨 두고 거기서 읽는다 — 칸마다 따로 저장해 두면 양식이 바뀔 때마다
 * 표가 늘고 지난 쪽지는 빈칸이 된다.
 */
export function fieldsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^[▶\s]*([^:]+?)\s*:\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/**
 * 고쳐 올리는 쪽지에 붙는 표.
 *
 * before: 지난 쪽지 글 그대로 — 여기서 바뀐 줄을 가린다.
 * seq   : 그 차로 몇 번째 올리는 쪽지인가. 두 번째면 2 다.
 */
export interface SaleCardMark {
  before: string;
  by: string;
  seq: number;
}

/**
 * 꼬리말 — 고쳐 올린 쪽지에 붙는다.
 *
 * 괄호를 안 쓴다. 비고 줄이 괄호라, 같은 꼴로 적으면 다음에 고칠 때 이 줄이 비고 칸으로
 * 딸려 들어간다.
 *
 * 몇 번째인지를 적는다. 화면에서는 첫 수정을 파랗게, 그다음부터 빨갛게 칠해서 "이 차는
 * 값이 여러 번 흔들렸다"가 보이는데, 방에서는 색을 못 써서 숫자로 대신한다.
 */
const editLine = (mark: SaleCardMark, changed: string[]) =>
  `※ ${mark.by ? `${mark.by} ` : ''}수정${mark.seq > 1 ? ` (${mark.seq}번째 올림)` : ''}${
    changed.length > 0 ? ` · ${changed.join(' · ')}` : ''
  }`;

/** 방에 올라간 글 그대로 — 목록이 이 글에서 칸을 집는다. 꾸밈은 안 넣는다 */
export function saleCardText(card: SaleCardDto, mark?: SaleCardMark): string {
  const lines = rowsOf(card).map(([label, value]) => `${label} : ${value}`);
  const note = orBlank(card.note);
  if (note) lines.push('', `(${note})`);
  if (mark) lines.push(editLine(mark, changedOf(card, mark.before)));
  return lines.join('\n');
}

/** 무엇이 달라졌나 — 이름만 */
function changedOf(card: SaleCardDto, before: string): string[] {
  const was = fieldsOf(before);
  return rowsOf(card)
    .filter(([label, value]) => (was[label] ?? '') !== value)
    .map(([label]) => label);
}

/** 텔레그램이 HTML 로 읽는다 — 차명에 & 하나 들어가면 쪽지가 통째로 안 간다 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 방에 보낼 글 — 바뀐 줄을 굵게, 지난 값을 취소선으로.
 *
 * 색은 못 쓴다. 텔레그램 봇이 글자에 넣을 수 있는 건 굵게·기울임·취소선·밑줄뿐이라,
 * 눈에 걸리는 쪽으로 고른다. 지난 값을 옆에 남기는 건 "무엇이 무엇으로 바뀌었나"가
 * 한 줄에 다 보여야 방에서 되묻지 않기 때문이다.
 */
export function saleCardHtml(card: SaleCardDto, mark?: SaleCardMark): string {
  const was = mark ? fieldsOf(mark.before) : null;
  const lines = rowsOf(card).map(([label, value]) => {
    const old = was?.[label] ?? '';
    if (!was || old === value) return `${label} : ${esc(value)}`;
    const now = value ? `<b>${esc(value)}</b>` : '<b>(비움)</b>';
    return old ? `${label} : ${now} <s>${esc(old)}</s>` : `${label} : ${now}`;
  });
  const note = orBlank(card.note);
  if (note) lines.push('', `(${esc(note)})`);
  if (mark) lines.push(esc(editLine(mark, changedOf(card, mark.before))));
  return lines.join('\n');
}
