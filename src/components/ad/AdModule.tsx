import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { VEHICLE_POST_SITES, type AdContract, type Role } from '../../types';
import AdSpendPanel from './AdSpendPanel';

/**
 * 광고 관리.
 *
 * 광고 상품은 '월 몇 대'로 팔린다 — 22만원짜리가 월 30대, 3개월이면 90대다.
 * 3달에 30대만 올리면 60대분이 그냥 날아가는데, 지금까지는 몇 대 썼는지 볼 데가 없었다.
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
  const [plates, setPlates] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const isAdmin = role === 'ADMIN';

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
    맨 위는 '이번 달'로 본다.

    계약 전체 기간을 더해 놓으면 "광고비 96만"처럼 이번 달에 안 나가는 돈이 찍힌다 —
    이번 달에 얼마가 나가고 몇 대를 해야 하는지를 보려고 여는 화면이다.
  */
  const month = dayjs().format('YYYY-MM');
  const today = dayjs().format('YYYY-MM-DD');
  /*
    계약은 시작일 기준으로 한 달씩 끊긴다(9/15 시작이면 9/15~10/14) — 달력의 달과 안 맞는다.
    그래서 '오늘이 들어 있는 한 달'을 고른다. 이미 끝났거나 아직 시작 안 한 계약은 빠진다.
  */
  const thisMonth = rows.flatMap(c => {
    if (c.startOn > today || c.endOn < today) return [];
    const m = [...c.monthly].reverse().find(x => x.from <= today);
    return m ? [{ c, m }] : [];
  });
  const monthFee = thisMonth.reduce((sum, x) => sum + x.m.fee, 0);
  const monthQuota = thisMonth.reduce((sum, x) => sum + x.m.quota, 0);
  const monthDone = thisMonth.reduce((sum, x) => sum + x.m.count, 0);
  const monthLeft = Math.max(0, monthQuota - monthDone);
  /** 이번 달 남은 날 — 오늘 포함 */
  const daysLeftInMonth = dayjs().endOf('month').diff(dayjs(), 'day') + 1;

  /** 플랫폼별로 몇 대 했는지 — 엔카 몇 대인지가 먼저 궁금하다 */
  const byPlatform = [...thisMonth.reduce((map, x) => {
    const prev = map.get(x.c.platform) ?? { done: 0, quota: 0 };
    map.set(x.c.platform, { done: prev.done + x.m.count, quota: prev.quota + x.m.quota });
    return map;
  }, new Map<string, { done: number; quota: number }>())];

  /** 엔카·차차차 약정 말고 따로 나가는 광고비(구글 애즈·114 …) */
  const [otherSpend, setOtherSpend] = useState(0);
  useEffect(() => {
    void api<{ amount: number }[]>(`/ad-spends?month=${month}`)
      .then(list => setOtherSpend(list.reduce((sum, r) => sum + r.amount, 0)))
      // 못 불러와도 약정 쪽은 보여준다
      .catch(() => setOtherSpend(0));
  }, [month]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">광고 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            광고 상품은 <b>월 몇 대</b>로 팔립니다. 약정 대수를 다 못 쓰면 그만큼 돈이 날아갑니다 —
            얼마나 썼고 며칠 남았는지 봅니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <p className="text-xs font-medium text-indigo-700/80">{dayjs().format('M월')} 광고비</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {(monthFee + otherSpend).toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {/* 약정 상품과 그 밖의 광고를 갈라 둔다 — 줄일 수 있는 쪽이 다르다 */}
          <p className="text-[11px] text-slate-400">
            약정 {monthFee.toLocaleString()}원
            {otherSpend > 0 && ` · 그 외 ${otherSpend.toLocaleString()}원`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{dayjs().format('M월')} 진단완료</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {monthDone}
            <span className="ml-1 text-sm font-medium text-slate-400">/ {monthQuota}대</span>
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {byPlatform.length > 0
              ? byPlatform.map(([platform, v]) => `${platform} ${v.done}/${v.quota}`).join(' · ')
              : '이번 달 걸린 계약이 없습니다'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{dayjs().format('M월')} 남은 건수</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {monthLeft}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
          {/* 남은 날로 나눠 둔다 — 이달 안에 못 쓰면 그대로 날아가는 대수다 */}
          <p className="text-[11px] text-slate-400">
            {monthLeft > 0
              ? `${daysLeftInMonth}일 남음 · 하루 ${Math.ceil(monthLeft / daysLeftInMonth)}대`
              : monthQuota > 0
                ? '이번 달 약정을 다 썼습니다'
                : '—'}
          </p>
        </div>
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

      <div className="space-y-3">
        {rows.map(c => {
          const pct = c.totalQuota > 0 ? Math.min(100, Math.round((c.used / c.totalQuota) * 100)) : 0;
          /*
            대당 얼마짜리인지 — 22만원에 월 30대면 한 대에 7,333원이다.
            차를 넣을 때마다 이 값이 붙는다. 약정을 다 못 쓰면 실제 대당은 이보다 비싸진다.
          */
          const unitFee = c.monthlyQuota > 0 ? Math.round(c.monthlyFee / c.monthlyQuota) : 0;
          // 남은 기간보다 남은 대수가 많이 뒤처지면 붉게 — 숫자만으로는 급한 줄 모른다
          const behind = c.remaining > 0 && c.daysLeft <= 7;
          const open = openId === c.id;

          return (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {c.platform}
                </span>
                <span className="text-sm font-bold text-slate-800">{c.productName || '광고 상품'}</span>
                <span className="text-xs text-slate-400">
                  월 {c.monthlyFee.toLocaleString()}원 · 월 {c.monthlyQuota}대 · {c.months}개월
                  {unitFee > 0 && (
                    <b className="ml-1 font-semibold text-indigo-600">대당 {unitFee.toLocaleString()}원</b>
                  )}
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
                <span className="text-2xl font-bold text-slate-900">
                  {c.used}
                  <span className="ml-1 text-sm font-medium text-slate-400">/ {c.totalQuota}건</span>
                </span>
                <span className={`text-sm font-semibold ${behind ? 'text-red-600' : 'text-slate-500'}`}>
                  {c.remaining > 0 ? `${c.remaining}건 남음` : '다 썼습니다'}
                </span>
                <span className="text-xs text-slate-400">
                  {c.daysLeft > 0 ? `${c.daysLeft}일 남음` : '기간 끝'}
                  {c.remaining > 0 && c.daysLeft > 0 && ` · 하루 ${c.perDayNeeded}건씩 해야 다 씁니다`}
                </span>
                <button
                  onClick={() => setAddingTo(c)}
                  className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  차량 넣기
                </button>
                <button
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {open ? '접기' : `진단완료 ${c.used}건`}
                </button>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${behind ? 'bg-red-500' : pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* 월별 집계 — "9월에 몇 건 하고 광고비 얼마 썼나" */}
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">달</th>
                      <th className="px-3 py-2 text-right font-medium">진단완료</th>
                      <th className="px-3 py-2 text-right font-medium">약정</th>
                      <th className="px-3 py-2 text-right font-medium">광고비</th>
                      <th className="px-3 py-2 text-right font-medium">실제 대당</th>
                      <th className="px-3 py-2 text-right font-medium">못 쓴 몫</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.monthly.map(m => (
                      <tr key={m.from} className="border-t border-slate-50">
                        <td className="px-3 py-1.5 text-slate-600">{m.label}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${m.count >= m.quota ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {m.count}건
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-400">{m.quota}건</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{m.fee.toLocaleString()}원</td>
                        {/* 약정을 다 못 쓰면 한 대에 얼마 물었는지가 올라간다 — 거기가 아픈 자리다 */}
                        <td className={`px-3 py-1.5 text-right ${m.count > 0 && Math.round(m.fee / m.count) > unitFee ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                          {m.count > 0 ? `${Math.round(m.fee / m.count).toLocaleString()}원` : '—'}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${m.wasted > 0 ? 'font-semibold text-red-600' : 'text-slate-300'}`}>
                          {m.wasted > 0 ? `${m.wasted.toLocaleString()}원` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
                      <td className="px-3 py-1.5 text-slate-600">합계</td>
                      <td className="px-3 py-1.5 text-right text-slate-800">{c.used}건</td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{c.totalQuota}건</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{c.totalFee.toLocaleString()}원</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">
                        {c.used > 0 ? `${Math.round(c.totalFee / c.used).toLocaleString()}원` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-red-600">
                        {c.monthly.reduce((sum, m) => sum + m.wasted, 0).toLocaleString()}원
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 기간이 끝났는데 남았으면 그게 곧 날아간 돈이다 */}
              {c.wastedFee > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertTriangle size={13} /> 기간이 끝났는데 {c.remaining}대를 못 썼습니다 —
                  약 {c.wastedFee.toLocaleString()}원어치입니다.
                </p>
              )}
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
                      {/* 이 한 대에 얼마 들었는지 — 약정 단가 */}
                      {unitFee > 0 && <span className="font-semibold text-indigo-600">{unitFee.toLocaleString()}원</span>}
                      {p.auto && (
                        <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">진단완료</span>
                      )}
                      <button
                        onClick={() => void removePosting(p.id)}
                        className="ml-auto rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="빼기"
                      >
                        <Trash2 size={12} />
                      </button>
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
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10" onClick={() => setAddingTo(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
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
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAddingTo(null)} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
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

/** 계약 등록 — 월 요금·월 대수·개월 수만 받으면 마감일과 총 약정은 서버가 낸다. */
function AdContractForm({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const [platform, setPlatform] = useState<string>(VEHICLE_POST_SITES[0]);
  const [productName, setProductName] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [monthlyQuota, setMonthlyQuota] = useState('');
  const [months, setMonths] = useState('3');
  const [startOn, setStartOn] = useState(dayjs().format('YYYY-MM-DD'));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const quota = Number(digitsOnly(monthlyQuota)) || 0;
  const m = Number(digitsOnly(months)) || 0;
  const fee = Number(digitsOnly(monthlyFee)) || 0;

  const submit = async () => {
    if (!platform.trim() || quota <= 0 || m <= 0) {
      setError('플랫폼과 월 대수, 개월 수는 반드시 적어야 합니다.');
      return;
    }
    setSaving(true);
    try {
      await api('/ads', {
        method: 'POST',
        body: { platform, productName, monthlyFee: fee, monthlyQuota: quota, months: m, startOn, note },
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
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800">광고 계약 등록</h3>

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
            '월 광고비(원)',
            <input value={monthlyFee} onChange={e => setMonthlyFee(withCommas(e.target.value))} inputMode="numeric" placeholder="220,000" className={`${INPUT} text-right`} />,
          )}
          {field(
            '월 약정 대수 *',
            <input value={monthlyQuota} onChange={e => setMonthlyQuota(digitsOnly(e.target.value))} inputMode="numeric" placeholder="30" className={`${INPUT} text-right`} />,
          )}
          {field(
            '개월 수 *',
            <input value={months} onChange={e => setMonths(digitsOnly(e.target.value))} inputMode="numeric" placeholder="3" className={`${INPUT} text-right`} />,
          )}
          {field('시작일 *', <input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} className={INPUT} />)}
          <div className="col-span-2">
            {field('메모', <input value={note} onChange={e => setNote(e.target.value)} className={INPUT} />)}
          </div>
        </div>

        {/* 총 약정이 얼마인지 등록 전에 보여준다 — 월 30대 3개월이 90대라는 걸 눈으로 확인하게 */}
        {quota > 0 && m > 0 && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            총 <b>{quota * m}대</b> · 광고비 <b>{(fee * m).toLocaleString()}원</b> ·
            {' '}{startOn} ~ {dayjs(startOn).add(m, 'month').subtract(1, 'day').format('YYYY-MM-DD')}
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
