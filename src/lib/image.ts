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

export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const { draw, width, height, done } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지를 처리할 수 없습니다.');
    ctx.drawImage(draw, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    done();
  }
}
