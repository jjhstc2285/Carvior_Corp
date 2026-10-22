import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useStore } from '../../store';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { VEHICLE_POST_SITES, type AdContract, type Role } from '../../types';
import AdSpendPanel from './AdSpendPanel';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 광고 관리.
 *
 * 광고 상품은 '대당 얼마'로 팔린다 — 22만원 상품은 한 대 찍을 때마다 22만원이다.
 * 거기에 분기마다 90대를 찍어야 하는 약정이 붙는 상품이 있고, 10만원 상품처럼 대수
 * 제약이 없는 것도 있다. 돈은 달로, 약정은 분기로 봐야 해서 둘을 갈라 센다.
 *
 * 건수는 [차량 넣기]로 사람이 넣은 것만 센다 — 기간만 맞으면 모든 계약에 똑같이 붙던
 * 자동 집계는 같은 차를 여러 상품에 중복으로 세어서 뺐다.
 *
 * 월별로 접어 보여준다 — "9월에 몇 건 하고 광고비 얼마 썼나"가 실제로 보는 단위다.
 */
export default function AdModule({ role }: { role: Role }) {
  const [rows, setRows] = useState<AdContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<AdContract | null>(null);
  /* ESC 로 닫는다 — 열려 있을 때만 듣는다(안 그러면 뒤에 아무것도 없는데 자리를 차지한다) */
  useEscClose(() => setAddingTo(null), addingTo !== null);
  const [plates, setPlates] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /* 기간이 끝난 계약을 펼쳐 볼지 — 기본은 접어 둔다 */
  const [showEnded, setShowEnded] = useState(false);

  /*
    기간이 지난 계약과 지금 쓰는 계약을 가른다.

    마감일로 가린다 — '진행중' 스위치는 사람이 끄는 값이라, 계약이 끝나도 아무도
    안 끄면 그대로 남는다. 날짜는 저절로 지나간다.
  */
  const today = dayjs().format('YYYY-MM-DD');
  const ended = rows.filter(c => c.endOn < today);
  const shown = showEnded ? rows : rows.filter(c => c.endOn >= today);

  /*
    계약을 치는 건 광고팀이다.

    관리자만 열어 뒀더니 정작 계약을 적는 사람이 단추를 못 봤다 — 광고팀 팀장이 들어와도
    등록 자리가 없었다. 플랫폼과 약정 대수를 아는 사람이 적는 게 맞다.

    서버도 같은 기준으로 다시 본다. 화면에서 단추만 숨기는 건 막은 게 아니다.
  */
  const { state } = useStore();
  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  const admin = role === 'ADMIN';
  /** 계약을 적는 건 광고팀이다 — 플랫폼·약정 대수·금액을 아는 사람이 적는다 */
  const isAdmin = admin || me?.department === '광고팀';
  /*
    매물을 넣고 빼는 건 차량관리팀이다.

    계약은 광고팀이 트고, 그 계약에 어느 차를 올릴지는 차를 쥐고 있는 쪽이 안다 —
    상품화가 끝났는지, 지금 어디 세워져 있는지를 보고 넣는다.
  */
  const canPost = admin || me?.department === '차량관리팀';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AdContract[]>('/ads'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '광고 계약을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    현황판에서 엔카 사진완료 차량을 불러온다.

    현장 현황판 앱에 사진 찍은 날짜까지 이미 적혀 있다. 그걸 그대로 집어넣지는 않는다 —
    현황판은 차량번호를 뒤 4자리만 적어서 같은 4자리가 둘이면 엉뚱한 차가 들어간다.
    재고와 하나로 붙은 것만 칸에 채워 주고, 넣는 건 사람이 [넣기]를 눌러서 한다.
  */
  const [boardBusy, setBoardBusy] = useState(false);
  const pullFromBoard = async () => {
    setBoardBusy(true);
    try {
      const res = await api<{
        connected: boolean;
        error: string;
        rows: { car: string; doneDate: string; match: string; vehicleNumber: string }[];
      }>(`/parkboard/encar?month=${month}`);

      const sure = res.rows.filter(r => r.match === 'matched' && r.vehicleNumber);
      const unsure = res.rows.length - sure.length;

      // 이미 이 계약에 들어 있는 차는 빼고 채운다 — 넣어봐야 건너뛴다
      const already = new Set((addingTo?.postings ?? []).map(p => p.vehicleNumber));
      const typed = new Set(plates.split(/[\n,]/).map(v => v.trim()).filter(Boolean));
      const fresh = sure.map(r => r.vehicleNumber).filter(v => !already.has(v) && !typed.has(v));

      if (!res.connected) {
        void alertError('현황판을 읽지 못했습니다', res.error);
        return;
      }
      setPlates(prev => [...(prev.trim() ? [prev.trim()] : []), ...fresh].join('\n'));
      await alertSuccess(
        fresh.length > 0 ? `${fresh.length}대를 채웠습니다` : '새로 채울 차가 없습니다',
        [
          `${dayjs(`${month}-01`).format('M월')} 현황판에 사진완료로 찍힌 차 ${res.rows.length}대`,
          unsure > 0 ? `그중 ${unsure}대는 어느 차인지 가려지지 않아 뺐습니다 — 직접 넣으세요.` : '',
          '내용을 확인하고 [넣기]를 누르세요.',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    } catch (e) {
      void alertError('현황판을 읽지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBoardBusy(false);
    }
  };

  const addPostings = async () => {
    if (!addingTo || !plates.trim()) return;
    try {
      const res = await api<{ added: number; skipped: number }>(`/ads/${addingTo.id}/postings`, {
        method: 'POST',
        body: { vehicleNumbers: plates },
      });
      await alertSuccess(
        `${res.added}대를 넣었습니다`,
        res.skipped > 0 ? `이미 있던 ${res.skipped}대는 건너뛰었습니다.` : undefined,
      );
      setPlates('');
      setAddingTo(null);
      await load();
    } catch (e) {
      void alertError('넣지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeContract = async (c: AdContract) => {
    const ok = await confirmDanger(
      `${c.platform} ${c.productName} 계약을 지울까요?`,
      '올린 차 기록도 함께 사라집니다. 계약만 끝난 거라면 지우지 말고 "진행중"을 끄세요.',
    );
    if (!ok) return;
    try {
      await api(`/ads/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removePosting = async (postingId: string) => {
    try {
      await api(`/ads/postings/${postingId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /*
    맨 위는 '이번 달'과 '이번 분기'로 본다.

    광고비는 대당 금액 × 찍은 대수다 — 정액이 아니라 쓴 만큼 나간다. 약정은 분기라
    달과 주기가 다르다: 돈은 달로, 약정은 분기로 본다.
  */
  /*
    맨 위 숫자가 가리키는 달.

    이번 달로 못 박아 두니 지난달에 얼마 나갔는지 보려면 달력을 뒤져야 했다. 달을 고르면
    광고비·진단 대수·약정이 모두 그 달 기준으로 바뀐다.
  */
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const monthRows = rows.map(c => ({ c, count: c.postings.filter(p => p.postedOn.startsWith(month)).length }));
  const monthCount = monthRows.reduce((sum, x) => sum + x.count, 0);
  const monthFee = monthRows.reduce((sum, x) => sum + x.c.unitFee * x.count, 0);

  /** 플랫폼별로 이번 달 몇 대 — 엔카 몇 대인지가 먼저 궁금하다 */
  const byPlatform = [...monthRows.reduce((map, x) => map.set(x.c.platform, (map.get(x.c.platform) ?? 0) + x.count), new Map<string, number>())]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  /** 대수 약정이 걸린 계약의 이번 주기(분기) */
  const quotaNow = rows.map(c => c.current).filter((x): x is NonNullable<typeof x> => !!x && x.quota > 0);
  const quotaTotal = quotaNow.reduce((sum, x) => sum + x.quota, 0);
  const quotaDone = quotaNow.reduce((sum, x) => sum + x.count, 0);
  const quotaLeft = quotaNow.reduce((sum, x) => sum + x.remaining, 0);
  // 마감이 제일 급한 것에 맞춘다 — 여러 계약이면 먼저 오는 마감이 기준이다
  const quotaDays = quotaNow.length > 0 ? Math.min(...quotaNow.map(x => x.daysLeft)) : 0;
  const quotaLabel = quotaNow[0]?.label ?? '';

  /** 엔카·차차차 약정 말고 따로 나가는 광고비(구글 애즈·114 …) */
  const [otherSpend, setOtherSpend] = useState(0);
  useEffect(() => {
    void api<{ amount: number }[]>(`/ad-spends?month=${month}`)
      .then(list => setOtherSpend(list.reduce((sum, r) => sum + r.amount, 0)))
      // 못 불러와도 약정 쪽은 보여준다
      .catch(() => setOtherSpend(0));
  }, [month]);

  /*
    달마다 얼마씩 나갔는가 — 최근 열두 달.

    한 달만 보면 이번 달이 많은 건지 적은 건지 알 수 없다. 줄여야 할 달인지 판단하려면
    지난 달들과 나란히 놓고 봐야 한다.

    상품 광고비는 이미 받아둔 계약의 찍은 기록에서 센다(대당 금액 × 그 달에 찍은 대수).
    그 밖의 광고비는 달별 합계만 따로 받아온다.
  */
  const [monthlyOther, setMonthlyOther] = useState<Record<string, number>>({});
  const [trendOpen, setTrendOpen] = useState(false);

  useEffect(() => {
    void api<{ month: string; amount: number }[]>('/ad-spends/monthly?months=12')
      .then(list => setMonthlyOther(Object.fromEntries(list.map(r => [r.month, r.amount]))))
      .catch(() => setMonthlyOther({}));
  }, []);

  const monthly = useMemo(() => {
    const months: string[] = [];
    for (let i = 0; i < 12; i += 1) months.push(dayjs().subtract(i, 'month').format('YYYY-MM'));

    return months.map(m => {
      let product = 0;
      let count = 0;
      for (const c of rows) {
        const n = c.postings.filter(p => p.postedOn.startsWith(m)).length;
        product += c.unitFee * n;
        count += n;
      }
      const other = monthlyOther[m] ?? 0;
      return { month: m, product, other, total: product + other, count };
    });
  }, [rows, monthlyOther]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">광고 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            광고 상품은 <b>대당 얼마</b>로 팔립니다 — 22만원 상품은 한 대 찍을 때마다 22만원이고,
            <b>분기마다 90대</b> 같은 약정이 붙습니다. 이번 달에 얼마 나갔고 이번 분기에 몇 대 남았는지 봅니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* 맨 위 숫자가 가리키는 달 — 바꾸면 광고비·진단·약정이 같이 따라간다 */}
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value || dayjs().format('YYYY-MM'))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          {isAdmin && (
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus size={15} /> 계약 등록
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">{dayjs(`${month}-01`).format('M월')} 광고비</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {(monthFee + otherSpend).toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {/* 상품 광고비와 그 밖의 광고를 갈라 둔다 — 줄일 수 있는 쪽이 다르다 */}
          <p className="text-[11px] text-slate-400">
            상품 {monthFee.toLocaleString()}원
            {otherSpend > 0 && ` · 그 외 ${otherSpend.toLocaleString()}원`}
          </p>
        </div>


        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{dayjs(`${month}-01`).format('M월')} 진단</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {monthCount}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {byPlatform.length > 0 ? byPlatform.map(([platform, n]) => `${platform} ${n}대`).join(' · ') : '이번 달 찍은 차가 없습니다'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{quotaLabel || '이번 분기'} 약정</p>
          {quotaTotal > 0 ? (
            <>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {quotaDone}
                <span className="ml-1 text-sm font-medium text-slate-400">/ {quotaTotal}대</span>
                {quotaLeft > 0 && <span className="ml-2 text-sm font-bold text-amber-600">{quotaLeft}대 남음</span>}
              </p>
              {/* 분기 90대는 남은 날로 나눠 봐야 급한 줄 안다 */}
              <p className="text-[11px] text-slate-400">
                {quotaLeft > 0
                  ? `마감까지 ${quotaDays}일 · 하루 ${Math.ceil(quotaLeft / Math.max(1, quotaDays))}대`
                  : '이번 분기 약정을 채웠습니다'}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold text-slate-300">—</p>
              <p className="text-[11px] text-slate-400">대수 약정이 걸린 계약이 없습니다</p>
            </>
          )}
        </div>
      </div>

      {/*
        달마다 얼마씩 나갔는가.

        한 달만 보면 이번 달이 많은 건지 적은 건지 알 수 없다. 접어 두고 필요할 때 편다 —
        평소에 보는 건 이번 달이다.
      */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button
          onClick={() => setTrendOpen(v => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
        >
          <span className="text-sm font-bold text-slate-800">월별 광고비</span>
          <span className="text-[11px] text-slate-400">최근 12개월</span>
          <span className="ml-auto text-xs text-slate-400">{trendOpen ? '접기' : '펴기'}</span>
        </button>

        {trendOpen && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">달</th>
                  <th className="px-4 py-2 text-right font-medium">상품</th>
                  <th className="px-4 py-2 text-right font-medium">그 외</th>
                  <th className="px-4 py-2 text-right font-medium">합계</th>
                  <th className="px-4 py-2 text-right font-medium">찍은 대수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.map(m => (
                  <tr key={m.month} className={m.month === month ? 'bg-indigo-50/40' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700">
                      {dayjs(`${m.month}-01`).format('YYYY년 M월')}
                      {m.month === month && <span className="ml-1 text-[10px] text-indigo-600">이번 달</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m.product.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m.other.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-indigo-700">
                      {m.total.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{m.count || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-slate-400">
              상품은 대당 금액 × 그 달에 찍은 대수입니다. 그 외는 구글 애즈·114처럼 따로 적어둔 광고비입니다.
            </p>
          </div>
        )}
      </div>

      {/* 약정 계약 말고, 달마다 얼마를 썼는지만 남기는 광고 */}
      <AdSpendPanel />

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}
      {!loading && rows.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
          등록된 광고 계약이 없습니다.
        </p>
      )}

      {/*
        끝난 계약은 접어 둔다.

        기간이 지난 계약이 '진행중'으로 남아 있으면 지금 쓰는 계약과 나란히 뜬다 —
        엔카 22만원 상품이 7~9월 것과 10~12월 것으로 둘이 떠서, 어느 쪽에 찍어야
        하는지 헷갈렸다.

        지우지 않는다. 그 분기에 몇 대를 찍었고 얼마가 나갔는지는 남아야 하는 기록이라,
        눌러서 볼 수 있게만 둔다.
      */}
      {ended.length > 0 && (
        <button
          onClick={() => setShowEnded(v => !v)}
          className="mb-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <ChevronDown size={14} className={`transition-transform ${showEnded ? 'rotate-180' : ''}`} />
          기간이 끝난 계약 {ended.length}건 {showEnded ? '접기' : '보기'}
        </button>
      )}

      <div className="space-y-3">
        {shown.map(c => {
          const cur = c.current;
          const hasQuota = !!cur && cur.quota > 0;
          const pct = hasQuota ? Math.min(100, Math.round((cur.count / cur.quota) * 100)) : 0;
          // 주기 마감이 가까운데 대수가 모자라면 붉게 — 숫자만으로는 급한 줄 모른다
          const behind = hasQuota && cur.remaining > 0 && cur.daysLeft <= 14;
          const open = openId === c.id;
          const monthCountOf = c.postings.filter(p => p.postedOn.startsWith(month)).length;
          const periodQuota = c.periods.reduce((sum, m) => sum + m.quota, 0);
          const periodShort = c.periods.reduce((sum, m) => sum + m.shortfall, 0);

          return (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {c.platform}
                </span>
                <span className="text-sm font-bold text-slate-800">{c.productName || '광고 상품'}</span>
                <span className="text-xs text-slate-400">
                  대당 <b className="font-semibold text-indigo-600">{c.unitFee.toLocaleString()}원</b>
                </span>
                <span className="text-xs text-slate-400">
                  {c.quotaCycle === '없음' ? '대수 약정 없음' : `${c.quotaCycle} ${c.quotaCount}대 약정`}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {c.startOn} ~ {c.endOn}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => void removeContract(c)}
                    className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="계약 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {hasQuota ? (
                  <>
                    <span className="text-2xl font-bold text-slate-900">
                      {cur.count}
                      <span className="ml-1 text-sm font-medium text-slate-400">/ {cur.quota}대</span>
                    </span>
                    <span className="text-xs font-medium text-slate-400">{cur.label}</span>
                    <span className={`text-sm font-semibold ${behind ? 'text-red-600' : 'text-slate-500'}`}>
                      {cur.remaining > 0 ? `${cur.remaining}대 남음` : '약정을 채웠습니다'}
                    </span>
                    <span className="text-xs text-slate-400">
                      마감까지 {cur.daysLeft}일
                      {cur.remaining > 0 && cur.daysLeft > 0 && ` · 하루 ${cur.perDayNeeded}대씩 찍어야 채웁니다`}
                    </span>
                  </>
                ) : (
                  <>
                    {/* 대수 약정이 없는 상품은 채울 게 없다 — 이번 달 몇 대에 얼마인지만 본다 */}
                    <span className="text-2xl font-bold text-slate-900">
                      {monthCountOf}
                      <span className="ml-1 text-sm font-medium text-slate-400">대</span>
                    </span>
                    <span className="text-xs font-medium text-slate-400">{dayjs(`${month}-01`).format('M월')}</span>
                    <span className="text-sm font-semibold text-slate-500">
                      {(c.unitFee * monthCountOf).toLocaleString()}원
                    </span>
                    {c.quotaCycle === '없음' && <span className="text-xs text-slate-400">대수 약정 없음</span>}
                  </>
                )}
                {canPost && (
                  <button
                    onClick={() => setAddingTo(c)}
                    className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    차량 넣기
                  </button>
                )}
                <button
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {open ? '접기' : `찍은 차 ${c.used}대`}
                </button>
              </div>

              {hasQuota && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${behind ? 'bg-red-500' : pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* 주기별 집계 — 분기 약정이면 분기로 끊는다 */}
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{c.quotaCycle === '분기' ? '분기' : '달'}</th>
                      <th className="px-3 py-2 text-right font-medium">찍은 대수</th>
                      <th className="px-3 py-2 text-right font-medium">약정</th>
                      <th className="px-3 py-2 text-right font-medium">광고비</th>
                      <th className="px-3 py-2 text-right font-medium">모자람</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/*
                      지난 주기는 안 띄운다.

                      계약이 일 년이면 분기 넷이 줄줄이 늘어서는데, 이미 끝난 분기는 지금
                      할 일이 없다 — 보고 있는 달이 든 주기부터 보여준다.
                    */}
                    {c.periods
                      .filter(m => m.to > `${month}-01`)
                      .map(m => (
                      <tr key={m.from} className={`border-t border-slate-50 ${cur?.label === m.label ? 'bg-indigo-50/40' : ''}`}>
                        <td className="px-3 py-1.5 text-slate-600">{m.label}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${m.quota > 0 && m.count >= m.quota ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {m.count}대
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-400">{m.quota > 0 ? `${m.quota}대` : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{m.fee.toLocaleString()}원</td>
                        <td className={`px-3 py-1.5 text-right ${m.shortfall > 0 ? 'font-semibold text-red-600' : 'text-slate-300'}`}>
                          {m.shortfall > 0 ? `${m.shortfall}대` : '—'}
                        </td>
                      </tr>
                      ))}
                    <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
                      <td className="px-3 py-1.5 text-slate-600">합계</td>
                      <td className="px-3 py-1.5 text-right text-slate-800">{c.used}대</td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{periodQuota > 0 ? `${periodQuota}대` : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{c.totalFee.toLocaleString()}원</td>
                      <td className="px-3 py-1.5 text-right text-red-600">{periodShort > 0 ? `${periodShort}대` : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {c.note && <p className="mt-2 text-xs text-slate-400">{c.note}</p>}

              {open && (
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {c.postings.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">올린 차가 없습니다.</p>
                  )}
                  {c.postings.map(p => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-slate-50">
                      <span className="font-mono font-semibold text-slate-700">{p.vehicleNumber}</span>
                      <span className="text-slate-400">{p.postedOn}</span>
                      {/* 이 한 대에 얼마 나갔는지 */}
                      {c.unitFee > 0 && <span className="font-semibold text-indigo-600">{c.unitFee.toLocaleString()}원</span>}
                      {p.auto && (
                        <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">진단완료</span>
                      )}
                      {canPost && (
                        <button
                          onClick={() => void removePosting(p.id)}
                          className="ml-auto rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                          aria-label="빼기"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>


      {formOpen && <AdContractForm onSaved={() => void load()} onClose={() => setFormOpen(false)} />}

      {addingTo && (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-800">
              {addingTo.platform} {addingTo.productName} — 차량 넣기
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              차량번호를 줄바꿈이나 쉼표로 여러 대 넣을 수 있습니다. 이미 있는 차는 건너뜁니다.
            </p>
            <textarea
              value={plates}
              onChange={e => setPlates(e.target.value)}
              rows={6}
              placeholder={'12가3456\n34나5678'}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400"
            />
            <div className="mt-4 flex items-center gap-2">
              {/* 현황판에 사진 찍은 날짜가 이미 있다 — 다시 치지 않게 채워만 준다 */}
              <button
                onClick={() => void pullFromBoard()}
                disabled={boardBusy}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                title="주차위치 현황판에서 이번 달 엔카 사진완료로 찍힌 차를 불러옵니다"
              >
                {boardBusy ? '읽는 중…' : '현황판에서 가져오기'}
              </button>
              <button onClick={() => setAddingTo(null)} className="ml-auto rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                취소
              </button>
              <button
                onClick={() => void addPostings()}
                disabled={!plates.trim()}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                넣기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 계약 등록.
 *
 * 상품은 '대당 얼마'다 — 22만원 상품이면 한 대 찍을 때마다 22만원이고, 거기에 분기
 * 90대 같은 약정이 붙는다. 10만원 상품처럼 대수 제약이 없는 것도 있어서 약정 주기에
 * '없음'을 둔다. 마감일은 시작일과 개월 수로 서버가 낸다.
 */
function AdContractForm({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [platform, setPlatform] = useState<string>(VEHICLE_POST_SITES[0]);
  const [productName, setProductName] = useState('');
  const [unitFee, setUnitFee] = useState('');
  const [quotaCycle, setQuotaCycle] = useState('분기');
  const [quotaCount, setQuotaCount] = useState('');
  const [months, setMonths] = useState('12');
  const [startOn, setStartOn] = useState(dayjs().format('YYYY-MM-DD'));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fee = Number(digitsOnly(unitFee)) || 0;
  const quota = Number(digitsOnly(quotaCount)) || 0;
  const m = Number(digitsOnly(months)) || 0;
  const noQuota = quotaCycle === '없음';

  const submit = async () => {
    if (!platform.trim() || fee <= 0 || m <= 0) {
      setError('플랫폼과 대당 금액, 개월 수는 반드시 적어야 합니다.');
      return;
    }
    if (!noQuota && quota <= 0) {
      setError('약정 대수를 적거나, 대수 제약이 없으면 약정을 [없음]으로 두세요.');
      return;
    }
    setSaving(true);
    try {
      await api('/ads', {
        method: 'POST',
        body: {
          platform,
          productName,
          unitFee: fee,
          quotaCycle,
          quotaCount: noQuota ? 0 : quota,
          months: m,
          startOn,
          note,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const INPUT = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';
  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-800">광고 계약 등록</h3>
        <p className="mt-1 text-xs text-slate-500">
          상품은 대당 금액으로 적습니다. 22만원 상품이면 <b>220,000</b>원, 약정은 <b>분기 90대</b>입니다.
          10만원 상품처럼 대수 제약이 없으면 약정을 <b>없음</b>으로 두세요.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {field(
            '플랫폼 *',
            <select value={platform} onChange={e => setPlatform(e.target.value)} className={INPUT}>
              {VEHICLE_POST_SITES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>,
          )}
          {field('상품명', <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="22만원 상품" className={INPUT} />)}
          {field(
            '대당 금액(원) *',
            <input value={unitFee} onChange={e => setUnitFee(withCommas(e.target.value))} inputMode="numeric" placeholder="220,000" className={`${INPUT} text-right`} />,
          )}
          {field(
            '약정 주기',
            <select value={quotaCycle} onChange={e => setQuotaCycle(e.target.value)} className={INPUT}>
              <option value="분기">분기</option>
              <option value="월">월</option>
              <option value="없음">없음 (대수 제약 없음)</option>
            </select>,
          )}
          {field(
            noQuota ? '약정 대수' : '약정 대수 *',
            <input
              value={noQuota ? '' : quotaCount}
              onChange={e => setQuotaCount(digitsOnly(e.target.value))}
              disabled={noQuota}
              inputMode="numeric"
              placeholder={noQuota ? '제약 없음' : '90'}
              className={`${INPUT} text-right disabled:bg-slate-50`}
            />,
          )}
          {field(
            '개월 수 *',
            <input value={months} onChange={e => setMonths(digitsOnly(e.target.value))} inputMode="numeric" placeholder="12" className={`${INPUT} text-right`} />,
          )}
          {field('시작일 *', <input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} className={INPUT} />)}
          <div className="col-span-2">
            {field('메모', <input value={note} onChange={e => setNote(e.target.value)} className={INPUT} />)}
          </div>
        </div>

        {/* 등록 전에 눈으로 확인하게 — 분기 90대면 1년에 360대, 대당 22만원이면 7,920만원이다 */}
        {fee > 0 && m > 0 && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {noQuota ? (
              <>대당 <b>{fee.toLocaleString()}원</b> · 대수 약정 없음</>
            ) : (
              <>
                {quotaCycle} <b>{quota}대</b> · 기간 전체 <b>{quota * (quotaCycle === '분기' ? Math.ceil(m / 3) : m)}대</b> ·
                다 채우면 <b>{(fee * quota * (quotaCycle === '분기' ? Math.ceil(m / 3) : m)).toLocaleString()}원</b>
              </>
            )}
            <br />
            {startOn} ~ {dayjs(startOn).add(m, 'month').subtract(1, 'day').format('YYYY-MM-DD')}
          </p>
        )}

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '등록하는 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
