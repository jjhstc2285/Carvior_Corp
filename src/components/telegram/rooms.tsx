import TelegramRoomModule, { type RoomSpec } from './TelegramRoomModule';
import TelegramTestCard from '../TelegramTestCard';

/**
 * 방마다 한 화면씩.
 *
 * 한 화면에 탭으로 묶어 뒀더니 "어디 있냐"가 됐다. 둘은 보는 사람도 보는 때도 다르다 —
 * 입금방은 돈을 넣으려고 보고, 매입방은 차가 들어왔나 보려고 본다.
 *
 * 리스트에 세울 칸은 쪽지에 적힌 이름 그대로 집는다(서버가 보낸 글을 그대로 남긴다).
 * 양식이 바뀌면 여기 이름만 맞추면 된다 — 칸을 따로 저장해 두면 지난 쪽지가 빈칸이 된다.
 */

const SALE: RoomSpec = {
  key: 'SALE',
  title: '입금방',
  hint: '차량판매가를 네 곳(상담 등록 · 제시 금융 · 알선 정산 · 매입 정산) 어디서든 고치면 입금확인방에 쪽지가 올라갑니다. 코드가는 광고가+90만원, 입금은 -90으로 늘 같습니다 — 받아 적지 않습니다. 못 보낸 줄은 빨갛게 뜹니다(방이 끊기면 쪽지는 안 가는데 화면에서는 아무 일도 안 일어납니다).',
  columns: [
    { field: '차량번호', label: '차량번호', strong: true },
    { field: '차량명', label: '차량명' },
    { field: '담당자', label: '담당자' },
    { field: '매입가', label: '매입가', align: 'text-right' },
    { field: '광고가', label: '광고가', align: 'text-right', strong: true },
    { field: '코드가', label: '코드가', align: 'text-right' },
    { field: '유입경로', label: '유입경로' },
  ],
  filterField: { field: '유입경로', label: '유입경로' },
  calLabel: '차량명',
  calSub: '광고가',
  envKey: 'TELEGRAM_SALE_CHAT_ID',
};

const PURCHASE: RoomSpec = {
  key: 'PURCHASE',
  title: '매입방',
  hint: '매입 관리에 차를 등록하면 매입방에 쪽지가 올라갑니다. 실차 확인자 · 특이사항 · 주행거리는 검차가 끝나야 채워지므로, 다 채운 뒤 [매입방에 다시 올리기]를 한 번 더 눌러 주세요. 차량입금 · 광택집 · 도색판 · 탁송업체비용 · 성능장 · 주차장위치는 비워서 올라갑니다 — 정해지면 방에서 이어 적습니다.',
  columns: [
    { field: '차량번호', label: '차량번호', strong: true },
    { field: '차명', label: '차명' },
    { field: '날짜', label: '매입일' },
    { field: '실매입금액', label: '실매입금액', align: 'text-right', strong: true },
    { field: '주행거리', label: '주행거리', align: 'text-right' },
    { field: '실차 확인자', label: '실차 확인자' },
    { field: '고객이름', label: '고객이름' },
  ],
  filterField: { field: '실차 확인자', label: '실차 확인자' },
  calLabel: '차명',
  calSub: '실매입금액',
  envKey: 'TELEGRAM_PURCHASE_CHAT_ID',
};

export function TelegramSaleModule() {
  return <TelegramRoomModule room={SALE} />;
}

export function TelegramPurchaseModule() {
  return <TelegramRoomModule room={PURCHASE} />;
}

/**
 * 공지방 기록 — 금액이 없는 방이라 따로 메뉴를 내주지 않는다.
 *
 * 연결 확인과 같은 자리에 둔다. 공지가 안 올 때 보는 곳이 거기라, 그때 무엇이 나갔는지도
 * 같이 보이면 된다.
 */
export function TelegramBroadcastPanel() {
  return <TelegramTestCard />;
}
