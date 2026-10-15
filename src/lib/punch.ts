import { ApiError } from './api';
import { alertError } from './alert';

/**
 * 출퇴근을 찍는다 — 안 되면 왜 안 되는지까지 띄운다.
 *
 * 서버가 막는 경우가 있다(등록 안 된 PC, 사무실 밖 네트워크). 예전에는 그 오류를 아무도
 * 안 받아서 버튼을 눌러도 화면에 아무 변화가 없었다. 무엇을 해야 하는지까지 적어 준다.
 *
 * 찍는 자리가 둘(출퇴근 화면, 홈)이라 여기 모아 둔다. 각자 들고 있으면 한쪽만 고치는
 * 날이 오고, 그러면 같은 상황에서 화면마다 다른 말이 뜬다.
 */
export async function punch(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (e) {
    const code = e instanceof ApiError ? e.code : null;
    const message = e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.';

    if (code === 'DEVICE_REQUIRED') {
      await alertError('출근 PC 등록이 필요합니다', message, '관리자에게 이 PC를 출근 단말로 등록해 달라고 요청하세요.');
      return;
    }
    if (code === 'IP_NOT_ALLOWED') {
      await alertError('사무실 네트워크가 아닙니다', message, '사무실 WiFi에 연결한 뒤 다시 눌러 주세요.');
      return;
    }
    await alertError('등록하지 못했습니다', message);
  }
}
