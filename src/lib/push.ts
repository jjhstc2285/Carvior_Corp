import { api } from './api';

/**
 * 웹 푸시(브라우저 알림).
 *
 * socket.io 알림은 앱을 열어둔 사람에게만 간다. 창을 닫아둔 사람에게도 알리려면
 * 브라우저의 푸시 서비스를 거쳐야 하고, 그 창구가 서비스워커(public/sw.js)다.
 *
 * 흐름:
 *   1) 서버에서 VAPID 공개키를 받는다(키가 없으면 기능 자체를 감춘다)
 *   2) 알림 권한을 받고 브라우저에 구독을 만든다 → endpoint + 키 두 개가 나온다
 *   3) 그 값을 서버에 저장해두면 서버가 나중에 그 endpoint로 알림을 밀어넣는다
 *
 * 구독은 계정이 아니라 '이 브라우저'에 붙는다. 그래서 기기마다 따로 켜야 하고,
 * 같은 기기에서 계정을 바꿔 로그인하면 서버 쪽 소유자를 옮겨준다(로그인 때 sync).
 */

export interface PushStatus {
  /** 서버에 VAPID 키가 설정되어 있는가 */
  enabled: boolean;
  publicKey: string;
}

/** iOS 16.3 이하나 일부 인앱 브라우저에는 푸시가 아예 없다 — 그런 곳에선 UI를 감춘다. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission {
  return isPushSupported() ? Notification.permission : 'denied';
}

export function fetchPushStatus(): Promise<PushStatus> {
  return api<PushStatus>('/push/status');
}

let registering: Promise<ServiceWorkerRegistration> | null = null;

/** 서비스워커는 한 번만 등록한다(같은 스크립트를 다시 등록해도 같은 것을 돌려주지만 왕복을 아낀다). */
function registerWorker(): Promise<ServiceWorkerRegistration> {
  registering ??= navigator.serviceWorker.register('/sw.js').then(async (reg) => {
    // 방금 설치된 워커는 아직 활성화 전일 수 있다 — 활성화돼야 구독을 만들 수 있다.
    await navigator.serviceWorker.ready;
    return reg;
  });
  return registering;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** 이 브라우저가 지금 알림을 받도록 되어 있는가(권한 + 구독 둘 다 있어야 한다) */
export async function isPushSubscribed(): Promise<boolean> {
  if (pushPermission() !== 'granted') return false;
  return (await currentSubscription()) !== null;
}

/**
 * 알림 켜기. 권한 창이 뜨므로 반드시 사용자가 버튼을 누른 흐름에서만 호출할 것.
 * 사용자가 권한을 거부하면 false를 돌려준다(브라우저 설정에서 직접 풀기 전에는 다시 못 묻는다).
 */
export async function enablePush(publicKey: string): Promise<boolean> {
  if (!isPushSupported() || !publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await registerWorker();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let subscription = await reg.pushManager.getSubscription();
  // 서버 VAPID 키를 바꿨다면 옛 구독으로는 발송이 안 된다 — 버리고 새로 만든다.
  if (subscription && !usesKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await reg.pushManager.subscribe({
    // 소리 없이 뒤에서 뭔가 하는 푸시는 브라우저가 막는다 — 항상 알림을 띄운다는 약속.
    userVisibleOnly: true,
    applicationServerKey,
  });

  await saveSubscription(subscription);
  return true;
}

/** 알림 끄기. 서버 기록을 먼저 지우고 브라우저 구독을 해제한다. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;

  try {
    await api('/push/subscribe', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
  } catch {
    // 서버에서 못 지웠어도 구독은 해제한다 — 죽은 endpoint는 발송 때 정리된다.
  }
  await subscription.unsubscribe();
}

/**
 * 로그인할 때 조용히 맞춰준다.
 *
 * 이미 켜둔 브라우저라도 구독 정보가 서버에서 사라졌거나(구독 정리, DB 초기화)
 * 같은 기기에서 다른 계정으로 로그인했을 수 있다. 다시 저장하면 소유자까지 갱신된다.
 */
export async function syncPushSubscription(): Promise<void> {
  if (pushPermission() !== 'granted') return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await saveSubscription(subscription);
  } catch {
    // 실패해도 로그인 흐름을 막지 않는다 — 다음 로그인에 다시 시도한다.
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error('구독 키를 읽지 못했습니다.');

  // 서버 ValidationPipe가 DTO에 없는 필드(expirationTime 등)를 거부하므로 필요한 것만 보낸다.
  await api('/push/subscribe', {
    method: 'POST',
    body: { endpoint: subscription.endpoint, keys: { p256dh, auth } },
  });
}

function usesKey(subscription: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/** VAPID 공개키는 base64url 문자열로 오는데 구독 API는 바이트 배열을 받는다. */
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
