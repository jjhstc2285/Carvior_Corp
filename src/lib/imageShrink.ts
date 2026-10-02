/**
 * 올리기 전에 사진을 줄인다.
 *
 * 요즘 휴대폰은 한 장이 4~12MB다. 차 한 대에 여섯 장이면 50MB를 그대로 올리게 되는데,
 * 현장에서 LTE로 올리면 한 대에 몇 분씩 걸린다. 기다리다 창을 닫으면 반만 올라간 묶음이
 * 남는다.
 *
 * 화면에서 볼 사진이다. 긴 변 1600px이면 어느 화면에서든 충분하고, 그 크기로 줄이면
 * 보통 10분의 1쯤으로 준다. 흠집을 두고 다툴 때 쓰는 사진이라 더 줄이지는 않는다 —
 * 작은 흠집이 뭉개지면 사진을 찍어둔 뜻이 없다.
 *
 * 줄여서 더 커지면 원본을 그대로 올린다(이미 작은 사진이 그렇다).
 */

/** 긴 변 — 이보다 크면 줄인다 */
const MAX_EDGE = 1600;

/** JPEG 품질. 0.82 아래로 내리면 흠집 자리에 얼룩이 보이기 시작한다 */
const QUALITY = 0.82;

/** 이보다 작으면 건드리지 않는다 — 줄여봐야 몇 KB 아끼자고 다시 그릴 일이 아니다 */
const SKIP_UNDER = 300 * 1024;

export async function shrinkForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < SKIP_UNDER) return file;

  try {
    /*
      휴대폰 사진은 '세워서 찍었다'는 표시만 붙어 있고 그림 자체는 눕혀 있는 것이 많다.
      from-image 로 읽어야 보이는 대로 그려진다 — 안 그러면 줄이면서 눕는다.
    */
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // 이미 작은 사진은 다시 그리지 않는다
    if (scale === 1 && file.size < SKIP_UNDER * 4) {
      bitmap.close();
      return file;
    }

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
