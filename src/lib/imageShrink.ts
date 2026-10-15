/**
 * 올리기 전에 사진을 줄인다.
 *
 * 요즘 휴대폰은 한 장이 4~12MB다. 차 한 대에 여섯 장이면 50MB를 그대로 올리게 되는데,
 * 현장에서 LTE로 올리면 한 대에 몇 분씩 걸린다. 기다리다 창을 닫으면 반만 올라간 묶음이
 * 남는다.
 *
 * 화면에서 보고 손님에게 보내는 사진이다. 긴 변 1280px이면 어느 화면에서든 충분하고,
 * 그 크기로 줄이면 보통 스무 분의 일쯤으로 준다 — 목록을 그리는 속도도 같이 빨라진다.
 *
 * 줄이면서 왼쪽 위에 로고를 박는다. 손님에게 보내고 매물 사이트에 올리는 사진이라, 어디서
 * 돌아다니든 어느 집 차인지는 남아야 한다.
 *
 * 줄여서 더 커지면 원본을 그대로 올린다(이미 작은 사진이 그렇다).
 */

import logoUrl from '../assets/logo.jpg';

/** 긴 변 — 이보다 크면 줄인다. 화면에서 보고 손님에게 보내는 사진이라 이 정도면 된다 */
const MAX_EDGE = 1280;

/** JPEG 품질 — 올리는 속도와 목록 그리는 속도를 같이 본 값이다 */
const QUALITY = 0.72;

/** 워터마크가 사진 너비에서 차지하는 몫 */
const MARK_RATIO = 0.22;
const MARK_MIN = 120;
const MARK_MAX = 320;

/**
 * 로고에서 글자만 잘라 둔다.
 *
 * 가진 로고는 흰 바탕 정사각형이라 그대로 얹으면 흰 네모가 붙는다. 흰 바탕을 뺀 글자
 * 자리만 찾아 잘라 쓴다 — 로고를 바꿔도 다시 찾으므로 좌표를 박아두지 않는다.
 *
 * 한 번 만들어 두고 계속 쓴다. 사진마다 다시 자르면 여섯 장에 여섯 번 한다.
 */
let markPromise: Promise<HTMLCanvasElement | null> | null = null;

function loadMark(): Promise<HTMLCanvasElement | null> {
  markPromise ??= (async () => {
    try {
      const res = await fetch(logoUrl);
      const bitmap = await createImageBitmap(await res.blob());

      const full = document.createElement('canvas');
      full.width = bitmap.width;
      full.height = bitmap.height;
      const fctx = full.getContext('2d', { willReadFrequently: true });
      if (!fctx) return null;
      fctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      // 흰 바탕이 아닌 칸의 테두리를 찾는다
      const { data } = fctx.getImageData(0, 0, full.width, full.height);
      let top = full.height;
      let left = full.width;
      let right = 0;
      let bottom = 0;
      for (let y = 0; y < full.height; y += 1) {
        for (let x = 0; x < full.width; x += 1) {
          const i = (y * full.width + x) * 4;
          // 세 색이 모두 밝으면 바탕으로 본다
          if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right <= left || bottom <= top) return null;

      const cut = document.createElement('canvas');
      cut.width = right - left + 1;
      cut.height = bottom - top + 1;
      cut.getContext('2d')?.drawImage(full, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height);
      return cut;
    } catch {
      return null;
    }
  })();
  return markPromise;
}

/**
 * 왼쪽 위에 로고를 박는다.
 *
 * 흰 판을 깔고 그 위에 로고를 얹는다. 로고만 얹으면 밝은 차에서는 글자가 묻히고 어두운
 * 차에서는 흰 바탕이 도드라진다 — 판을 깔면 어느 차에서든 같게 보인다.
 */
function stamp(ctx: CanvasRenderingContext2D, mark: HTMLCanvasElement, width: number): void {
  const w = Math.round(Math.min(MARK_MAX, Math.max(MARK_MIN, width * MARK_RATIO)));
  const h = Math.round((mark.height / mark.width) * w);
  const pad = Math.round(w * 0.09);
  const edge = Math.round(width * 0.02);
  const r = Math.round(pad * 0.9);

  const boxW = w + pad * 2;
  const boxH = h + pad * 2;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#ffffff';
  // roundRect 를 모르는 옛 브라우저가 있다 — 그때는 각진 판으로 깐다
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(edge, edge, boxW, boxH, r);
    ctx.fill();
  } else {
    ctx.fillRect(edge, edge, boxW, boxH);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(mark, edge + pad, edge + pad, w, h);
  ctx.restore();
}

/**
 * @param mark 로고를 박을지. 손님에게 보내고 매물 사이트에 올리는 사진은 박고,
 *             우리끼리만 보는 증빙(병원 영수증 같은 것)은 안 박는다 — 남의 서류에
 *             우리 로고를 얹을 까닭이 없다.
 */
export async function shrinkForUpload(file: File, { mark = true } = {}): Promise<File> {
  /*
    작은 사진도 다시 그린다.

    줄일 게 없어도 로고는 박아야 한다 — 어떤 사진은 로고가 있고 어떤 사진은 없으면
    나중에 어느 쪽이 우리 사진인지 가릴 수 없다.
  */
  if (!file.type.startsWith('image/')) return file;

  try {
    /*
      휴대폰 사진은 '세워서 찍었다'는 표시만 붙어 있고 그림 자체는 눕혀 있는 것이 많다.
      from-image 로 읽어야 보이는 대로 그려진다 — 안 그러면 줄이면서 눕는다.
    */
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // 로고를 못 불러와도 사진은 올라가야 한다
    const logo = mark ? await loadMark() : null;
    if (logo) stamp(ctx, logo, canvas.width);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // 줄인 게 더 크면 원본이 낫다
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // 못 줄이면 원본을 올린다 — 줄이려다 못 올리는 쪽이 더 나쁘다
    return file;
  }
}

/** 몇 배로 줄었는지 — 화면에 "12.4MB → 0.9MB" 로 적을 때 쓴다 */
export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}
