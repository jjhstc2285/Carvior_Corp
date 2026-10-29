/**
 * API 클라이언트.
 *
 * 같은 도메인에서 Apache가 /api를 NestJS로 넘겨주므로 기본 베이스는 '/api'다.
 * 개발 중 Vite dev 서버에서 쓸 때만 VITE_API_BASE로 서버 주소를 지정한다.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

const TOKEN_KEY = 'anyone-motors-token';

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  // 시크릿 모드 등에서 접근이 막힐 수 있음 — 토큰 없이 시작
}

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장이 안 되면 이번 세션에서만 유지된다
  }
}

/** 토큰이 만료·무효일 때 앱 전체가 로그인 화면으로 돌아가게 알린다. */
export const UNAUTHORIZED_EVENT = 'anyone-motors:unauthorized';

/**
 * 출근 단말 키.
 *
 * 사무실 WiFi에 붙은 휴대폰과 자리 PC는 같은 공인 IP로 나가서 IP로는 못 가른다.
 * 그래서 등록한 PC 브라우저에만 이 키를 저장해두고 매 요청에 실어 보낸다 —
 * 서버는 등록된 단말이 있을 때 이 키가 있는 요청만 출근을 찍게 한다.
 * 로그인 토큰과 달리 계정이 아니라 '그 PC'에 붙는 값이라 로그아웃해도 지우지 않는다.
 */
const DEVICE_KEY = 'anyone-motors-device';

interface DeviceRegistration {
  id: string;
  token: string;
}

let device: DeviceRegistration | null = null;
try {
  const raw = localStorage.getItem(DEVICE_KEY);
  if (raw) device = JSON.parse(raw) as DeviceRegistration;
} catch {
  // 저장된 값이 깨졌거나 접근이 막힌 경우 — 단말 미등록으로 본다
}

/** 이 브라우저가 등록된 단말이면 그 id, 아니면 null */
export function getDeviceId(): string | null {
  return device?.id ?? null;
}

export function setDevice(value: DeviceRegistration | null): void {
  device = value;
  try {
    if (value) localStorage.setItem(DEVICE_KEY, JSON.stringify(value));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // 저장이 안 되면 이번 세션에서만 유지된다
  }
}

/**
 * 이 브라우저의 지문. 계산이 비동기(SHA-256)라 요청마다 기다릴 수 없어 한 번 구해 들고 있는다.
 *
 * 요청에 같이 실어 보내면 서버가 두 가지에 쓴다:
 *  - 지문 없이 예전에 등록된 단말을 출근 한 번으로 채워 넣기
 *  - 사용기록을 지워 키를 잃었을 때 그 PC를 알아보기
 */
let fingerprint = '';

void (async () => {
  try {
    const { deviceFingerprint } = await import('./deviceFingerprint');
    fingerprint = await deviceFingerprint();
  } catch {
    // 지문을 못 만들어도 기존 방식(저장된 키)은 그대로 동작한다.
  }
})();

/**
 * 단말 키 되찾기.
 *
 * 인터넷 사용기록을 지우면 저장해둔 키가 사라진다. 그때마다 관리자를 불러 다시 등록하는 대신,
 * 사무실 IP 안에서 지문이 맞으면 서버가 키를 새로 내준다.
 *
 * 로그인할 때 한 번 조용히 부른다 — 되찾을 게 없으면 아무 일도 일어나지 않는다.
 */
export async function recoverDevice(): Promise<void> {
  if (getDeviceId()) return; // 이미 등록된 브라우저

  try {
    if (!fingerprint) return;

    const res = await api<{ recovered: boolean; id?: string; token?: string; label?: string }>(
      '/attendance/devices/recover',
      { method: 'POST', body: { fingerprint } },
    );
    if (res.recovered && res.id && res.token) setDevice({ id: res.id, token: res.token });
  } catch {
    // 되찾기는 부가 동작이다 — 실패해도 로그인 흐름을 막지 않는다.
  }
}

export class ApiError extends Error {
  readonly status: number;
  /**
   * 서버가 붙여준 원인 코드. 화면이 문구를 뒤져서 원인을 알아내지 않아도 되게 쓴다
   * (예: 출근 거부가 'PC 미등록'인지 '사무실 밖'인지).
   */
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** FormData를 보낼 때 사용(Content-Type을 브라우저가 직접 정하게 둔다) */
  formData?: FormData;
  /** 401이어도 로그인 화면으로 튕기지 않음(로그인 요청 자체) */
  skipAuthRedirect?: boolean;
}

/**
 * 부동산 통행증.
 *
 * 부동산은 보증금·월세·임대인 연락처가 들어 있어 대외비다. 로그인과 별개로 번호를 한 번 더
 * 받는데, 그 번호는 서버에만 둔다 — 화면에 박으면 소스에 그대로 드러난다.
 * 번호가 맞으면 서버가 짧게 쓰는 통행증을 내주고, 그걸 이 탭에서만 들고 다닌다.
 *
 * 창을 닫으면 사라진다(sessionStorage) — 남의 자리에서 열어두고 간 화면이 계속 열려 있으면
 * 번호를 다시 받는 뜻이 없다.
 */
