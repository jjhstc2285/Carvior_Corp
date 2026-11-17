/*
 * 웹 푸시 전용 서비스워커.
 *
 * 브라우저를 닫아둔 사이에 온 알림을 띄우는 게 유일한 역할이다 —
 * 오프라인 캐시는 하지 않는다(캐시를 넣으면 배포해도 옛 화면이 남는 문제를 같이 떠안게 된다).
 *
 * 서버 src/push/push.service.ts 의 PushPayload 와 형식을 맞춰야 한다.
 */

// 새로 배포한 워커가 탭을 다 닫을 때까지 기다리지 않고 바로 일하게 한다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 형식이 안 맞아도 알림은 띄운다 — 뭔가 왔다는 것 자체가 정보다.
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '카비어 비즈';
  const options = {
    body: payload.body || '',
    // 안드로이드 알림은 SVG 를 못 읽는 경우가 있어 PNG 로 둔다.
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 tag끼리는 덮어쓴다(같은 대화 알림이 줄줄이 쌓이지 않게).
    tag: payload.tag || 'carvior-biz',
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  // 이미 열려 있는 탭이 있으면 그걸 앞으로 가져온다 — 누를 때마다 창이 늘어나지 않게.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
