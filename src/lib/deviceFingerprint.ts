/**
 * 이 브라우저(=이 PC)를 알아볼 지문.
 *
 * 출근 단말 키는 브라우저 저장소에 있어서 '인터넷 사용기록 삭제'에 같이 날아간다.
 * 쿠키·세션도 마찬가지라 저장 위치를 바꿔서는 못 막는다.
 *
 * 그래서 지우고 나서도 남는 것들 — 화면 크기, 시간대, CPU 코어 수 같은 하드웨어·설정 값을
 * 모아 해시한다. 이 값은 서버 DB에 등록해 두고, 키를 잃었을 때 그 PC를 알아보는 데 쓴다.
 *
 * 이것만으로 출근을 통과시키지는 않는다 — 같은 기종이면 겹칠 수 있고 흉내도 낼 수 있다.
 * 서버는 사무실 IP 안에서만 이 지문을 받아 키를 다시 내준다.
 */

interface Navigatorish {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
  language?: string;
}

/** 브라우저를 업데이트해도 잘 안 바뀌는 값들만 고른다 — 자주 바뀌면 지문이 계속 달라진다. */
function traits(): string {
  const n = navigator as Navigator & Navigatorish;
  return [
    // 버전 숫자는 업데이트마다 바뀌므로 뺀다. 어느 엔진·OS인지만 남긴다.
    (n.userAgent ?? '').replace(/[\d._]+/g, ''),
    n.platform ?? '',
    n.language ?? '',
    String(n.hardwareConcurrency ?? ''),
    String(n.deviceMemory ?? ''),
    String(n.maxTouchPoints ?? ''),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  ].join('|');
}

/** 지문(SHA-256 16진수). 원본 값은 서버로 보내지 않는다. */
export async function deviceFingerprint(): Promise<string> {
  const raw = traits();

  // crypto.subtle 은 보안 컨텍스트(https·localhost)에서만 쓸 수 있다.
  // 못 쓰면 지문을 만들지 않는다 — 약한 해시로 대충 만들면 겹칠 위험만 커진다.
  if (!globalThis.crypto?.subtle) return '';

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
