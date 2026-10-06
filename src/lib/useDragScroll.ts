import { useEffect, useRef } from 'react';

/**
 * 표를 끌어서 옆으로 넘긴다.
 *
 * 정산 표는 칸이 스무 개가 넘어 화면 밖으로 한참 나간다. 지금은 맨 아래 가느다란
 * 스크롤바를 잡거나 Shift를 누른 채 휠을 굴려야 하는데, 둘 다 표를 보다 말고 손이
 * 딴 데로 가는 일이다. 표 위 아무 데나 잡고 끌면 그만이다.
 *
 * 마우스에서만 동작한다. 손가락은 이미 쓸어서 넘어가므로 여기서 또 움직이면 두 배로 민다.
 *
 * 누르는 것과 끄는 것을 가른다. 4px 넘게 움직여야 끄는 것으로 보고, 끌고 놓은 자리에서는
 * 눌린 것으로 치지 않는다 — 안 그러면 표를 옆으로 밀 때마다 그 줄이 열린다.
 *
 * 제목줄에서는 안 잡는다. 거기는 끌어서 칸 순서를 바꾸는 자리다.
 */

/** 여기서 시작한 끌기는 넘기는 게 아니다 — 누르거나 적거나 칸을 옮기는 자리다 */
const SKIP = 'button, a, input, select, textarea, label, th, [draggable="true"]';

/** 이만큼 움직여야 끄는 것으로 본다 */
const SLOP = 4;

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let active = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let fromLeft = 0;
    let fromTop = 0;

    const down = (e: PointerEvent) => {
      // 손가락·펜은 그대로 둔다 — 이미 쓸어서 넘어간다
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if ((e.target as HTMLElement).closest?.(SKIP)) return;

      active = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      fromLeft = el.scrollLeft;
      fromTop = el.scrollTop;
    };

    const move = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < SLOP) return;

      if (!moved) {
        moved = true;
        el.style.cursor = 'grabbing';
        // 끄는 동안 글자가 파랗게 잡히면 표가 아니라 글을 긁는 것처럼 보인다
        el.style.userSelect = 'none';
      }
      el.scrollLeft = fromLeft - dx;
      el.scrollTop = fromTop - dy;
    };

    const up = () => {
      if (!active) return;
      active = false;
      el.style.cursor = '';
      el.style.userSelect = '';

      if (moved) {
        /*
          끌고 놓은 자리에서 눌린 것으로 치지 않는다.

          브라우저는 끌기가 끝나면 그 자리에 click 을 한 번 보낸다. 그대로 두면 표를
          옆으로 밀 때마다 손을 뗀 줄이 열린다.
        */
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', swallow, { capture: true, once: true });
        // 끌었는데 click 이 안 오는 경우도 있다 — 남겨 두면 다음 한 번을 먹는다
        setTimeout(() => el.removeEventListener('click', swallow, true), 0);
      }
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return ref;
}
