import type { AuthUser } from './auth';

/**
 * 채널톡(channel.io) 상담 위젯.
 *
 * 로그인한 뒤에만 띄운다 — 누가 문의했는지 상담 화면에서 바로 보이게 이름·직급을 같이 넘긴다.
 * 로그아웃하면 내려서 다음 사람에게 앞사람 대화가 남지 않게 한다(shutdown이 그 역할이다).
 *
 * 플러그인 키는 비밀값이 아니다 — 위젯이 브라우저에서 동작해야 해서 어차피 페이지 소스에
 * 그대로 드러난다. 채널톡도 공개 값으로 안내한다. 그래서 저장소에 둔다.
 * 반대로 채널톡 '시크릿 키' 종류는 절대 여기 넣으면 안 된다(프론트 번들 = 공개).
 */
const PLUGIN_KEY =
  (import.meta.env.VITE_CHANNEL_TALK_PLUGIN_KEY as string | undefined) ?? 'e4835ae3-76a7-4e02-a518-ed945d1f2c65';

type ChannelIOArgs = [string, ...unknown[]];

interface ChannelIOWindow extends Window {
  ChannelIO?: ((...args: unknown[]) => void) & { q?: ChannelIOArgs[]; c?: (args: IArguments) => void };
  ChannelIOInitialized?: boolean;
}

/**
 * 채널톡이 안내하는 로더.
 *
 * 스크립트가 내려오기 전에 부른 명령을 큐(ch.q)에 쌓아뒀다가, 로드되면 한꺼번에 흘려보낸다.
 * 그래서 boot를 언제 부르든 순서가 꼬이지 않는다.
 */
function loadSdk(): void {
  const w = window as ChannelIOWindow;
  if (w.ChannelIO) return;

  const queue: ChannelIOArgs[] = [];
  const ch = function (...args: unknown[]) {
    queue.push(args as ChannelIOArgs);
  } as ChannelIOWindow['ChannelIO'] & { q: ChannelIOArgs[]; c: (args: IArguments) => void };
  ch.q = queue;
  ch.c = (args: IArguments) => queue.push(Array.from(args) as ChannelIOArgs);
  w.ChannelIO = ch;

  const inject = () => {
    if (w.ChannelIOInitialized) return;
    w.ChannelIOInitialized = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
    document.head.appendChild(script);
  };

  if (document.readyState === 'complete') inject();
  else {
    window.addEventListener('DOMContentLoaded', inject);
    window.addEventListener('load', inject);
  }
}

function call(...args: unknown[]): void {
  (window as ChannelIOWindow).ChannelIO?.(...args);
}

/** 로그인한 사람 정보로 위젯을 띄운다. 이미 떠 있으면 프로필만 갱신된다. */
export function bootChannelTalk(user: AuthUser): void {
  if (!PLUGIN_KEY) return;
  loadSdk();

  call('boot', {
    pluginKey: PLUGIN_KEY,
    // 계정별로 대화가 이어지게 사번(=직원 id)을 식별자로 쓴다.
    memberId: user.id,
    profile: {
      name: user.name,
      직급: user.position,
      권한: user.role === 'ADMIN' ? '관리자' : '직원',
    },
  });
}

/** 로그아웃 — 위젯을 내리고 이 브라우저에 남은 대화 상태를 지운다. */
export function shutdownChannelTalk(): void {
  call('shutdown');
}
