import { useEffect, useRef } from 'react';

/**
 * ESC 로 창 닫기.
 *
 * 창을 닫으려면 오른쪽 위 X 를 눈으로 찾아 눌러야 했다. 손은 키보드에 있는데 마우스로
 * 가야 하고, 창이 길면 X 가 화면 밖에 있기도 하다.
 *
 * 겹쳐 뜬 창은 맨 위만 닫는다.
 *
 * 매입 등록 창에서 시세 조회를 열면 창이 둘이다. 각자 ESC 를 듣게 두면 한 번 눌렀을 때
 * 둘 다 닫혀서, 적던 매입 내역까지 통째로 날아간다. 그래서 열린 차례대로 쌓아 두고
 * 맨 뒤엣것만 부른다.
 */

/** 열려 있는 창들 — 뒤엣것이 맨 위다 */
const opened: Array<() => void> = [];

let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    /*
      한글을 적는 중에는 그냥 둔다.

      조합 중에 ESC 를 누르면 적던 글자를 무르는 것이지 창을 닫으라는 뜻이 아니다 —
      그걸 닫기로 받으면 "쓰다가 ESC 눌렀는데 창이 사라졌다"가 된다.
    */
    if (e.isComposing) return;

    const top = opened[opened.length - 1];
    if (!top) return;
    e.preventDefault();
    top();
  });
}

/**
 * @param onClose 닫을 때 할 일
 * @param enabled 닫아도 되는가 — 저장하는 중처럼 막아야 할 때 false 로 둔다
 */
export function useEscClose(onClose: () => void, enabled = true): void {
  /* 닫는 함수가 그릴 때마다 새로 만들어져도 쌓아 둔 자리는 안 바뀌게 들고만 있는다 */
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    listen();
    const entry = () => latest.current();
    opened.push(entry);
    return () => {
      const i = opened.lastIndexOf(entry);
      if (i >= 0) opened.splice(i, 1);
    };
  }, [enabled]);
}
