import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { VENDOR_CATEGORIES, type Vendor } from '../../types';
import EmployeeAvatar from '../EmployeeAvatar';

/**
 * 거래처 대장.
 *
 * 광택집·판금집·공업사·배터리·할부사처럼 전화할 일이 있는 곳을 한곳에 모은다.
 * 번호가 카톡 어딘가에만 있어서 필요할 때마다 대화를 거슬러 올라가 찾던 걸 없앤다.
 *
 * 보는 건 전 직원, 고치는 건 관리자다 — 현장에서 전화하는 사람은 정해져 있지 않은데,
 * 여럿이 같은 줄을 고치면 어느 번호가 맞는지 알 수 없게 된다.
 *
 * 한 칸씩 고치면 바로 저장된다. 따로 [저장]을 누르게 하면 고쳐놓고 안 누르는 일이 생긴다.
 */

const INPUT =
  'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

export default function VendorModule({ role }: { role: 'EMPLOYEE' | 'ADMIN' }) {
  const canEdit = role === 'ADMIN';
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Vendor[]>(`/vendors?includeInactive=${includeInactive}`));
    } catch (e) {
      void alertError('거래처를 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: Vendor, body: Partial<Vendor>) => {
    setBusyId(row.id);
    try {
      await api(`/vendors/${row.id}`, { method: 'PATCH', body });
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
      // 분류는 지금 보고 있는 것으로 미리 채운다 — 광택집을 보다가 추가하면 광택집이다
      await api('/vendors', {
        method: 'POST',
        body: { category: category === 'all' ? VENDOR_CATEGORIES[0] : category, name: '새 거래처' },
      });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: Vendor) => {
    const ok = await confirmDanger(
      `${row.name}을(를) 지울까요?`,
      '거래를 끊은 곳이면 지우지 말고 [거래중] 체크를 풀어 주세요 — 지난 비용 명세가 이 이름을 적어두고 있습니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/vendors/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  /** 분류별 건수 — 어디에 몇 곳을 쓰고 있는지 */
  const counts = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.category, (by.get(r.category) ?? 0) + 1);
    return by;
  }, [rows]);

  const filtered = rows
    .filter(r => category === 'all' || r.category === category)
    .filter(r => {
      const q = query.trim();
      return !q || [r.name, r.manager, r.phone, r.phone2, r.memo].some(v => v?.includes(q));
    });

  /** 목록에 없는 분류가 쓰이고 있으면 그것도 고를 수 있어야 한다 */
  const categories = [...new Set([...VENDOR_CATEGORIES, ...rows.map(r => r.category)])];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">거래처 대장</h1>
          <p className="mt-1 text-sm text-slate-500">
            광택집 · 판금집 · 공업사 · 배터리 · 할부사 · 탁송처럼 전화할 일이 있는 곳을 모아둡니다.
            번호를 누르면 바로 걸립니다.
            {!canEdit && ' 고치는 건 관리자만 할 수 있습니다.'}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => void addRow()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 거래처 추가
          </button>
        )}
      </div>

      {/* 분류로 먼저 좁힌다 — 번호를 찾을 때는 '어느 쪽 업체인지'가 먼저 떠오른다 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategory('all')}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            category === 'all'
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          전체 <span className="ml-1 font-bold">{rows.length}</span>
        </button>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategory(v => (v === c ? 'all' : c))}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              category === c
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="font-semibold">{c}</span>
            <span className="ml-1 font-bold text-indigo-600">{counts.get(c) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="업체명·담당자·번호 검색"
          className="w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          거래 끝난 곳도 보기
        </label>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${filtered.length}곳`}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                {canEdit && <th className="px-3 py-3" />}
                <th className="px-3 py-3 font-medium">분류</th>
                <th className="px-3 py-3 font-medium">업체명</th>
                <th className="px-3 py-3 font-medium">전화번호</th>
                <th className="px-3 py-3 font-medium">번호 2</th>
                <th className="px-3 py-3 font-medium">담당자</th>
                <th className="px-3 py-3 font-medium">메모</th>
                {canEdit && <th className="px-3 py-3 text-center font-medium">거래중</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '등록된 거래처가 없습니다.'}
                  </td>
                </tr>
              )}
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${
                    r.active ? '' : 'bg-slate-50/60 text-slate-400'
                  }`}
                >
                  {canEdit && (
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
                  )}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {canEdit ? (
                      <select
                        value={r.category}
                        onChange={e => void patch(r, { category: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-28`}
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {r.category}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <input
                        defaultValue={r.name}
                        onBlur={e => e.target.value !== r.name && void patch(r, { name: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-40`}
                      />
                    ) : (
                      <span className="flex items-center gap-2 font-medium text-slate-700">
                        {/* 이름만 늘어놓으면 눈이 안 잡힌다 — 직원 목록과 같은 방식으로 표시한다 */}
                        <EmployeeAvatar name={r.name} size={24} />
                        {r.name}
                      </span>
                    )}
                  </td>
                  {(['phone', 'phone2'] as const).map(field => (
                    <td key={field} className="whitespace-nowrap px-3 py-2.5">
                      {canEdit ? (
                        <input
                          defaultValue={r[field]}
                          onBlur={e => e.target.value !== r[field] && void patch(r, { [field]: e.target.value })}
                          disabled={busyId === r.id}
                          placeholder={field === 'phone' ? '010-0000-0000' : ''}
                          className={`${INPUT} w-36 font-mono`}
                        />
                      ) : r[field] ? (
                        <a
                          href={`tel:${r[field].replace(/[^\d+]/g, '')}`}
                          className="inline-flex items-center gap-1 font-mono font-medium text-indigo-600 hover:underline"
                        >
                          <Phone size={12} /> {r[field]}
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <input
                        defaultValue={r.manager}
                        onBlur={e => e.target.value !== r.manager && void patch(r, { manager: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-24`}
                      />
                    ) : (
                      <span className="text-slate-600">{r.manager || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <input
                        defaultValue={r.memo}
                        onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                        disabled={busyId === r.id}
                        className={`${INPUT} w-48`}
                      />
                    ) : (
                      <span className="text-xs text-slate-500">{r.memo}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={e => void patch(r, { active: e.target.checked })}
                        disabled={busyId === r.id}
                        className="size-4 accent-indigo-600"
                        aria-label="거래중"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <p className="mt-2 text-[11px] text-slate-400">
          칸을 고치고 <b>칸 밖을 누르면 바로 저장</b>됩니다. 거래를 끊은 곳은 지우지 말고{' '}
          <b>거래중 체크를 풀어</b> 주세요 — 지난 상품화 비용 명세가 이 이름을 적어두고 있어서,
          지우면 그게 어디였는지 알 길이 없어집니다.
          <br />
          <b>광택·세차 · 판금·덴트 · 성능 · 탁송 · 공업사</b> 로 넣어두면 매입 정산의 상품화 비용에서
          바로 골라 쓸 수 있습니다.
        </p>
      )}
    </div>
  );
}
