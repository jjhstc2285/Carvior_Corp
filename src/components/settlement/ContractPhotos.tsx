import { useRef, useState } from 'react';
import { Image } from 'antd';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { shrinkForUpload } from '../../lib/imageShrink';
import { alertError } from '../../lib/alert';

/**
 * 계약서 사진.
 *
 * 지금은 실물 계약서를 들고 본부장·대표에게 가서 결재를 받는다. 올릴 때 사진을 붙이면
 * 결재하는 쪽에서 화면으로 보고 찍을 수 있다 — 종이를 들고 다닐 일이 없다.
 *
 * 매입은 한 장이다. 알선은 계약서 말고도 위임장·신분증·입금증처럼 같이 봐야 하는 종이가
 * 여러 장이라 일곱 장까지 받는다(max 로 가른다).
 *
 * 여러 장이어도 표와 결재함에는 맨 앞 한 장만 띄운다 — 줄마다 일곱 장이 깔리면 표를
 * 못 읽는다. 눌러 열면 나머지가 슬라이드로 넘어간다.
 */

/** 한 장이면 그대로, 여러 장이면 줄바꿈으로 이어 한 칸에 담는다 */
const SEP = '\n';

/**
 * 담긴 글자를 사진 목록으로 — 예전에 올린 한 장짜리도 그대로 읽힌다.
 *
 * 쉼표로도 끊는다. 손으로 고치거나 다른 화면에서 붙여 온 값이 섞여 들어올 수 있다.
 */
export function splitPhotos(value?: string | null): string[] {
  return (value ?? '')
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

export default function ContractPhotos({
  value,
  onChange,
  max = 1,
  title = '계약서 사진',
  hint,
  endpoint = '/settlements/purchase/contract-photos',
  watermark = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /** 받을 장수 — 매입은 한 장, 알선은 일곱 장 */
  max?: number;
  /*
    계약서 말고 다른 사진도 이 칸으로 받는다.

    근태 신청의 증빙 사진이 그렇다 — 올려서 경로를 받고, 줄바꿈으로 이어 한 칸에 담고,
    맨 앞 한 장만 표에 띄우는 일이 똑같다. 이름과 올릴 주소만 갈아끼운다.
  */
  title?: string;
  hint?: string;
  endpoint?: string;
  /** 로고를 박을지 — 손님에게 보내는 사진만 박는다 */
  watermark?: boolean;
}) {
  const urls = splitPhotos(value).slice(0, max);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const room = max - urls.length;

  const upload = async (files: FileList | null) => {
    /*
      고른 차례대로 올린다.

      맨 앞 한 장이 대표 사진이 되므로 순서가 뜻을 가진다 — 찍은 시각으로 다시 줄
      세우면 고른 차례가 흐트러진다.
    */
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    const taking = max === 1 ? picked.slice(0, 1) : picked.slice(0, Math.max(room, 0));
    if (taking.length === 0) {
      void alertError('더 올릴 자리가 없습니다', `사진은 ${max}장까지 올립니다. 한 장을 빼고 올려 주세요.`);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      // 계약서도 휴대폰으로 찍는다 — 올리기 전에 줄인다(차량 사진과 같은 식)
      for (const file of taking) form.append('files', await shrinkForUpload(file, { mark: watermark }));

      const { urls: got } = await api<{ urls: string[] }>(endpoint, {
        method: 'POST',
        formData: form,
      });
      // 한 장만 두는 칸이면 갈아끼우고, 여러 장이면 뒤에 붙인다.
      onChange(max === 1 ? (got[0] ?? '') : [...urls, ...got].slice(0, max).join(SEP));
      if (picked.length > taking.length) {
        void alertError(
          '몇 장은 올리지 않았습니다',
          `사진은 ${max}장까지 올립니다. 고른 ${picked.length}장 중 앞 ${taking.length}장만 올렸습니다.`,
        );
      }
    } catch (e) {
      void alertError('사진을 올리지 못했습니다', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (i: number) => onChange(urls.filter((_, n) => n !== i).join(SEP));

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <p className="shrink-0 text-xs font-semibold text-slate-600">{title}</p>
        <span className="text-[11px] text-slate-400">
          {hint ?? '올려두면 결재하는 분이 화면으로 보고 찍습니다 — 종이를 들고 갈 필요가 없습니다'}
          {max > 1 && ` · ${max}장까지, 맨 앞 사진이 표에 보입니다`}
        </span>
        <button
          type="button"
          disabled={busy || (max > 1 && room <= 0)}
          onClick={() => inputRef.current?.click()}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {max === 1 ? (urls.length > 0 ? '사진 바꾸기' : '사진 올리기') : `사진 올리기 (${urls.length}/${max})`}
        </button>
      </div>

      {/* capture 를 안 붙인다 — 찍어 올릴 수도, 앨범에서 고를 수도 있어야 한다 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        hidden
        onChange={e => void upload(e.target.files)}
      />

      {urls.length > 0 && (
        /*
          계약서는 작게 봐서는 못 읽는다. 눌러서 크게 띄우고 돌리고 키울 수 있게 한다 —
          휴대폰으로 찍으면 눕거나 거꾸로 오는 일이 흔하다.

          한 묶음으로 묶어 두면 크게 띄운 채로 다음 장으로 넘어간다 — 닫고 다시 누를
          일이 없다.
        */
        <Image.PreviewGroup>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {urls.map((url, i) => (
              <div key={url} className="relative">
                <Image
                  src={url}
                  alt={i === 0 ? '계약서(대표)' : `계약서 ${i + 1}`}
                  width={96}
                  height={96}
                  className="rounded-lg border border-slate-200 object-cover"
                />
                {max > 1 && i === 0 && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-slate-900/70 px-1 text-[10px] font-semibold text-white">
                    대표
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
                  aria-label="사진 빼기"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </Image.PreviewGroup>
      )}
    </div>
  );
}

/**
 * 결재하는 쪽·표에서 작게 띄울 때 — 없으면 아무것도 안 그린다.
 *
 * 여러 장이어도 맨 앞 한 장만 그린다. 나머지는 안 보이게 같은 묶음에 넣어 둔다 — 눌러
 * 열면 그대로 슬라이드로 넘어가고, 표에는 줄 높이가 그대로 남는다.
 */
export function ContractPhotoThumb({
  value,
  size = 36,
  alt = '계약서',
}: {
  value?: string | null;
  size?: number;
  /** 무슨 사진인지 — 근태 증빙처럼 계약서가 아닌 데서도 쓴다 */
  alt?: string;
}) {
  const urls = splitPhotos(value);
  if (urls.length === 0) return null;

  return (
    <Image.PreviewGroup>
      <div className="relative inline-block leading-none">
        <Image
          src={urls[0]}
          alt={alt}
          width={size}
          height={size}
          className="rounded border border-slate-200 object-cover"
        />
        {urls.length > 1 && (
          <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-slate-900/80 px-1 text-[9px] font-bold leading-4 text-white">
            {urls.length}
          </span>
        )}
      </div>
      {/* 넘겨 볼 나머지 — 자리를 차지하지 않게 숨겨만 둔다 */}
      <div className="hidden">
        {urls.slice(1).map(url => (
          <Image key={url} src={url} alt={alt} />
        ))}
      </div>
    </Image.PreviewGroup>
  );
}
