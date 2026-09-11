import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 계약서 사진.
 *
 * 지금은 실물 계약서를 들고 본부장·대표에게 가서 결재를 받는다. 올릴 때 사진을 붙이면
 * 결재하는 쪽에서 화면으로 보고 찍을 수 있다 — 종이를 들고 다닐 일이 없다.
 *
 * 앞장·뒷장·특약까지 여러 장이라 경로를 줄바꿈으로 이어 담는다.
 */

/** 경로를 잇는 글자 — 줄바꿈이다. 코드에 그대로 적으면 문자열이 끊긴다. */
const SEP = String.fromCharCode(10);

/** 줄바꿈으로 이어 담은 경로를 목록으로 */
export function photoList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

export default function ContractPhotos({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const urls = photoList(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);

      const { urls: added } = await api<{ urls: string[] }>('/settlements/purchase/contract-photos', {
        method: 'POST',
        formData: form,
      });
      onChange([...urls, ...added].join(SEP));
    } catch (e) {
      void alertError('사진을 올리지 못했습니다', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-slate-600">계약서 사진</p>
        <span className="text-[11px] text-slate-400">
          올려두면 결재하는 분이 화면으로 보고 찍습니다 — 종이를 들고 갈 필요가 없습니다
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          사진 추가
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => void upload(e.target.files)}
      />

      {urls.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {urls.map(url => (
            <div key={url} className="relative">
              {/* 눌러서 원본을 새 창으로 — 계약서는 작게 봐서는 못 읽는다 */}
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="계약서"
                  className="size-20 rounded-lg border border-slate-200 object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => onChange(urls.filter(u => u !== url).join('\n'))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
                aria-label="사진 빼기"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
