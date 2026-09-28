/**
 * 출근을 찍을 수 있는 자리인지 IP로 가른다.
 *
 * 처음에는 IP를 하나씩 적어 두게 했는데, 공유기가 받아오는 공인 IP는 고정이 아니다.
 * 공유기를 껐다 켜거나 통신사가 임대를 갱신하면 끝자리가 바뀌고, 그 순간 사무실 전체가
 * 출근을 못 찍는다 — 아침에 그 사실을 알게 되니 손 쓸 틈도 없다.
 *
 * 그래서 한 줄에 대역을 적을 수 있게 한다:
 *
 *   123.45.67.89      그 IP만
 *   123.45.67.*       끝자리만 바뀌는 경우(대개 이걸로 충분하다)
 *   123.45.*          앞 두 자리만 맞으면
 *   123.45.67.0/24    같은 뜻을 CIDR로 적고 싶을 때
 *
 * 넓게 열수록 옆 건물도 들어온다. IP는 '사무실 네트워크인가'까지만 가르는 장치고,
 * '그 자리 PC인가'는 등록된 단말 키가 본다 — 둘을 같이 두면 대역을 열어도 괜찮다.
 */

/** IPv4를 감싼 IPv6 표기(::ffff:1.2.3.4)와 포트를 벗겨 낸다 */
export function normalizeIp(raw: string): string {
  const ip = (raw ?? '').trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  return mapped ? mapped[1] : ip;
}

/** 네 토막 IPv4를 32비트 수로 — 아니면 null */
function toLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/** 목록에 적힌 한 줄과 들어온 IP가 맞는지 */
export function ipMatches(pattern: string, clientIp: string): boolean {
  const pat = normalizeIp(pattern);
  const ip = normalizeIp(clientIp);
  if (!pat || !ip) return false;
  if (pat === ip) return true;

  // 123.45.67.0/24
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(pat);
  if (cidr) {
    const bits = Number(cidr[2]);
    const base = toLong(cidr[1]);
    const target = toLong(ip);
    if (base === null || target === null || bits > 32) return false;
    if (bits === 0) return true;
    // 부호 문제를 피하려고 시프트 대신 나눗셈으로 윗비트를 자른다
    const block = 2 ** (32 - bits);
    return Math.floor(base / block) === Math.floor(target / block);
  }

  // 123.45.67.* / 123.45.* — 별표 앞까지만 맞으면 된다
  if (pat.includes('*')) {
    const patParts = pat.split('.');
    const ipParts = ip.split('.');
    if (ipParts.length !== 4) return false;
    for (let i = 0; i < patParts.length; i += 1) {
      if (patParts[i] === '*') return true; // 여기서부터는 안 본다
      if (patParts[i] !== ipParts[i]) return false;
    }
    return patParts.length === 4;
  }

  return false;
}

/** 목록 중 하나라도 맞으면 통과. 목록이 비어 있으면 제한하지 않는다 */
export function ipAllowed(patterns: readonly string[], clientIp: string): boolean {
  return patterns.length === 0 || patterns.some((p) => ipMatches(p, clientIp));
}

/**
 * 지금 IP를 보고 열어 줄 만한 대역을 권한다.
 *
 * 공유기가 새 IP를 받아도 대개 같은 /24 안에서 움직인다. 화면에서 한 번 눌러 열 수 있게
 * 문자열을 만들어 준다.
 */
export function suggestRange(clientIp: string): string | null {
  const ip = normalizeIp(clientIp);
  const parts = ip.split('.');
  if (parts.length !== 4 || toLong(ip) === null) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
}
