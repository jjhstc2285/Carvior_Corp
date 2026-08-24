import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { disablePush, enablePush, fetchPushStatus, isPushSubscribed, isPushSupported, pushPermission } from '../lib/push';

/**
 * 계정 메뉴에 들어가는 '브라우저 알림' 스위치.
 *
 * 알림 켜기는 기기마다 따로 해야 한다 — 구독이 계정이 아니라 브라우저에 붙기 때문이다.
 * 서버에 VAPID 키가 없거나 브라우저가 푸시를 지원하지 않으면 아무것도 그리지 않는다
 * (눌러도 안 되는 버튼을 보여주느니 없는 편이 낫다).
 */
export default function PushToggle() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    let cancelled = false;

    void (async () => {
      try {
        const status = await fetchPushStatus();
        if (cancelled || !status.enabled) return;
        setPublicKey(status.publicKey);
        setSubscribed(await isPushSubscribed());
      } catch {
        // 상태를 못 읽으면 기능을 감춘 채로 둔다.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!publicKey) return null;

  const blocked = pushPermission() === 'denied';

  async function toggle() {
    if (!publicKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        const ok = await enablePush(publicKey);
        setSubscribed(ok);
        if (!ok) setError('브라우저에서 알림을 허용해 주세요.');
      }
    } catch {
      setError('알림 설정을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate-100">
      <button
        onClick={() => void toggle()}
        disabled={busy || blocked}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : subscribed ? (
          <Bell size={15} className="text-indigo-500" />
        ) : (
          <BellOff size={15} />
        )}
        <span className="min-w-0 flex-1">
          브라우저 알림
          <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
            {blocked ? '브라우저에서 차단됨' : subscribed ? '이 기기에서 받는 중' : '이 기기에서 받기'}
          </span>
        </span>
      </button>
      {error && <p className="px-3.5 pb-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
