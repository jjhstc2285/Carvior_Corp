/**
 * API 클라이언트.
 *
 * 같은 도메인에서 Apache가 /api를 NestJS로 넘겨주므로 기본 베이스는 '/api'다.
 * 개발 중 Vite dev 서버에서 쓸 때만 VITE_API_BASE로 서버 주소를 지정한다.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

const TOKEN_KEY = 'carvior-biz-token';
/** 애니원모터스 이름으로 저장돼 있던 옛 키. 한 번만 옮겨 담고 지운다 — 안 하면 전원 로그아웃된다. */
const LEGACY_TOKEN_KEY = 'anyone-motors-token';

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      token = legacy;
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  }
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
export const UNAUTHORIZED_EVENT = 'carvior-biz:unauthorized';

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

