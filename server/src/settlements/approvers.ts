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

export function stageOf(row: {
  submittedAt: Date | null;
  chiefApprovedAt: Date | null;
  ceoApprovedAt: Date | null;
}): SettlementStage {
  if (row.ceoApprovedAt) return 'DONE';
  if (row.chiefApprovedAt) return 'CHIEF';
  if (row.submittedAt) return 'SUBMITTED';
  return 'DRAFT';
}

/**
 * 고칠 수 있는가.
 *
 * 본부장이 찍은 다음부터는 못 고친다. 승인한 뒤에 금액이 바뀌면 무엇을 보고 찍었는지가
 * 남지 않는다. 고쳐야 하면 승인을 먼저 취소한다 — 그러면 다시 받아야 한다는 게 드러난다.
 */
export function isLocked(stage: SettlementStage): boolean {
  return stage === 'CHIEF' || stage === 'DONE';
}