const PROPERTY_PASS_KEY = 'property-pass';

export function getPropertyPass(): string | null {
  try {
    return sessionStorage.getItem(PROPERTY_PASS_KEY);
  } catch {
    return null;
  }
}

export function setPropertyPass(pass: string | null) {
  try {
    if (pass) sessionStorage.setItem(PROPERTY_PASS_KEY, pass);
    else sessionStorage.removeItem(PROPERTY_PASS_KEY);
  } catch {
    // 못 적어도 이번 화면에서는 쓸 수 있다 — 다음에 다시 번호를 받는다
  }
}

/**
 * 상조회비 통행증.
 *
 * 비밀번호는 부동산과 같은 값을 쓰지만 통행증은 따로다 — 부동산을 열었다고 이 장부까지
 * 열리면 따로 잠근 뜻이 없다.
 */
const DEALER_FEE_PASS_KEY = 'dealer-fee-pass';

export function getDealerFeePass(): string | null {
  try {
    return sessionStorage.getItem(DEALER_FEE_PASS_KEY);
  } catch {
    return null;
  }
}

export function setDealerFeePass(pass: string | null) {
  try {
    if (pass) sessionStorage.setItem(DEALER_FEE_PASS_KEY, pass);
    else sessionStorage.removeItem(DEALER_FEE_PASS_KEY);
  } catch {
    // 못 적어도 이번 화면에서는 쓸 수 있다 — 다음에 다시 번호를 받는다
  }
}

/**
 * 인건비 통행증.
 *
 * 부동산과 같은 방식이고 서명이 달라 서로 열리지 않는다 — 한쪽 번호를 안다고 다른 쪽까지
 * 열리면 나눠 잠근 뜻이 없다.
 */
const PAYROLL_PASS_KEY = 'payroll-pass';

export function getPayrollPass(): string | null {
  try {
    return sessionStorage.getItem(PAYROLL_PASS_KEY);
  } catch {
    return null;
  }
}

export function setPayrollPass(pass: string | null) {
  try {
    if (pass) sessionStorage.setItem(PAYROLL_PASS_KEY, pass);
    else sessionStorage.removeItem(PAYROLL_PASS_KEY);
  } catch {
    // 못 적어도 이번 화면에서는 쓸 수 있다 — 다음에 다시 번호를 받는다
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // 부동산 쪽은 통행증을 같이 보낸다. 화면마다 챙기면 한 군데는 꼭 빠뜨린다
  if (path.startsWith('/properties')) {
    const pass = getPropertyPass();
    if (pass) headers['X-Property-Pass'] = pass;
  }
  // 상조회비는 번호만 부동산과 같고 통행증은 따로다
  if (path.startsWith('/dealer-fees')) {
    const pass = getDealerFeePass();
    if (pass) headers['X-Property-Pass'] = pass;
  }
  // 모니터링도 인건비와 같은 번호로 잠근다 — 거기 나가는 돈의 절반이 인건비다
  if (path.startsWith('/payroll') || path.startsWith('/monitoring')) {
    const pass = getPayrollPass();
    if (pass) headers['X-Payroll-Pass'] = pass;
  }
  if (device) headers['X-Device-Token'] = device.token;
  if (fingerprint) headers['X-Device-Fingerprint'] = fingerprint;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  }

  if (res.status === 401 && !options.skipAuthRedirect) {
    setToken(null);
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = extractMessage(data) ?? `요청에 실패했습니다. (${res.status})`;
    const code = extractCode(data);

    /*
      돈 장부 통행증이 시간 지나 막혔다.

      화면마다 이걸 따로 알아채게 두면 한 군데는 꼭 빠뜨린다 — 그러면 화면은 열려 있는데
      아무것도 안 불러와지는 상태로 남는다. 여기서 한 번 치우고 알린다.
    */
    if (code === 'PROPERTY_LOCKED') {
      setPropertyPass(null);
      window.dispatchEvent(new CustomEvent('ledger-locked'));
    }
    if (code === 'DEALER_FEE_LOCKED') {
      setDealerFeePass(null);
      window.dispatchEvent(new CustomEvent('ledger-locked'));
    }

    throw new ApiError(res.status, message, code);
  }

  return data as T;
}

/**
 * NestJS ValidationPipe는 message를 배열로 준다(필드별 오류).
 * 사용자에게는 첫 줄만 보여주면 충분하다.
 */
function extractMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const message = (data as { message?: unknown }).message;
  if (Array.isArray(message)) return message[0] as string;
  if (typeof message === 'string') return message;
  return null;
}

function extractCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

