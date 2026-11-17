import { ApiError } from './api';
import { alertError } from './alert';

/**
 * 출퇴근을 찍는다 — 안 되면 왜 안 되는지까지 띄운다.
 *
 * 예전에는 서버 오류를 아무도 안 받아서 버튼을 눌러도 화면에 아무 변화가 없었다.
 * 서버가 보낸 이유를 그대로 띄운다.
 *
 * 찍는 자리가 둘(출퇴근 화면, 홈)이라 여기 모아 둔다. 각자 들고 있으면 한쪽만 고치는
 * 날이 오고, 그러면 같은 상황에서 화면마다 다른 말이 뜬다.
 */
export async function punch(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (e) {
    const message = e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.';

    await alertError('등록하지 못했습니다', message);
  }
}
