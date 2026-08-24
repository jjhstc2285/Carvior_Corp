/**
 * 차량번호 규칙 — 서버·프론트가 같은 문구를 쓰도록 메시지까지 여기에 모아둔다.
 * (프론트 쪽 같은 규칙은 src/lib/vehicle.ts 에 있다. 고칠 땐 양쪽을 같이 본다.)
 */

/** 허용 형식: "12가3456" / "123가4567" 두 가지뿐 */
export const PLATE_PATTERN = /^\d{2,3}[가-힣]\d{4}$/;

export const PLATE_FORMAT_MESSAGE = '차량번호 형식을 확인해주세요.';
export const PLATE_DUPLICATE_MESSAGE = '동일한 차량번호가 있습니다.';
export const PLATE_NOT_FOUND_MESSAGE = '차량번호를 다시 확인해주세요.';

/** 입력창에서 들어온 공백을 걷어낸다("12가 3456" 같은 입력도 받아준다). */
export function normalizePlate(value: string): string {
  return value.replace(/\s+/g, '');
}

export function isValidPlate(value: string): boolean {
  return PLATE_PATTERN.test(value);
}

/** 주유·배터리 등록에서 찾는 기준이 되는 뒤 4자리 */
export function plateTailOf(vehicleNumber: string): string {
  return vehicleNumber.slice(-4);
}
