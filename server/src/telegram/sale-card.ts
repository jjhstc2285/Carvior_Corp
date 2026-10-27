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

export function saleCardText(card: SaleCardDto): string {
  const ad = card.adPrice ?? 0;
  // 코드가는 광고가 + 90 이 늘 맞는다. 받아 적게는 해 두되, 비우면 저절로 채운다
  const code = card.codePrice && card.codePrice > 0 ? card.codePrice : ad + CODE_PRICE_GAP_MAN;
  const lines = [
    `담당자 : ${orBlank(card.dealer)}`,
    `차량번호 : ${orBlank(card.vehicleNumber)}`,
    `차량명 : ${orBlank(card.vehicleName)}`,
    `매입가 : ${purchaseLine(card)}`,
    `광고가 : ${NUM(ad)}`,
    `코드가 : ${NUM(code)}`,
    `입금 : ${NUM(card.deposit ?? DEPOSIT_MAN)}`,
    `유입경로 : ${orBlank(card.platform)}`,
  ];
  const note = orBlank(card.note);
  return note ? `${lines.join('\n')}\n\n(${note})` : lines.join('\n');
}
