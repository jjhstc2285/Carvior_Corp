/**
 * 차를 사오면 매입방에 올리는 쪽지.
 *
 * 지금은 사오는 사람이 카톡에 손으로 친다. 열일곱 줄짜리라 한 줄은 꼭 빠지고, 빠진
 * 줄이 하필 차키 갯수나 고객번호면 나중에 그걸 물어보러 다시 전화를 돈다.
 *
 * 쓰던 양식 그대로 맞춘다. 읽는 사람이 눈으로 훑는 자리라, 더 낫게 바꾸는 것보다
 * 지금 읽는 꼴 그대로가 낫다 — 줄 차례도 '▶' 도 그대로 둔다.
 *
 * 아직 안 정해진 줄(차량입금·광택집·도색판·탁송업체비용·성능장·주차장위치)은 비워서
 * 같이 올린다. 카톡에서도 비워 올리고 정해지면 답글로 채운다 — 줄이 아예 없으면
 * 무엇을 더 채워야 하는지 아무도 모른다.
 */

/** 아직 시스템에 없는 줄 — 비워서 올린다. 채우는 건 방에서 이어 적는다 */
const BLANK_LINES = ['차량입금', '광택집', '도색판', '탁송업체비용', '성능장', '주차장위치'] as const;

/** 매입 줄에서 쪽지를 만들 때 쓰는 것 — 서비스가 그대로 넘긴다 */
export interface PurchaseCardRow {
  source: string;
  date: Date;
  inspector: string;
  vehicleName: string;
  detailModel: string;
  vehicleNumber: string;
  modelYear: string;
  fuel: string;
  note: string;
  mileage: number;
  checkedMileage: number;
  purchaseAmount: number;
  brokerFee: number;
  keyCount: number;
  customerPhone: string;
  customerName: string;
  employee?: { name: string } | null;
}

export interface PurchaseCard {
  /** 매입처 — "bmw 인천 김경훈" 처럼 어디서 사왔는지 */
  source: string;
  /** 매입일 */
  date: Date;
  /** 실차 확인자 — "검차업체(진후)" */
  inspector: string;
  vehicleName: string;
  /** 세부모델 — 있으면 차명 뒤에 붙인다 */
  detailModel: string;
  vehicleNumber: string;
  modelYear: string;
  fuel: string;
  /** 특이사항 */
  note: string;
  /** 주행거리(km) — 실차 확인한 값이 있으면 그게 맞다 */
  mileage: number;
  /** 실매입금액(원) */
  purchaseAmount: number;
  /** 구전(원) */
  brokerFee: number;
  keyCount: number;
  customerPhone: string;
  customerName: string;
  /** 등록한 사람 — 머리줄에 쓴다 */
  employeeName: string;
}

const NUM = (n: number) => n.toLocaleString();

/** 원 → 만원. 카톡에 적던 꼴이 만원이다 */
const man = (won: number) => Math.round(won / 10_000);

/** 26년 10월 23일 */
function dateLine(d: Date): string {
  return `${String(d.getFullYear()).slice(2)}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 실매입금액 줄.
 *
 * 구전을 준 건은 '1500 +구전 50 총 1550만' 으로 적는다 — 셋을 다 적는 건, 받는 쪽이
 * 보는 숫자(1500)와 나가는 돈(1550)이 다르기 때문이다. 하나만 적으면 반드시 헷갈린다.
 *
 * 구전이 없으면 '698만원' 으로 끝낸다.
 */
function amountLine(card: PurchaseCard): string {
  const base = man(card.purchaseAmount);
  if (base <= 0) return '';
  const fee = man(card.brokerFee);
  if (fee <= 0) return `${NUM(base)}만원`;
  return `${NUM(base)} +구전 ${NUM(fee)} 총 ${NUM(base + fee)}만`;
}

export function purchaseCardText(card: PurchaseCard): string {
  // 차명은 세부모델까지 붙여야 같은 차종이 여럿일 때 가려진다
  const name = [card.vehicleName, card.detailModel].map(v => v.trim()).filter(Boolean).join(' ');

  const lines = [
    // 머리줄 — 어디서 사왔나. 안 적혀 있으면 등록한 사람이라도 적는다
    `매입 - ${card.source.trim() || card.employeeName}`,
    `▶날짜 : ${dateLine(card.date)}`,
    `▶실차 확인자 : ${card.inspector.trim()}`,
    `▶차명 : ${name}`,
    `▶차량번호 : ${card.vehicleNumber}`,
    `▶연식 : ${card.modelYear.trim()}`,
    `▶연료 : ${card.fuel.trim()}`,
    `▶특이사항 : ${card.note.trim()}`,
    `▶주행거리 : ${card.mileage > 0 ? `${NUM(card.mileage)}km` : ''}`,
    `▶실매입금액 : ${amountLine(card)}`,
    ...BLANK_LINES.map(label => `▶${label} : `),
    `▶차키갯수 : ${card.keyCount > 0 ? `${card.keyCount}개` : ''}`,
    `▶고객번호 : ${card.customerPhone.trim()}`,
    `▶고객이름 : ${card.customerName.trim()}`,
  ];
  return lines.join('\n');
}
