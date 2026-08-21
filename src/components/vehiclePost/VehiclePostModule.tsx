import { useState } from 'react';
import dayjs from 'dayjs';
import { Images, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { VEHICLE_POST_SITES, type VehiclePost } from '../../types';
import VehiclePostForm from './VehiclePostForm';
import VehiclePostDetail from './VehiclePostDetail';

interface Props {
  role: 'employee' | 'admin';
}

export default function VehiclePostModule({ role }: Props) {
  const { state, deleteVehiclePost } = useStore();
  const [query, setQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehiclePost | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 게시판은 누구나 전체 글을 본다 — 직원/관리자 구분 없이 같은 목록
  const filtered = state.vehiclePosts
    .filter(p => siteFilter === 'all' || p.site === siteFilter)
    .filter(p => {
      const q = query.trim();
      if (!q) return true;
      return p.vehicleNumber.includes(q) || p.vehicleModel.includes(q) || p.customerPhone.includes(q) || p.content.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const detail = detailId ? state.vehiclePosts.find(p => p.id === detailId) ?? null : null;
  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매물 사진 등록</h1>
          <p className="mt-1 text-sm text-slate-500">사이트 업로드용 차량 정보와 사진을 올려두면 전 직원이 같이 볼 수 있어요.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 매물 등록
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차명·손님번호 검색"
          className="w-60 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">전체 사이트</option>
          {VEHICLE_POST_SITES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-400">총 {filtered.length}건</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Images size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">등록된 매물이 없습니다. 우측 상단 &lsquo;매물 등록&rsquo;으로 사진과 함께 올려보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(post => (
            <div key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
              <button onClick={() => setDetailId(post.id)} className="block w-full text-left">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {post.photos[0]
                    ? <img src={post.photos[0]} alt={`${post.vehicleModel} 대표사진`} className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-slate-300"><Images size={24} /></div>}
                  <span className="absolute left-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] font-semibold text-white">{post.site}</span>
                  {post.photos.length > 1 && (
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-900/55 px-2 py-0.5 text-[11px] font-medium text-white">
                      <Images size={11} /> {post.photos.length}
                    </span>
                  )}
                </div>
                <div className="px-4 pt-3">
                  <p className="truncate text-sm font-bold text-slate-800">{post.vehicleModel}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{post.vehicleNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500">손님 {post.customerPhone}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{post.content}</p>
                </div>
              </button>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[11px] text-slate-400">
                  {employeeOf(post.employeeId)?.name ?? '알 수 없음'} · {dayjs(post.createdAt).format('M/D HH:mm')}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(post); setFormOpen(true); }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">수정</button>
                  {(role === 'admin' || post.employeeId === state.currentEmployeeId) && (
                    <button onClick={() => { if (confirm('이 매물 글을 삭제할까요?')) deleteVehiclePost(post.id); }}
                      className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="삭제">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && !formOpen && (
        <VehiclePostDetail
          post={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => { setEditing(detail); setDetailId(null); setFormOpen(true); }}
        />
      )}
      {formOpen && (
        <VehiclePostForm editing={editing} defaultEmployeeId={state.currentEmployeeId} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
