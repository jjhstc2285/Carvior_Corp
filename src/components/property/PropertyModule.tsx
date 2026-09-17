import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlarmClock, FileText, Phone, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { PROPERTY_USAGES, type Property } from '../../types';
import LeaseContractModal from './LeaseContractModal';

/**
 * 부동산 정보.
 *
 * 사무실·주차장·창고로 쓰는 자리를 한곳에 모은다. 대표와 관리자만 본다 —
 * 보증금·월세·임대인 연락처가 들어 있어 전 직원이 볼 값이 아니다.
 *
 * 월세 내는 날과 계약 끝나는 날을 같이 둔다. 둘 다 놓치면 돈이 드는 일이라
 * 한 화면에서 봐야 한다 — 만료가 가까운 자리를 위로 올리고 색으로 알린다.
 *
 * 칸을 고치면 바로 저장된다. 따로 [저장]을 누르게 하면 고쳐놓고 안 누르는 일이 생긴다.
 */

/*
  칸마다 너비를 따로 준다 — 여기에 w-full 을 같이 넣으면 둘이 부딪쳐서, 칸이 눌려
  한 글자도 안 보이게 찌그러진다(무엇이 이기는지는 Tailwind 가 만든 차례를 탄다).
*/
const INPUT =
  'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

/** 계약 만료까지 며칠. 안 적혔으면 null */
function daysLeft(endOn: string | null): number | null {
  if (!endOn) return null;
  return dayjs(endOn).startOf('day').diff(dayjs().startOf('day'), 'day');
}

