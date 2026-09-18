import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/**
 * 주차위치 현황판 맞춰보기.
 *
 * 현장에서 쓰는 현황판 앱에 차 세운 자리와 키번호를 적는데, 같은 차를 우리 쪽에도 적고
 * 있다. 그래서 어디가 어긋났는지 — 현황판엔 있는데 재고에 없는 차, 매도했는데 아직 서
 * 있는 차, 우리 재고인데 현황판에 안 적힌 차 — 를 모아서 보여준다.
 *
 * 읽기만 한다. 여기서 고친다고 현황판이 바뀌지 않는다. 어긋난 걸 알려주는 자리다.
 */

interface Candidate {
  id: string;
  vehicleNumber: string;
  vehicleModel: string;
}

interface Slot {
  key: string;
  car: string;
  keyNo: string;
  owner: string;
  memo: string;
  statusLabel: string;
  encarDone: boolean;
  encarDoneDate: string;
  boardInspectOn: string;
  match: 'matched' | 'ambiguous' | 'unknown' | 'empty';
  vehicleNumber: string;
  vehicleModel: string;
  candidates: Candidate[];
  soldButParked: boolean;
}

interface BoardView {
  connected: boolean;
  error: string;
  readAt: string;
  room: string;
  slots: Slot[];
  missing: Candidate[];
  summary: {
    onBoard: number;
    matched: number;
    ambiguous: number;
    unknown: number;
    soldButParked: number;
    missing: number;
  };
}

type Filter = 'all' | 'issue' | 'ambiguous' | 'unknown' | 'sold' | 'missing';

const MATCH_CLASS: Record<string, string> = {
  matched: 'bg-emerald-50 text-emerald-700',
  ambiguous: 'bg-amber-50 text-amber-700',
  unknown: 'bg-red-50 text-red-600',
};

const MATCH_TEXT: Record<string, string> = {
  matched: '재고와 맞음',
  ambiguous: '확인 필요',
  unknown: '재고에 없음',
};

export default function ParkBoardPanel() {
  const [view, setView] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('issue');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await api<BoardView>('/parkboard'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '현황판을 읽지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const s = view?.summary;
  const issues = (s?.ambiguous ?? 0) + (s?.unknown ?? 0) + (s?.soldButParked ?? 0) + (s?.missing ?? 0);

  const slots = (view?.slots ?? []).filter(x => {
    if (filter === 'all') return true;
    if (filter === 'ambiguous') return x.match === 'ambiguous';
    if (filter === 'unknown') return x.match === 'unknown';
    if (filter === 'sold') return x.soldButParked;
    if (filter === 'issue') return x.match !== 'matched' || x.soldButParked;
    return false;
  });

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-5 py-3.5 text-left"
      >
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        <h2 className="text-sm font-bold text-slate-800">주차위치 현황판</h2>
        {view?.connected === false && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">못 읽음</span>
        )}
        {s && view?.connected && (
          <>
            <span className="text-xs text-slate-500">
              현황판 <b className="text-slate-700">{s.onBoard}대</b>
            </span>
            {issues > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                <AlertTriangle size={11} /> 확인할 것 {issues}건
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                재고와 다 맞습니다
              </span>
            )}
          </>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            void load();
          }}
          onKeyDown={e => e.key === 'Enter' && void load()}
          className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 다시 읽기
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="mb-3 text-xs text-slate-500">
            현장 현황판 앱을 <b>읽어서</b> 우리 재고와 맞춰봅니다. 여기서 고쳐도 현황판은 바뀌지 않습니다 —
            어긋난 곳을 찾는 자리입니다. 현황판은 차량번호를 <b>뒤 4자리</b>만 적어서, 같은 4자리가 둘이면
            차종으로 한 번 더 가려보고 그래도 안 갈리면 <b>확인 필요</b>로 둡니다.
          </p>

          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}
          {view?.error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">
              현황판을 읽지 못했습니다 — {view.error}
            </p>
          )}
          {loading && !view && <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>}

          {view && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ['issue', `확인할 것 ${issues}`],
                    ['ambiguous', `확인 필요 ${s?.ambiguous ?? 0}`],
                    ['unknown', `재고에 없음 ${s?.unknown ?? 0}`],
                    ['sold', `매도했는데 서 있음 ${s?.soldButParked ?? 0}`],
                    ['missing', `현황판에 없음 ${s?.missing ?? 0}`],
                    ['all', `전체 ${s?.onBoard ?? 0}`],
                  ] as [Filter, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      filter === key
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 우리 재고인데 현황판에 안 적힌 차 — 어디 서 있는지 아무도 모르는 차다 */}
              {filter === 'missing' ? (
                view.missing.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">재고가 전부 현황판에 있습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {view.missing.map(v => (
                      <span key={v.id} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                        <b className="font-mono text-slate-700">{v.vehicleNumber}</b>
                        <span className="ml-1 text-slate-400">{v.vehicleModel}</span>
                      </span>
                    ))}
                  </div>
                )
              ) : slots.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {filter === 'issue' ? '어긋난 곳이 없습니다.' : '해당하는 칸이 없습니다.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-xs">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50 text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">키번호</th>
                        <th className="px-3 py-2 font-medium">현황판 차량</th>
                        <th className="px-3 py-2 font-medium">우리 재고</th>
                        <th className="px-3 py-2 font-medium">담당</th>
                        <th className="px-3 py-2 font-medium">메모</th>
                        <th className="px-3 py-2 font-medium">엔카 사진</th>
                        <th className="px-3 py-2 font-medium">현황판 재검일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map(x => (
                        <tr key={x.key} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                              {x.keyNo || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-semibold text-slate-800">{x.car}</span>
                            {x.statusLabel && <span className="ml-1 text-[11px] text-slate-400">{x.statusLabel}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${MATCH_CLASS[x.match] ?? ''}`}>
                              {MATCH_TEXT[x.match]}
                            </span>
                            {x.match === 'matched' && (
                              <span className="ml-1.5 font-mono text-slate-600">{x.vehicleNumber}</span>
                            )}
                            {/* 같은 4자리가 둘 이상 — 사람이 보고 골라야 한다 */}
                            {x.match === 'ambiguous' && (
                              <span className="ml-1.5 text-slate-500">
                                {x.candidates.map(c => `${c.vehicleNumber}(${c.vehicleModel})`).join(' · ')}
                              </span>
                            )}
                            {x.soldButParked && (
                              <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                                매도했는데 서 있음
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{x.owner || '-'}</td>
                          <td className="max-w-[16rem] truncate px-3 py-2 text-slate-500" title={x.memo}>
                            {x.memo || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {x.encarDone ? (
                              <span className="font-medium text-emerald-700">{x.encarDoneDate} 완료</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{x.boardInspectOn || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-3 text-[11px] text-slate-400">
                {dayjs(view.readAt).format('M/D HH:mm')} 기준 · 방 코드 {view.room} · 1분에 한 번만 다시 읽습니다.
                엔카 사진 완료는 <b>광고 관리</b>에서 [현황판에서 가져오기]로 넣을 수 있습니다.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
