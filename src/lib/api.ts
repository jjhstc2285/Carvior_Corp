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

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers['X-Device-Token'] = device.token;
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
    throw new ApiError(res.status, message);
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

export async function uploadPhotos(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await api<{ urls: string[] }>('/vehicle-posts/photos', { method: 'POST', formData: form });
  return res.urls;
}
