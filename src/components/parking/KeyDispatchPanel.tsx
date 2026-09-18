import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, ExternalLink, KeyRound, MapPinned, Phone, RefreshCw, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

/**
 * 키 불출 이력.
 *
 * 방문 딜러가 QR 을 찍어 키를 달라고 하면 그 앱(any-one.netlify.app)에 한 줄이 쌓인다 —
 * 누가(이름·번호·소속 상사), 어느 차를, 언제, 어디서 가져갔는지. 돌려주면 반납으로 찍힌다.
 *
 * 그동안 이 기록은 그 앱 안에만 있어서, 차가 지금 나가 있는지 물어보려면 휴대폰으로 그
 * 앱을 열어야 했다. 여기서 같이 본다. 읽기만 한다.
 *
 * 색으로 가른다 — 목록을 읽지 않고 색만 봐도 급한 게 보여야 한다.
 *  - 초록: 돌려받음
 *  - 주황: 빌려갔고 아직 두 시간이 안 지남 — 정상이다
 *  - 빨강: 두 시간이 지났는데 안 들어옴. 시승이 두 시간을 넘길 일이 없다
 */

/** 이 시간을 넘겨 안 들어오면 빨강 */
const OVERDUE_HOURS = 2;

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
  /** 딜러가 약도(QR)를 열어본 때 — 비어 있으면 아직 안 봤다 */
  scannedAt: string;
  vehicleNumber: string;
  vehicleModel: string;
}

/**
 * 메모에 약도 링크가 들어 있는 건이 있다.
 *
 * 키를 내주면서 '차가 어디 세워져 있는지' 보여주는 쪽지(view.html)를 QR·문자로 보내는데,
 * 그 주소가 메모에 통째로 들어간다. 표에서는 글자가 잘려 아무 뜻이 없어서, 링크면 단추로
 * 바꿔 준다.
 */
function linkOf(memo: string): string {
  const m = (memo ?? '').match(/https?:\/\/\S+/);
  return m ? m[0] : '';
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
  /** 메모를 펼쳐 볼 건 — 표에서는 잘려서 무슨 말인지 알 수 없다 */
  const [memoOf, setMemoOf] = useState<KeyRow | null>(null);

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

  /*
    지금 시각으로 가른다. 서버에서 한 번 계산해 내려주면 화면을 열어둔 동안 색이 안 바뀐다 —
    두 시간이 지나는 걸 봐야 하는 자리라 볼 때마다 다시 센다.
  */
  const mark = (r: KeyRow): 'back' | 'out' | 'late' => {
    if (r.returned) return 'back';
    const hours = r.at ? dayjs().diff(dayjs(r.at), 'minute') / 60 : 0;
    return hours >= OVERDUE_HOURS ? 'late' : 'out';
  };

  const all = view?.rows ?? [];
  const late = all.filter(r => mark(r) === 'late').length;
  const out = all.filter(r => mark(r) === 'out').length;

  const rows = all.filter(r => !outOnly || !r.returned);
  const today = dayjs().format('YYYY-MM-DD');
  const todayCount = all.filter(r => r.at.slice(0, 10) === today).length;

  /** 얼마나 지났는지 — '3시간 20분째' */
  const elapsed = (at: string) => {
    if (!at) return '';
    const m = dayjs().diff(dayjs(at), 'minute');
    if (m < 60) return `${m}분째`;
    const h = Math.floor(m / 60);
    return m % 60 === 0 ? `${h}시간째` : `${h}시간 ${m % 60}분째`;
  };

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
            {/* 두 시간 넘긴 것부터 — 이게 이 화면을 여는 이유다 */}
            {late > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                안 들어온 키 {late}개
              </span>
            )}
            {out > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                빌려간 키 {out}개
              </span>
            )}
            {late === 0 && out === 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
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
            <br />
            빌려간 키는 <b className="text-amber-700">주황</b>, <b>두 시간</b>이 지나도 안 들어오면{' '}
            <b className="text-red-600">빨강</b>, 돌려받으면 <b className="text-emerald-700">초록</b>입니다.
            <br />
            <b>약도</b> 칸은 키를 내주며 보낸 <b>차 위치 안내 QR</b>을 딜러가 열어봤는지입니다 — 안 열었으면
            아직 차를 못 찾고 있을 수 있습니다. 메모를 누르면 전체 내용과 약도가 열립니다.
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
                  아직 안 들어온 키만 {late + out}
                </button>
                <span className="text-xs text-slate-400">전체 {view.summary.total}건</span>
                <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <i className="inline-block size-2.5 rounded-sm bg-red-600" /> 두 시간 넘김
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="inline-block size-2.5 rounded-sm bg-amber-400" /> 빌려감
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="inline-block size-2.5 rounded-sm bg-emerald-500" /> 반납
                  </span>
                </span>
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
                        <th className="px-3 py-2 font-medium">약도</th>
                        <th className="px-3 py-2 font-medium">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const state = mark(r);
                        return (
                        <tr
                          key={r.id}
                          className={`border-b border-slate-50 last:border-0 ${
                            state === 'late' ? 'bg-red-50/70' : state === 'out' ? 'bg-amber-50/50' : ''
                          }`}
                        >
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
                          {/* 재검과 같은 방식 — 색 상자 하나로 급한 것이 보이게 */}
                          <td className="whitespace-nowrap px-3 py-2">
                            {state === 'back' ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                                반납{r.returnLoc && ` · ${r.returnLoc}`}
                              </span>
                            ) : state === 'out' ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                                빌려감 · {elapsed(r.at)}
                              </span>
                            ) : (
                              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                                안 들어옴 · {elapsed(r.at)}
                              </span>
                            )}
                          </td>
                          {/* 딜러가 약도를 열었는지 — 안 열었으면 아직 차를 못 찾고 있을 수 있다 */}
                          <td className="whitespace-nowrap px-3 py-2">
                            {r.scannedAt ? (
                              <span className="text-emerald-700">봄 {dayjs(r.scannedAt).format('HH:mm')}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="max-w-[13rem] px-3 py-2">
                            {r.memo ? (
                              <button
                                onClick={() => setMemoOf(r)}
                                className="block max-w-full truncate text-left text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-indigo-600"
                                title="눌러서 전체 보기"
                              >
                                {linkOf(r.memo) ? '🗺️ 약도 링크' : r.memo}
                              </button>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
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

      {memoOf && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMemoOf(null)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {memoOf.vehicleNumber || memoOf.car}
                  <span className="ml-2 text-sm font-medium text-slate-400">{memoOf.dealer}</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {memoOf.at ? dayjs(memoOf.at).format('M/D HH:mm') : ''} 불출
                  {memoOf.company && ` · ${memoOf.company}`}
                </p>
              </div>
              <button
                onClick={() => setMemoOf(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            {/*
              약도 링크면 단추로 연다. 딜러에게 QR·문자로 보내는 그 쪽지와 같은 화면이라
              "차를 어디에 세워뒀는지"가 그대로 보인다.
            */}
            {linkOf(memoOf.memo) && (
              <a
                href={linkOf(memoOf.memo)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <MapPinned size={15} /> 약도 열기 <ExternalLink size={13} />
              </a>
            )}

            <p className="mt-3 whitespace-pre-wrap break-all rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700">
              {memoOf.memo}
            </p>

            <p className="mt-2 text-[11px] text-slate-400">
              {memoOf.scannedAt
                ? `딜러가 ${dayjs(memoOf.scannedAt).format('M/D HH:mm')} 에 약도를 열어봤습니다.`
                : '딜러가 아직 약도를 열지 않았습니다.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
