import { ApiError } from './api';
import { alertError, askYesNo } from './alert';

/**
 * 퇴근을 찍기 전에 구내식당을 물어본다.
 *
 * 전에는 안 물어보고 출퇴근 시각으로 넘겨짚었다 — 9:30 전에 와서 18시 넘겨 가면 먹은
 * 날로 쳤다. 그래서 아무도 안 눌렀는데 체크가 켜져 있었고, 퇴근을 찍는 순간 저절로
 * 켜지는 것처럼 보였다. 체크 칸이 '내가 적은 값'인지 '시스템이 찍은 값'인지 알 수가
 * 없으니 아무도 안 건드렸고, 밖에서 먹은 날도 그대로 식대에 올라갔다.
 *
 * 하루에 한 번, 퇴근할 때 묻는다. 그때가 답을 아는 유일한 시점이다 — 아침에는 아직
 * 안 먹었고, 다음 날에는 기억이 흐리다.
 *
 * 이미 아침에 체크해 둔 사람에게는 안 묻는다. 두 번 묻는 건 안 묻느니만 못하다.
 *
 * 안 고르고 창을 닫아도 퇴근은 찍는다. 밥 이야기 때문에 퇴근이 막히면 안 된다 —
 * 그때는 지금까지처럼 출퇴근 시각으로 넘겨짚는다.
 */
export async function askMealThen(
  /** 오늘 적어 둔 값 — null 이면 아직 안 물어본 날이다 */
  mealUsed: boolean | null | undefined,
  setMeal: (used: boolean) => Promise<void>,
  clockOut: () => Promise<void>,
): Promise<void> {
  if (mealUsed === null || mealUsed === undefined) {
    const ate = await askYesNo(
      '오늘 구내식당에서 드셨나요?',
      '식대는 이 답으로 셉니다. 밖에서 드셨으면 [아니요]를 눌러 주세요.',
      '네, 먹었습니다',
      '아니요',
    );
    if (ate !== null) {
      try {
        await setMeal(ate);
      } catch (e) {
        /* 못 적어도 퇴근은 찍는다 — 둘을 묶으면 밥 때문에 퇴근이 막힌다 */
        void alertError('구내식당 체크를 적지 못했습니다', e instanceof ApiError ? e.message : '');
      }
    }
  }
  await clockOut();
}
