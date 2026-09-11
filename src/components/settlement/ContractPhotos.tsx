import { useRef, useState } from 'react';
import { Image } from 'antd';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 계약서 사진 — 한 장.
 *
 * 지금은 실물 계약서를 들고 본부장·대표에게 가서 결재를 받는다. 올릴 때 사진을 붙이면
 * 결재하는 쪽에서 화면으로 보고 찍을 수 있다 — 종이를 들고 다닐 일이 없다.
 *
 * 한 장만 받는다. 여러 장을 받으면 어느 게 본장인지 결재하는 쪽에서 다시 골라야 한다.
 */

export default function ContractPhotos({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const url = (value ?? '').trim();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.append('files', file);

      const { urls } = await api<{ urls: string[] }>('/settlements/purchase/contract-photos', {
        method: 'POST',
        formData: form,
      });
      // 새로 올린 것으로 갈아끼운다 — 한 장만 두는 칸이다.
      if (urls[0]) onChange(urls[0]);
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
          {url ? '사진 바꾸기' : '사진 올리기'}
        </button>
      </div>

      {/* capture 를 안 붙인다 — 찍어 올릴 수도, 앨범에서 고를 수도 있어야 한다 */}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => void upload(e.target.files)} />

      {url && (
        <div className="relative mt-2.5 inline-block">
          {/*
            계약서는 작게 봐서는 못 읽는다. 눌러서 크게 띄우고 돌리고 키울 수 있게 한다 —
            휴대폰으로 찍으면 눕거나 거꾸로 오는 일이 흔하다.
          */}
          <Image
            src={url}
            alt="계약서"
            width={96}
            height={96}
            className="rounded-lg border border-slate-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
            aria-label="사진 빼기"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 결재하는 쪽·표에서 작게 띄울 때 — 없으면 아무것도 안 그린다. */
export function ContractPhotoThumb({ value, size = 36 }: { value?: string | null; size?: number }) {
  const url = (value ?? '').trim();
  if (!url) return null;
  return (
    <Image
      src={url}
      alt="계약서"
      width={size}
      height={size}
      className="rounded border border-slate-200 object-cover"
    />
  );
}
