import TelegramRoomModule, { type RoomSpec } from './TelegramRoomModule';
import TelegramTestCard from '../TelegramTestCard';

/**
 * 입금방에 무엇이 올라갔나.
 *
 * 매입방은 메뉴에서 뺐다. 차를 사오면 텔레그램 매입방으로는 그대로 쪽지가 가는데,
 * 그걸 다시 화면으로 들여다보는 사람이 없었다 — 차가 들어온 건 매입 관리에서 본다.
 *
 * 입금방은 손으로 올린다. 판매가를 고칠 때마다 저절로 나가게 해 봤더니 한 대를 두세 번
 * 고치면 그만큼 줄이 늘어, 정작 봐야 할 입금 이야기가 밀렸다 — 올릴 때를 사람이 고른다.
 *
 * 입금방은 전 직원이 본다. 어느 차가 얼마로 올라갔는지는 상담·광고·계약이 다 같이
 * 보고 움직이는 값이다.
 *
 * 리스트에 세울 칸은 쪽지에 적힌 이름 그대로 집는다(서버가 보낸 글을 그대로 남긴다).
 * 양식이 바뀌면 여기 이름만 맞추면 된다 — 칸을 따로 저장해 두면 지난 쪽지가 빈칸이 된다.
 */

const SALE: RoomSpec = {
  key: 'SALE',
  title: '입금방',
  hint: '매입 관리에 있는데 아직 한 번도 안 올린 차가 노란 「안 올림」 줄로 같이 떠 있습니다 — 차량번호 · 차명 · 담당자 · 매입가는 이미 채워져 있고, 줄을 누르면 광고가만 적어 올리면 됩니다(코드가는 비우면 광고가+90, 입금은 -90). 담당자는 상담에서 가져오고, 상담이 아직 없으면 매입을 적은 사람으로 둡니다 — 올리기 전에 창에서 고치면 됩니다. 상담이 붙은 차에는 파란 「상담」 표가 붙습니다(위에서 그것만 추려 볼 수 있습니다). 올린 줄을 누르면 고쳐서 통째로 다시 올립니다 — 방에서는 바뀐 줄이 굵게 뜨고 지난 값이 취소선으로 붙습니다(텔레그램은 글자에 색을 못 넣습니다). 이 목록에서는 처음 고친 값이 파랑, 그다음부터 빨강입니다.',
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
  canCompose: true,
};

export function TelegramSaleModule() {
  return <TelegramRoomModule room={SALE} />;
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
