/**
 * 판매가가 바뀌면 입금확인방에 띄우는 쪽지.
 *
 * 지금은 사람이 카톡에 손으로 친다. 차 한 대에 여덟 줄씩, 적는 사람마다 줄 순서도
 * 띄어쓰기도 다르고, 값을 고치고 나서 다시 올리는 걸 잊으면 방에 뜬 숫자와 시스템
 * 숫자가 달라진다 — 그 방을 보고 입금을 넣는다.
 *
 * 쓰던 양식 그대로 맞춘다. 읽는 사람이 눈으로 훑는 자리라, 더 낫게 바꾸는 것보다
 * 지금 읽는 꼴 그대로가 낫다.
 *
 * 코드가는 광고가 + 90만원, 입금은 늘 -90 이다. 정해진 값이라 받아 적지 않는다 —
 * 받아 적게 하면 한 건은 틀린다.
 */

/** 코드가 — 광고가에 늘 이만큼 붙는다(만원) */
export const CODE_PRICE_GAP_MAN = 90;

/** 입금 — 늘 같은 값(만원) */
export const DEPOSIT_MAN = -90;

export interface SaleCard {
  /** 그 차를 판 사람. 타사·기타면 남의 딜러·상사 이름이 들어간다 */
  dealer: string;
  vehicleNumber: string;
  vehicleName: string;
  /** 매입가(원). 매입 정산이 아직 없으면 0 */
  purchasePrice: number;
  /** 이전비 + 추가이전비(원) */
  transferFee: number;
  /** 차량판매가(원) — 광고가로 적는다 */
  salePrice: number;
  /** 유입 경로 — 상담에 적어 둔 값 */
  platform: string;
  /** 어느 화면에서 고쳤나 */
  from: string;
}

/** 원 → 만원. 만원이 안 되는 끝자리는 버린다 — 카톡에 적던 꼴이 그렇다 */
const man = (won: number) => Math.round(won / 10_000);

const NUM = (n: number) => n.toLocaleString();

/** 적을 게 없는 칸은 비워 둔다 — '0'을 적으면 0원에 샀다는 말이 된다 */
const orBlank = (text: string) => text || '';

/**
 * 매입가 줄.
 *
 * 이전비가 따로 있으면 붙여 적는다 — 카톡에 '3000만원+20만원'으로 적던 그 꼴이다.
 * 매입 정산이 아직 없으면 비워 둔다. 모르는 값을 0으로 적으면 안 된다.
 */
function purchaseLine(card: SaleCard): string {
  if (card.purchasePrice <= 0) return '';
  const base = `${NUM(man(card.purchasePrice))}만원`;
  return card.transferFee > 0 ? `${base}+${NUM(man(card.transferFee))}만원` : base;
}

export function saleCardText(card: SaleCard): string {
  const ad = man(card.salePrice);
  const lines = [
    `담당자 : ${orBlank(card.dealer)}`,
    `차량번호 : ${card.vehicleNumber}`,
    `차량명 : ${orBlank(card.vehicleName)}`,
    `매입가 : ${purchaseLine(card)}`,
    `광고가 : ${NUM(ad)}`,
    `코드가 : ${NUM(ad + CODE_PRICE_GAP_MAN)}`,
    `입금 : ${DEPOSIT_MAN}`,
    `유입경로 : ${orBlank(card.platform)}`,
  ];
  // 어디서 고쳤는지는 맨 아래 작게 — 숫자가 틀렸을 때 누구에게 물어볼지가 거기서 갈린다
  return `${lines.join('\n')}\n\n(${card.from}에서 바뀜)`;
}
