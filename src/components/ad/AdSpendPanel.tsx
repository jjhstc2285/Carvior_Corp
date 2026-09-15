import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { AD_SPEND_CHANNELS, AD_SPEND_STATUSES, type AdSpend } from '../../types';

/**
 * 월별 광고비.
 *
 * 엔카·차차차 약정은 위 계약에서 대수로 세고, 여기는 그 밖의 광고 — 구글 애즈·114 우선문의·
 * 채널웍스·알바천국 — 에 그 달 얼마를 썼는지 적는다. 카톡으로 "9월 광고비 약 135만원"을
 * 주고받던 걸 여기 남긴다.
 *
 * 끊은 채널도 0원·종료로 남겨 둔다 — 안 적으면 끊은 건지 적는 걸 잊은 건지 알 수 없다.
 * 대부분 달마다 같으니 [지난달 가져오기]로 복사한 뒤 바뀐 것만 고친다.
 */

const INPUT =
  'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

const STATUS_CLASS: Record<string, string> = {
  신규: 'bg-indigo-50 text-indigo-700',
  유지: 'bg-slate-100 text-slate-600',
  종료: 'bg-red-50 text-red-600',
  중지: 'bg-amber-50 text-amber-700',
};

export default function AdSpendPanel() {
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [rows, setRows] = useState<AdSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AdSpend[]>(`/ad-spends?month=${month}`));
    } catch (e) {
      void alertError('광고비를 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: AdSpend, body: Partial<AdSpend>) => {
    setBusyId(row.id);
    try {
      await api(`/ad-spends/${row.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    try {
      await api('/ad-spends', { method: 'POST', body: { month, channel: '새 채널', status: '신규' } });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const copyPrevious = async () => {
    try {
      const res = await api<{ copied: number; from: string }>(`/ad-spends/copy-previous?month=${month}`, {
        method: 'POST',
      });
      await alertSuccess(
        res.copied > 0 ? `${dayjs(res.from).format('M월')}에서 ${res.copied}개를 가져왔습니다` : '가져올 게 없습니다',
        res.copied > 0
          ? '금액이 바뀐 채널만 고치세요. 끊은 채널(0원·종료)은 안 가져옵니다.'
          : '지난달에 적은 게 없거나, 이미 이번 달에 다 있습니다.',
      );
      await load();
    } catch (e) {
      void alertError('가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: AdSpend) => {
    const ok = await confirmDanger(
      `${row.channel}을(를) 지울까요?`,
      '광고를 끊은 거라면 지우지 말고 0원·종료로 남겨 주세요 — 끊은 건지 잊은 건지 구분이 됩니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/ad-spends/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  // 누가 얼마를 쓰는지 — 이태희 매니저 광고, 안부장 채용광고처럼 담당이 갈린다
  const byOwner = [...rows.reduce((m, r) => m.set(r.owner || '담당 없음', (m.get(r.owner || '담당 없음') ?? 0) + r.amount), new Map<string, number>())]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">월별 광고비</h2>
        <span className="text-[11px] text-slate-400">엔카·차차차 약정 외 — 구글 애즈 · 114 · 채널웍스 · 알바천국 …</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setMonth(m => dayjs(`${m}-01`).subtract(1, 'month').format('YYYY-MM'))}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="지난달"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="w-20 text-center text-sm font-semibold text-slate-700">{dayjs(`${month}-01`).format('YYYY년 M월')}</span>
          <button
            onClick={() => setMonth(m => dayjs(`${m}-01`).add(1, 'month').format('YYYY-MM'))}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="다음달"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <p className="text-sm text-slate-500">
          합계 <b className="text-lg text-indigo-700">{total.toLocaleString()}</b>원
        </p>
        {byOwner.length > 1 &&
          byOwner.map(([owner, amount]) => (
            <span key={owner} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {owner} {amount.toLocaleString()}원
            </span>
          ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void copyPrevious()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            title="지난달 채널을 이번 달로 복사합니다. 바뀐 것만 고치면 됩니다"
          >
            <Copy size={13} /> 지난달 가져오기
          </button>
          <button
            onClick={() => void addRow()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={13} /> 채널 추가
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-3 py-2" />
              <th className="px-3 py-2 font-medium">채널</th>
              <th className="px-3 py-2 text-right font-medium">금액(원)</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium">담당</th>
              <th className="px-3 py-2 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                  {loading ? '불러오는 중…' : '이 달에 적은 광고비가 없습니다. [지난달 가져오기] 또는 [채널 추가]로 시작하세요.'}
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className={`border-b border-slate-50 last:border-0 ${r.status === '종료' ? 'text-slate-400' : ''}`}>
                <td className="px-3 py-2">
                  <button
                    onClick={() => void removeRow(r)}
                    disabled={busyId === r.id}
                    className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    aria-label="삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={r.channel}
                    list="ad-spend-channels"
                    onBlur={e => e.target.value !== r.channel && void patch(r, { channel: e.target.value })}
                    disabled={busyId === r.id}
                    className={`${INPUT} w-40`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={withCommas(String(r.amount || ''))}
                    onBlur={e => {
                      const next = Number(digitsOnly(e.target.value)) || 0;
                      if (next !== r.amount) void patch(r, { amount: next });
                    }}
                    disabled={busyId === r.id}
                    inputMode="numeric"
                    placeholder="0"
                    className={`${INPUT} w-28 text-right`}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.status}
                    onChange={e => void patch(r, { status: e.target.value })}
                    disabled={busyId === r.id}
                    className={`rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold outline-none ${STATUS_CLASS[r.status] ?? ''}`}
                  >
                    <option value="">-</option>
                    {AD_SPEND_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={r.owner}
                    onBlur={e => e.target.value !== r.owner && void patch(r, { owner: e.target.value })}
                    disabled={busyId === r.id}
                    placeholder="이태희"
                    className={`${INPUT} w-24`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={r.memo}
                    onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                    disabled={busyId === r.id}
                    placeholder="일예산 2~5만원, 반응 보고 조정"
                    className={`${INPUT} w-72`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 자주 쓰는 채널 — 치다 보면 '114우선문의' '114 우선문의'로 갈린다 */}
      <datalist id="ad-spend-channels">
        {AD_SPEND_CHANNELS.map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </section>
  );
}
