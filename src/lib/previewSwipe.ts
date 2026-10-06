/**
 * 크게 띄운 사진을 끌어서 넘긴다.
 *
 * 사진을 묶음으로 띄우면 좌우 화살표로 넘어가는데, 휴대폰에서는 그 화살표가 작아서 잘
 * 안 눌린다. 손가락으로 쓸어 넘기는 게 자연스럽다.
 *
 * 확대한 상태에서는 안 넘긴다 — 그때 끄는 건 사진을 옮겨 보려는 것이지 넘기려는 게
 * 아니다. 차 사진은 번호판이나 흠집을 키워서 보는 일이 많다.
 *
 * 화살표 버튼을 대신 눌러 준다. 넘기는 일은 antd 가 들고 있고 우리가 아는 게 없다 —
 * 몇 번째 장인지, 끝 장인지, 넘어가면서 확대를 어떻게 되돌리는지 전부 저쪽 몫이다.
 * 버튼을 누르면 사람이 누른 것과 같은 길로 간다.
 *
 * 한 번만 붙인다. 사진을 띄우는 화면마다 붙이면 같은 손짓에 두 장씩 넘어간다.
 */

/** 이만큼은 끌어야 넘긴다 — 누르려다 손이 떨린 것과 가른다 */
const MIN_X = 60;

/** 가로가 세로보다 이만큼은 길어야 — 비스듬히 끈 건 안 넘긴다 */
const X_OVER_Y = 1.5;

/** 확대했다고 보는 배율 */
const ZOOMED = 1.05;

function scaleOf(el: Element): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 1;
  // matrix(a, b, c, d, tx, ty) — a 가 가로 배율이다
  const a = Number(t.slice(t.indexOf('(') + 1).split(',')[0]);
  return Number.isFinite(a) ? Math.abs(a) : 1;
}

/** 끌고 난 뒤 이 시각까지 들어오는 눌림은 안 친다 */
let swallowUntil = 0;

function inPreview(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('.ant-image-preview-wrap, .ant-image-preview-operations-wrapper');
}

export function enablePreviewSwipe(): void {
  let startX = 0;
  let startY = 0;
  let live = false;

  /*
    끌고 손을 뗀 자리를 '눌렀다'로 치지 않는다.

    사진 밖 검은 자리를 누르면 창이 닫힌다. 그런데 쓸어 넘기다 보면 손을 떼는 곳이
    사진 밖인 일이 흔하고, 브라우저는 끌기가 끝나면 그 자리에 눌림을 한 번 보낸다 —
    그래서 넘기려다 창이 닫혔다.

    넘기려고 누른 화살표는 먹지 않는다. 그건 우리가 먼저 눌러 두고 그 다음부터 막는다.
  */
  document.addEventListener(
    'click',
    e => {
      if (Date.now() > swallowUntil || !inPreview(e.target)) return;
      swallowUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    e => {
      live = false;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('.ant-image-preview-wrap')) return;
      // 화살표·도구줄 위에서 시작한 건 누르는 것이다
      if (target.closest('.ant-image-preview-operations-wrapper')) return;

      const img = document.querySelector('.ant-image-preview-img');
      if (img && scaleOf(img) > ZOOMED) return; // 확대 중 — 옮겨 보는 중이다

      live = true;
      startX = e.clientX;
      startY = e.clientY;
    },
    true,
  );

  document.addEventListener(
    'pointerup',
    e => {
      if (!live) return;
      live = false;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      /** 조금이라도 끌었으면 눌린 게 아니다 — 넘어가든 안 넘어가든 창은 안 닫힌다 */
      const dragged = Math.abs(dx) + Math.abs(dy) > 10;

      if (Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * X_OVER_Y) {
        if (dragged) swallowUntil = Date.now() + 400;
        return;
      }

      /*
        화살표는 사진과 다른 자리에 그려진다.

        antd 는 좌우 화살표와 아래 도구줄을 따로 띄운다(-operations-wrapper). 사진이
        들어 있는 칸 안에서 찾으면 아무것도 안 나와서, 쓸어도 조용히 아무 일이 없다.
        문서 전체에서 찾는다.
      */
      const button = document.querySelector<HTMLElement>(
        dx < 0 ? '.ant-image-preview-switch-right' : '.ant-image-preview-switch-left',
      );
      // 끝 장이면 저쪽이 버튼을 꺼 둔다 — 그때는 넘어가지만 않고 창은 그대로 둔다
      if (button && !button.className.includes('disabled')) button.click();

      // 우리가 누른 다음부터 막는다 — 먼저 막으면 방금 누른 것까지 먹는다
      swallowUntil = Date.now() + 400;
    },
    true,
  );
}
