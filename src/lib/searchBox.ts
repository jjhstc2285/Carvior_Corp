/**
 * 차량번호로 찾는 칸.
 *
 * 화면마다 거르는 칸이 여럿인데(월, 상태, 전체 기간…) 생김새가 다 같아서 찾는 칸이
 * 그 틈에 묻혀 있었다. 차 한 대를 들고 들어와 번호를 치는 게 이 화면들에서 제일 잦은
 * 일인데, 그 칸을 눈으로 먼저 찾아야 했다.
 *
 * 빨간 테두리로 띄워 둔다. 경고가 아니라 "여기부터 치세요"라는 표다 — 그래서 바탕은
 * 희게 두고 테두리만 두껍게 한다. 빨간 바탕까지 깔면 뭔가 잘못된 칸으로 읽힌다.
 *
 * 한 군데 적어 두고 같이 쓴다. 다섯 화면에 흩어져 있어서 따로 적으면 금세 갈린다.
 */
export const PLATE_SEARCH_CLASS =
  'rounded-lg border-2 border-red-400 bg-white px-2.5 py-1.5 text-sm font-medium outline-none ' +
  'placeholder:font-normal placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-100';
