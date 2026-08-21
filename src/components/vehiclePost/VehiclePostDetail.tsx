import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Phone, X } from 'lucide-react';
import { useStore } from '../../store';
import type { VehiclePost } from '../../types';

interface Props {
  post: VehiclePost;
  onClose: () => void;
  onEdit: () => void;
}

export default function VehiclePostDetail({ post, onClose, onEdit }: Props) {
  const { state } = useStore();
  const [index, setIndex] = useState(0);
  const writer = state.employees.find(e => e.id === post.employeeId);
  const total = post.photos.length;

  // 사진이 여러 장이라 키보드 좌우로도 넘길 수 있게(모바일은 썸네일 탭)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && total > 0) setIndex(i => (i + 1) % total);
      if (e.key === 'ArrowLeft' && total > 0) setIndex(i => (i - 1 + total) % total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, total]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{post.site}</span>
              <h3 className="text-base font-bold text-slate-800">{post.vehicleModel}</h3>
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">{post.vehicleNumber}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {total > 0 && (
          <div className="mt-4 px-5">
            <div className="relative overflow-hidden rounded-xl bg-slate-100">
              <img src={post.photos[index]} alt={`${post.vehicleModel} 사진 ${index + 1}`} className="max-h-[52vh] w-full object-contain" />
              {total > 1 && (
                <>
                  <button
                    onClick={() => setIndex(i => (i - 1 + total) % total)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/45 p-1.5 text-white hover:bg-slate-900/70"
                    aria-label="이전 사진"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setIndex(i => (i + 1) % total)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/45 p-1.5 text-white hover:bg-slate-900/70"
                    aria-label="다음 사진"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/55 px-2 py-0.5 text-[11px] font-medium text-white">
                    {index + 1} / {total}
                  </span>
                </>
              )}
            </div>
            {total > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {post.photos.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? 'border-indigo-500' : 'border-transparent'}`}
                  >
                    <img src={src} alt={`썸네일 ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-slate-400">손님번호</p>
              <a href={`tel:${post.customerPhone.replace(/[^0-9+]/g, '')}`} className="mt-0.5 flex items-center gap-1 font-medium text-indigo-600 hover:underline">
                <Phone size={13} /> {post.customerPhone}
              </a>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400">등록자</p>
              <p className="mt-0.5 text-slate-700">{writer?.name ?? '알 수 없음'}</p>
            </div>
          </div>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{post.content}</p>

          <p className="mt-3 text-[11px] text-slate-400">
            {dayjs(post.createdAt).format('YYYY.MM.DD HH:mm')} 등록
            {post.updatedAt !== post.createdAt && ` · ${dayjs(post.updatedAt).format('MM.DD HH:mm')} 수정`}
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">닫기</button>
            <button onClick={onEdit} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">수정</button>
          </div>
        </div>
      </div>
    </div>
  );
}
