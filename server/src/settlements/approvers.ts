/**
 * 매입 정산을 승인하는 사람.
 *
 * 직책(본부장·대표)으로 가리지 않고 이름 두 개로 못 박는다. 직책은 여럿이 나눠 갖는
 * 자리라 나중에 본부장이 한 명 더 생기면 그 사람도 돈을 승인하게 된다 — 그건 곤란하다.
 *
 * 바꿀 일이 생기면 여기 두 줄만 고친다. 계정을 새로 만들 필요는 없고 직원 이름만 맞으면 된다.
 * 이름이 안 맞으면 아무도 승인할 수 없게 된다 — 그게 아무나 승인하는 것보다 낫다.
 */

/** 1차 — 본부장 */
export const CHIEF_APPROVER = '안원용';

/** 2차 — 대표. 여기까지 찍혀야 확정이다. */
export const CEO_APPROVER = '유진욱';

/**
 * 본부장을 건너뛰고 대표만 찍는 사람.
 *
 * 담당자가 이쪽이면 올리자마자 대표 차례다. 본부장을 거칠 일이 없는 자리가 있다.
 * 성을 뺀 이름으로 적어둔다 — '진후'라고 두면 '박진후'도 '김진후'도 걸리지만,
 * 같은 이름이 둘 있는 회사가 아니라 그게 오히려 안전하다(성을 다르게 적어도 걸린다).
 * 이름으로 못 박는다 — 직급으로 가리면 같은 직급이 하나 더 생겼을 때 같이 새 나간다.
 */
export const CEO_ONLY_OWNERS = ['이우주', '진후'];

/** 이 정산이 본부장을 거치는가 — 담당자 이름으로 갈린다. */
export function needsChief(ownerName: string | null | undefined): boolean {
  const name = (ownerName ?? '').trim();
  return !CEO_ONLY_OWNERS.some((x) => name.includes(x));
}

/**
 * 현금 수수료 확인을 찍을 수 있는가 — 대표, 그리고 테스트 계정.
 *
 * 테스트 계정을 넣는 이유는 대표가 자리를 비웠을 때 흐름이 멈추면 안 되기 때문이다.
 * 받은 사람이 스스로 찍는 것만 막으면 된다.
 */
export function canConfirmCash(user: { name: string; position: string }): boolean {
  return user.name.trim() === CEO_APPROVER || user.position.includes('테스트');
}

export type ApprovalRole = 'CHIEF' | 'CEO';

export function approvalRoleOf(name: string): ApprovalRole | null {
  const trimmed = name.trim();
  if (trimmed === CHIEF_APPROVER) return 'CHIEF';
  if (trimmed === CEO_APPROVER) return 'CEO';
  return null;
}

/**
 * 정산이 지금 어느 단계인가.
 *
 * 따로 저장하지 않고 찍힌 날짜로 낸다 — 단계와 날짜를 둘 다 저장하면 어긋난다.
 */
export type SettlementStage = 'DRAFT' | 'SUBMITTED' | 'CHIEF' | 'DONE';

export function stageOf(
  row: {
    submittedAt: Date | null;
    chiefApprovedAt: Date | null;
    ceoApprovedAt: Date | null;
  },
  /** 본부장을 거치는 건인가. 안 거치면 올리자마자 대표 차례다. */
  withChief = true,
): SettlementStage {
  if (row.ceoApprovedAt) return 'DONE';
  if (withChief && row.chiefApprovedAt) return 'CHIEF';
  if (row.submittedAt) return 'SUBMITTED';
  return 'DRAFT';
}

/**
 * 고칠 수 있는가.
 *
 * 본부장이 찍은 다음부터는 못 고친다. 승인한 뒤에 금액이 바뀌면 무엇을 보고 찍었는지가
 * 남지 않는다. 고쳐야 하면 승인을 먼저 취소한다 — 그러면 다시 받아야 한다는 게 드러난다.
 *
 * 본부장을 안 거치는 건은 대표가 찍을 때 잠긴다 — 그 전까지는 고칠 사람이 있어야 한다.
 */
export function isLocked(stage: SettlementStage): boolean {
  return stage === 'CHIEF' || stage === 'DONE';
}

/**
 * 판금 청구서를 넣을 수 있는 사람.
 *
 * 남의 정산 원가를 한 번에 고치고, 총액이 안 맞으면 금액을 손으로 맞추는 자리다.
 * 관리자 권한으로 열어 두지 않는다 — 관리자가 하나 더 생기면 그 사람도 같이 열린다.
 * 위 승인자들과 같은 이유로 이름 두 개로 못 박는다.
 */
export const PANEL_INVOICE_EDITORS = ['안원용', '테스트관리자'];

/** 이 사람이 판금 청구서를 넣을 수 있는가 */
export function canEditPanelInvoice(name: string | null | undefined): boolean {
  return PANEL_INVOICE_EDITORS.includes((name ?? '').trim());
}

/**
 * 계약팀은 아니지만 매입 정산을 보는 사람.
 *
 * 매입가와 상품화 비용을 들여다봐야 하는 자리인데 계약팀이 아니다. 직급으로 열면 같은
 * 직급이 하나 더 생겼을 때 같이 열린다 — 승인자를 이름으로 못 박는 것과 같은 이유다.
 *
 * 화면에도 같은 이름이 있다(src/lib/permissions.ts) — 고칠 땐 양쪽을 같이 본다.
 */
export const SETTLEMENT_VIEWERS = ['이우주', '안원용'];

export function canSeePurchaseSettlements(user: { name: string }): boolean {
  return SETTLEMENT_VIEWERS.includes(user.name.trim());
}
