/**
 * 판금 청구서를 넣을 수 있는 사람.
 *
 * 서버의 approvers.ts 와 같은 두 이름이다. 화면에서 가리는 건 단추를 숨기는 것뿐이고
 * 진짜 판단은 서버가 한다 — 화면만 가리면 요청을 직접 보낼 수 있다. 그래도 볼 수 없는
 * 단추를 띄워 두면 눌러보고 거절당하니 여기서도 같이 가린다.
 *
 * 이름이 바뀌면 여기와 서버 두 곳을 같이 고친다.
 */
export const PANEL_INVOICE_EDITORS = ['안원용', '테스트관리자'];

export function canEditPanelInvoice(name: string | null | undefined): boolean {
  return PANEL_INVOICE_EDITORS.includes((name ?? '').trim());
}
