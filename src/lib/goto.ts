import type { ModuleKey } from '../modules';

/**
 * 다른 화면으로 보내기 — 그 자리에서 할 수 있는 일로 데려다 준다.
 *
 * "판매가 19대 안 적음"까지 알려 주고 끝내면, 받는 사람은 그걸 어디서 적는지부터 찾아야
 * 한다. 매입 관리에서 센 숫자를 매입 정산에서 채워야 하니 화면이 바뀌는데, 메뉴를 다시
 * 짚고 탭을 고르고 차를 하나씩 찾는 동안 열아홉 대가 무엇이었는지를 잊는다.
 *
 * 그래서 차량번호를 들고 간다. 간 자리에서 그 차들만 걸러 보여 주면 바로 채우기 시작할
 * 수 있다.
 *
 * 들고 가는 값은 한 번만 쓴다 — 가져간 쪽이 집어가면 사라진다. 남겨 두면 나중에 그
 * 화면을 그냥 열었을 때도 걸림쇠가 걸린 채로 떠서 "왜 몇 대만 보이지"가 된다.
 */

export interface Focus {
  /** 그 화면 안에서 어느 탭을 열까 */
  tab?: string;
  /** 이 차들만 보여 준다 */
  plates?: string[];
  /** 걸림쇠에 적을 말 — 왜 몇 대만 보이는지 */
  label?: string;
}

export const GOTO_EVENT = 'goto-module';

let pending: Focus | null = null;

export function goTo(module: ModuleKey, focus?: Focus): void {
  pending = focus ?? null;
  window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: { module } }));
}

/** 가져간다 — 한 번 집으면 사라진다 */
export function takeFocus(): Focus | null {
  const found = pending;
  pending = null;
  return found;
}