export default function PropertyModule() {
  const [rows, setRows] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** 계약서를 펼쳐 둔 부동산 */
  const [contractFor, setContractFor] = useState<Property | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Property[]>(`/properties?includeInactive=${includeInactive}`));
      setDenied(false);
    } catch (e) {
      // 볼 수 없는 계정이면 서버가 막는다 — 화면에서도 같은 말을 해준다
      if (e instanceof ApiError && e.status === 403) setDenied(true);
      else void alertError('불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: Property, body: Partial<Property>) => {
    setBusyId(row.id);
    try {
      await api(`/properties/${row.id}`, { method: 'PATCH', body });
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
      await api('/properties', { method: 'POST', body: { name: '새 부동산', usage: PROPERTY_USAGES[0] } });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: Property) => {
    const ok = await confirmDanger(
      `${row.name}을(를) 지울까요?`,
      '계약이 끝난 자리면 지우지 말고 [계약중] 체크를 풀어 주세요 — 지난 계약도 기록입니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/properties/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const totals = useMemo(() => {
    const live = rows.filter(r => r.active);
    return {
      count: live.length,
      rent: live.reduce((sum, r) => sum + r.monthlyRent, 0),
      deposit: live.reduce((sum, r) => sum + r.deposit, 0),
      // 석 달 안에 끝나는 계약 — 미리 알아야 옮기든 연장하든 한다
      soon: live.filter(r => {
        const d = daysLeft(r.endOn);
        return d !== null && d <= 90;
      }).length,
    };
  }, [rows]);

  /**
   * 곧 끝나거나 이미 지난 계약.
   *
   * 표 안에서 색만 칠해두면 아래로 스크롤해야 보인다. 놓치면 돈이 드는 일이라
   * 맨 위에 따로 올리고, 거기서 바로 임대인에게 걸고 연장 계약서까지 만들게 한다.
   */
  const expiring = rows
    .filter(r => r.active)
    .map(r => ({ row: r, left: daysLeft(r.endOn) }))
    .filter((x): x is { row: Property; left: number } => x.left !== null && x.left <= 90)
    .sort((a, b) => a.left - b.left);

  if (denied) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-slate-500">부동산 정보는 대표님과 관리자만 볼 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">부동산 정보</h1>
          <p className="mt-1 text-sm text-slate-500">
            사무실 · 주차장 · 창고로 쓰는 자리를 모아둡니다. <b>대표님과 관리자만 보이는 화면</b>입니다.
          </p>
        </div>
        <button
          onClick={() => void addRow()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 부동산 추가
        </button>
      </div>

      {expiring.length > 0 && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <AlarmClock size={15} className="text-red-600" />
            <h2 className="text-sm font-bold text-red-800">곧 끝나는 계약 {expiring.length}건</h2>
            <span className="text-[11px] text-red-700/70">
              연장하려면 임대인에게 먼저 연락하고, [계약서]에서 연장 계약서를 만드세요
            </span>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {expiring.map(({ row, left }) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="font-bold text-slate-800">{row.name}</span>
                <span className="text-slate-400">{row.usage}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-bold ${left < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {left < 0 ? `만료 ${-left}일 지남` : `${left}일 남음`}
                </span>
                <span className="text-slate-500">{row.endOn} 만료</span>
                {row.monthlyRent > 0 && (
                  <span className="text-slate-400">월세 {row.monthlyRent.toLocaleString()}원</span>
                )}

                <span className="ml-auto flex items-center gap-1.5">
                  {row.ownerPhone ? (
                    // 연장은 전화 한 통으로 시작한다 — 번호를 찾으러 표를 뒤지지 않게
                    <a
                      href={`tel:${row.ownerPhone.replace(/[^\d+]/g, '')}`}
                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      <Phone size={11} /> {row.ownerName || '임대인'} {row.ownerPhone}
                    </a>
                  ) : (
                    <span className="text-slate-400">임대인 번호 없음</span>
                  )}
                  <button
                    onClick={() => setContractFor(row)}
                    className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 font-semibold text-white hover:bg-slate-800"
                  >
                    <FileText size={11} /> 계약서
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">계약중</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totals.count}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5">
          <p className="text-xs font-medium text-indigo-700/80">매달 월세</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {totals.rent.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">묶인 보증금</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totals.deposit.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
        </div>
        {/* 계약 끝나는 걸 놓치면 옮길 자리를 못 구한다 */}
        <div
          className={`rounded-2xl border px-4 py-3.5 ${
            totals.soon > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
          }`}
        >
          <p className={`text-xs font-medium ${totals.soon > 0 ? 'text-amber-800' : 'text-slate-400'}`}>
            3개월 안에 만료
          </p>
          <p className={`mt-1 text-2xl font-bold ${totals.soon > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
            {totals.soon}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          계약 끝난 곳도 보기
        </label>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${rows.length}곳`}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-3" />
                <th className="px-3 py-3 font-medium">이름</th>
                <th className="px-3 py-3 font-medium">계약서</th>
                <th className="px-3 py-3 font-medium">용도</th>
                <th className="px-3 py-3 font-medium">주소</th>
                <th className="px-3 py-3 font-medium">임대인</th>
                <th className="px-3 py-3 font-medium">연락처</th>
                <th className="px-3 py-3 text-right font-medium">보증금</th>
                <th className="px-3 py-3 text-right font-medium">월세</th>
                <th className="px-3 py-3 text-center font-medium">내는 날</th>
                <th className="px-3 py-3 font-medium">계약 시작</th>
                <th className="px-3 py-3 font-medium">계약 만료</th>
                <th className="px-3 py-3 font-medium">메모</th>
                <th className="px-3 py-3 text-center font-medium">계약중</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '등록된 부동산이 없습니다.'}
                  </td>
                </tr>
              )}
              {rows.map(r => {
                const left = daysLeft(r.endOn);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${
                      !r.active
                        ? 'bg-slate-50/60 text-slate-400'
                        : left !== null && left < 0
                          ? 'bg-red-50/70'
                          : left !== null && left <= 90
                            ? 'bg-amber-50/60'
                            : ''
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => void removeRow(r)}
                        disabled={busyId === r.id}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        aria-label="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        defaultValue={r.name}
                        onBlur={e => e.target.value !== r.name && void patch(r, { name: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-36`}
                      />
                    </td>
                    {/* 양식을 손으로 채워 인쇄하던 걸 여기서 쓴다 */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button
                        onClick={() => setContractFor(r)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <FileText size={12} /> 계약서
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={r.usage}
                        onChange={e => void patch(r, { usage: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-24`}
                      >
                        {[...new Set([...PROPERTY_USAGES, r.usage].filter(Boolean))].map(u => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        defaultValue={r.address}
                        onBlur={e => e.target.value !== r.address && void patch(r, { address: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-56`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        defaultValue={r.ownerName}
                        onBlur={e => e.target.value !== r.ownerName && void patch(r, { ownerName: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-24`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center gap-1">
                        <input
                          defaultValue={r.ownerPhone}
                          onBlur={e => e.target.value !== r.ownerPhone && void patch(r, { ownerPhone: e.target.value })}
                          disabled={busyId === r.id}
                          placeholder="010-0000-0000"
                          className={`${INPUT} w-32 font-mono`}
                        />
                        {r.ownerPhone && (
                          <a
                            href={`tel:${r.ownerPhone.replace(/[^\d+]/g, '')}`}
                            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                            aria-label="전화"
                          >
                            <Phone size={12} />
                          </a>
                        )}
                      </span>
                    </td>
                    {(['deposit', 'monthlyRent'] as const).map(field => (
                      <td key={field} className="px-3 py-2.5">
                        <input
                          defaultValue={withCommas(String(r[field] || ''))}
                          onBlur={e => {
                            const next = Number(digitsOnly(e.target.value)) || 0;
                            if (next !== r[field]) void patch(r, { [field]: next });
                          }}
                          disabled={busyId === r.id}
                          inputMode="numeric"
                          className={`${INPUT} w-28 text-right`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <input
                        defaultValue={r.payDay || ''}
                        onBlur={e => {
                          const next = Math.min(31, Number(digitsOnly(e.target.value)) || 0);
                          if (next !== r.payDay) void patch(r, { payDay: next });
                        }}
                        disabled={busyId === r.id}
                        inputMode="numeric"
                        placeholder="5"
                        className={`${INPUT} w-14 text-center`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="date"
                        value={r.startOn ?? ''}
                        onChange={e => void patch(r, { startOn: e.target.value || null })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-36`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1">
                        <input
                          type="date"
                          value={r.endOn ?? ''}
                          onChange={e => void patch(r, { endOn: e.target.value || null })}
                          disabled={busyId === r.id}
                          className={`${INPUT} w-36`}
                        />
                        {/* 만료가 가까우면 숫자로 알려준다 — 날짜만 보고는 며칠 남았는지 안 세어진다 */}
                        {r.active && left !== null && left <= 90 && (
                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              left < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {left < 0 ? `${-left}일 지남` : `${left}일 남음`}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        defaultValue={r.memo}
                        onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-48`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={e => void patch(r, { active: e.target.checked })}
                        disabled={busyId === r.id}
                        className="size-4 accent-indigo-600"
                        aria-label="계약중"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {contractFor && (
        <LeaseContractModal
          property={contractFor}
          onClose={() => setContractFor(null)}
          onRenewed={() => void load()}
        />
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        칸을 고치고 <b>칸 밖을 누르면 바로 저장</b>됩니다. 계약이 끝난 자리는 지우지 말고{' '}
        <b>계약중 체크를 풀어</b> 주세요 — 지난 계약도 기록입니다.
        <br />
        만료가 <b>3개월 안</b>으로 들어오면 노란색, <b>지났으면</b> 빨간색으로 표시됩니다.
      </p>
    </div>
  );
}
