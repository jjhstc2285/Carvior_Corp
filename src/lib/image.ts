// 업로드한 사진을 브라우저에서 바로 축소·압축해 data URL로 만든다.
// 서버가 없어서 사진도 localStorage(약 5MB)에 들어가므로, 원본을 그대로 넣으면 몇 장 만에 꽉 찬다.
const MAX_EDGE = 1000; // 긴 변 기준 최대 픽셀
const QUALITY = 0.6; // JPEG 품질

async function loadImage(file: File): Promise<{ draw: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { draw: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // 일부 포맷(아이폰 HEIC 등)은 createImageBitmap이 실패 — 아래 <img> 방식으로 재시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
      el.src = url;
    });
    return { draw: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** 긴 변을 MAX_EDGE 로 줄여 그린 캔버스. 줄일 필요가 없어도 그대로 그린다. */
async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const { draw, width, height, done } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지를 처리할 수 없습니다.');
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    done();
  }
}

export async function fileToCompressedDataUrl(file: File): Promise<string> {
  return (await toCanvas(file)).toDataURL('image/jpeg', QUALITY);
}

/**
 * 서버로 올리기 전에 줄인다.
 *
 * 휴대폰으로 찍은 사진은 그대로 보내면 몇 MB씩 되고, 아이폰 HEIC 는 서버에서 못 여는
 * 경우도 있다. 줄이면서 JPEG 로 바꿔 둘 다 해결한다.
 *
 * 줄이지 못하면 원본을 그대로 올린다 — 사진 한 장 때문에 자리 등록을 막을 이유는 없다.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  try {
    const canvas = await toCanvas(file);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
