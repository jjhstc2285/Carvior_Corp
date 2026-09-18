import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, KeyRound, Phone, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/**
 * 키 불출 이력.
 *
 * 방문 딜러가 QR 을 찍어 키를 달라고 하면 그 앱(any-one.netlify.app)에 한 줄이 쌓인다 —
 * 누가(이름·번호·소속 상사), 어느 차를, 언제, 어디서 가져갔는지. 돌려주면 반납으로 찍힌다.
 *
 * 그동안 이 기록은 그 앱 안에만 있어서, 차가 지금 나가 있는지 물어보려면 휴대폰으로 그
 * 앱을 열어야 했다. 여기서 같이 본다. 읽기만 한다.
 */

interface KeyRow {
  id: string;
  at: string;
  car: string;
  dealer: string;
  phone: string;
  company: string;
  union: string;
  loc: string;
  returned: boolean;
  returnLoc: string;
  memo: string;
  vehicleNumber: string;
  vehicleModel: string;
}

interface KeyView {
  connected: boolean;
  error: string;
  readAt?: string;
  room?: string;
  rows: KeyRow[];
  summary: { total: number; out: number; outCars: string[] } | null;
}

export default function KeyDispatchPanel() {
  const [view, setView] = useState<KeyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [outOnly, setOutOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await api<KeyView>('/parkboard/keys?limit=50'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '키 불출 이력을 읽지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = (view?.rows ?? []).filter(r => !outOnly || !r.returned);
  const today = dayjs().format('YYYY-MM-DD');
  const todayCount = (view?.rows ?? []).filter(r => r.at.slice(0, 10) === today).length;

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(v => !v)} className="flex w-full flex-wrap items-center gap-2 px-5 py-3.5 text-left">
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        <KeyRound size={15} className="text-amber-500" />
        <h2 className="text-sm font-bold text-slate-800">키 불출 이력</h2>
        {view?.connected === false && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">못 읽음</span>
        )}
        {view?.summary && (
          <>
            {view.summary.out > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                안 돌아온 키 {view.summary.out}개
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                다 반납됨
              </span>
            )}
            <span className="text-xs text-slate-400">오늘 {todayCount}건</span>
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
            방문 딜러가 QR 로 키를 가져간 기록입니다. 그 앱을 <b>읽기만</b> 합니다 — 여기서 반납 처리는 안 됩니다.
            차량번호는 뒤 4자리로 적혀 있어, 우리 재고와 <b>하나로 붙는 것만</b> 전체 번호를 같이 보여줍니다.
          </p>

          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}
          {view?.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{view.error}</p>}
          {loading && !view && <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>}

          {view?.summary && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setOutOnly(v => !v)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    outOnly
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  안 돌아온 키만 {view.summary.out}
                </button>
                <span className="text-xs text-slate-400">전체 {view.summary.total}건</span>
              </div>

              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {outOnly ? '안 돌아온 키가 없습니다.' : '기록이 없습니다.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-xs">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50 text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">가져간 때</th>
                        <th className="px-3 py-2 font-medium">차량</th>
                        <th className="px-3 py-2 font-medium">딜러</th>
                        <th className="px-3 py-2 font-medium">연락처</th>
                        <th className="px-3 py-2 font-medium">상사</th>
                        <th className="px-3 py-2 font-medium">조합</th>
                        <th className="px-3 py-2 font-medium">위치</th>
                        <th className="px-3 py-2 font-medium">반납</th>
                        <th className="px-3 py-2 font-medium">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className={`border-b border-slate-50 last:border-0 ${r.returned ? '' : 'bg-amber-50/40'}`}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                            {r.at ? dayjs(r.at).format('M/D HH:mm') : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className="font-mono font-semibold text-slate-800">{r.vehicleNumber || r.car}</span>
                            {r.vehicleModel && <span className="ml-1 text-slate-400">{r.vehicleModel}</span>}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-700">{r.dealer || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {r.phone ? (
                              <a
                                href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                                className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:underline"
                              >
                                <Phone size={11} /> {r.phone}
                              </a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{r.company || '-'}</td>
                          <td className="px-3 py-2">
                            {/* 조합 미가입 딜러는 사고가 났을 때 걸 데가 없다 — 눈에 띄게 둔다 */}
                            {r.union === '가입' ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                가입
                              </span>
                            ) : r.union === '미가입' ? (
                              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                                미가입
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{r.loc || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {r.returned ? (
                              <span className="text-emerald-700">반납{r.returnLoc && ` · ${r.returnLoc}`}</span>
                            ) : (
                              <span className="font-bold text-amber-700">나가 있음</span>
                            )}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2 text-slate-500" title={r.memo}>
                            {r.memo || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-3 text-[11px] text-slate-400">
                {view.readAt ? dayjs(view.readAt).format('M/D HH:mm') : ''} 기준 · 방 코드 {view.room} ·
                그 앱이 <b>마지막 50건</b>만 들고 있어 그 앞은 읽을 수 없습니다 — 더 오래 남기려면 그 앱 쪽을
                고쳐야 합니다.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
