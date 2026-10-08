import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Download, ExternalLink, Loader2, Search, Table2, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../../lib/alert';
import { useDragScroll } from '../../lib/useDragScroll';

/**
 * 플랫폼별 매물 — 우리 값과 엔카·차차차에 올라간 값이 같은가.
 *
 * 올려 둔 값이 플랫폼마다 다르면 손님이 먼저 안다. 싸게 올라간 쪽을 보고 와서 그 값을
 * 부르는데 우리 장부에는 다른 값이 적혀 있다 — 그 자리에서 깎이거나 말이 바뀐다.
 *
 * 그동안 구글 시트로 돌렸다. 시트는 그대로 두고(거기서 모으는 사람이 있다) 눌러서
 * 끌어온다. 끌어온 뒤에는 여기서 고친다 — 누가 고쳤는지가 남고, 차량번호가 있으니
 * 다른 화면과 같은 번호로 묶인다.
 *
 * 맞는지 틀린지는 저장하지 않고 볼 때마다 센다. 값을 고치면 바로 따라와야 하는 값이라
 * 적어 두면 어긋난다.
 */

interface Listing {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  /** 우리 판매금액(만원). 0이면 숫자가 아닌 값이 적혀 있던 것이다 */
  salePrice: number;
  /** '계약중'·'예약'처럼 금액 자리에 적혀 있던 말 */
  saleNote: string;
  encar: number;
  chacha: number;
  memo: string;
  /** 시트에서 가져온 때. 비어 있으면 손으로 고친 줄이다 */
  syncedAt: string | null;
}

/** 보는 플랫폼 — 늘리려면 여기와 서버에 한 줄씩 */
const SITES = [
  { key: 'encar', label: '엔카' },
  { key: 'chacha', label: '차차차' },
] as const;


/** 원본 시트 — 모으는 사람은 아직 여기서 적는다 */
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1mddXpb3V5BbDj4IVY4Z5SSJynlngApt8aULN-tRbT_E/edit?gid=1128555042#gid=1128555042';

const NUM = (n: number) => n.toLocaleString();

/**
 * 이 차가 지금 어떤 상태인가.
 *
 *   맞음     — 올라간 곳의 값이 우리 값과 같다
 *   불일치   — 한 곳이라도 값이 다르다. 손님이 먼저 보는 그 자리다
 *   미등록   — 아직 안 올라간 곳이 있다
 *
 * 우리 값이 없으면(계약중·예약) 견줄 것이 없어 아무것도 안 띄운다.
 */
function stateOf(row: Listing): { key: 'ok' | 'gap' | 'none' | 'skip'; label: string; sites: string[] } {
  if (row.salePrice <= 0) return { key: 'skip', label: row.saleNote || '금액 없음', sites: [] };

  const missing = SITES.filter(s => row[s.key] <= 0).map(s => s.label);
  const gap = SITES.filter(s => row[s.key] > 0 && row[s.key] !== row.salePrice).map(s => s.label);

  if (gap.length > 0) return { key: 'gap', label: '가격 불일치', sites: gap };
  if (missing.length > 0) return { key: 'none', label: '미등록', sites: missing };
  return { key: 'ok', label: '맞음', sites: [] };
}

const STATE_CLASS: Record<string, string> = {
  gap: 'bg-red-100 text-red-700',
  none: 'bg-amber-100 text-amber-800',
  ok: 'bg-emerald-50 text-emerald-700',
  skip: 'bg-slate-100 text-slate-500',
};

export default function AdminSheetModule() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'gap' | 'none'>('all');
  const dragRef = useDragScroll<HTMLDivElement>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Listing[]>('/platform-listings'));
    } catch (e) {
      void alertError('목록을 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pull = async () => {
    setImporting(true);
    try {
      const res = await api<{ added: number; updated: number; skipped: number }>('/platform-listings/import', {
        method: 'POST',
      });
      await load();
      void alertSuccess(
        '시트에서 가져왔습니다',
        `새로 ${res.added}대 · 고침 ${res.updated}대${res.skipped > 0 ? ` · 차량번호 없어 건너뜀 ${res.skipped}줄` : ''}`,
      );
    } catch (e) {
      void alertError('가져오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setImporting(false);
    }
  };

  const patch = async (row: Listing, body: Partial<Listing>) => {
    try {
      await api(`/platform-listings/${row.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('고치지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const remove = async (row: Listing) => {
    const ok = await confirmDanger(`${row.vehicleNumber} 줄을 지울까요?`, '시트는 그대로 남습니다.');
    if (!ok) return;
    try {
      await api(`/platform-listings/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const shown = useMemo(() => {
    const q = query.trim();
    return rows
      .filter(r => !q || r.vehicleNumber.includes(q) || r.vehicleName.includes(q))
      .filter(r => only === 'all' || stateOf(r).key === only);
  }, [rows, query, only]);

  const counts = useMemo(() => {
    const c = { gap: 0, none: 0, ok: 0, skip: 0 };
    for (const r of rows) c[stateOf(r).key] += 1;
    return c;
  }, [rows]);

  /** 마지막으로 시트에서 끌어온 때 — 언제 적 값인지 모르면 숫자를 못 믿는다 */
  const lastSync = rows.reduce<string | null>(
    (latest, r) => (r.syncedAt && (!latest || r.syncedAt > latest) ? r.syncedAt : latest),
    null,
  );

  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-slate-900">
          <Table2 size={18} className="text-emerald-600" /> 플랫폼 매물 점검
        </h1>
        <p className="text-xs text-slate-400">
          우리 판매금액과 엔카·차차차에 올라간 값이 같은지 봅니다 — 금액은 <b>만원</b>입니다
          {lastSync && ` · 마지막 가져오기 ${dayjs(lastSync).format('M/D HH:mm')}`}
        </p>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <ExternalLink size={15} /> 원본 시트
          </a>
          <button
            onClick={() => void pull()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            title="구글 시트를 읽어 차량번호로 맞춰 덮어씁니다. 시트에 없는 차는 안 지웁니다"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {importing ? '가져오는 중' : '시트에서 가져오기'}
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 px-3.5 py-2.5">
          <p className="text-xs font-medium text-red-700/80">가격 불일치</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {counts.gap}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
          <p className="text-[11px] text-slate-400">손님이 먼저 보는 자리입니다</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-3.5 py-2.5">
          <p className="text-xs font-medium text-amber-700/80">미등록 있음</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {counts.none}
            <span className="ml-1 text-sm font-medium text-slate-400">대</span>
          </p>
          <p className="text-[11px] text-slate-400">아직 안 올라간 곳이 있습니다</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">맞음</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{counts.ok}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">전체</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{rows.length}</p>
          <p className="text-[11px] text-slate-400">계약중·예약 {counts.skip}대 포함</p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="차량번호 · 차량명"
            className="w-52 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2.5 text-sm outline-none focus:border-indigo-400"
          />
        </span>
        {(
          [
            { key: 'all', label: `전체 ${rows.length}` },
            { key: 'gap', label: `가격 불일치 ${counts.gap}` },
            { key: 'none', label: `미등록 ${counts.none}` },
          ] as const
        ).map(f => (
          <button
            key={f.key}
            onClick={() => setOnly(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              only === f.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      <div ref={dragRef} className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2.5 py-2.5 text-left font-medium">차량번호</th>
              <th className="px-2.5 py-2.5 text-left font-medium">차량명</th>
              <th className="px-2.5 py-2.5 text-right font-medium">판매금액</th>
              {SITES.map(s => (
                <th key={s.key} className="px-2.5 py-2.5 text-right font-medium">
                  {s.label}
                </th>
              ))}
              <th className="px-2.5 py-2.5 text-left font-medium">상태</th>
              <th className="px-2.5 py-2.5 text-left font-medium">메모</th>
              <th className="px-2.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">
                  {rows.length === 0 ? '시트에서 가져오기를 눌러 주세요.' : '해당하는 차가 없습니다.'}
                </td>
              </tr>
            )}
            {shown.map(row => {
              const state = stateOf(row);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-slate-50 last:border-0 ${
                    state.key === 'gap' ? 'bg-red-50/60' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-700">
                    {row.vehicleNumber}
                  </td>
                  <td className="max-w-[280px] truncate px-2.5 py-1.5 text-slate-600" title={row.vehicleName}>
                    {row.vehicleName}
                  </td>
                  {/* 우리 값 — 계약중·예약처럼 숫자가 아닌 건 그 말을 그대로 둔다 */}
                  <td className="px-2.5 py-1.5 text-right">
                    {row.salePrice > 0 ? (
                      <Money value={row.salePrice} onSave={v => void patch(row, { salePrice: v })} />
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400">{row.saleNote || '—'}</span>
                    )}
                  </td>
                  {SITES.map(s => (
                    <td key={s.key} className="px-2.5 py-1.5 text-right">
                      <Money
                        value={row[s.key]}
                        /* 우리 값과 다르면 빨갛게 — 한눈에 어느 쪽이 틀렸는지 보여야 한다 */
                        tone={
                          row.salePrice > 0 && row[s.key] > 0 && row[s.key] !== row.salePrice
                            ? 'text-red-600 font-bold'
                            : undefined
                        }
                        onSave={v => void patch(row, { [s.key]: v } as Partial<Listing>)}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2.5 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_CLASS[state.key]}`}>
                      {state.label}
                    </span>
                    {state.sites.length > 0 && (
                      <span className="ml-1 text-[11px] text-slate-400">{state.sites.join('·')}</span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input
                      defaultValue={row.memo}
                      onBlur={e => e.target.value !== row.memo && void patch(row, { memo: e.target.value })}
                      placeholder="—"
                      className="w-full min-w-[120px] rounded border border-transparent px-1.5 py-0.5 text-xs outline-none hover:border-slate-200 focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <button
                      onClick={() => void remove(row)}
                      className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      title="이 줄을 지웁니다"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        가져오기는 <b>차량번호로 맞춰 덮어씁니다</b> — 시트에 없는 차는 안 지웁니다(시트가 한 번 비어서 오면 통째로
        날아가므로). 지우는 건 줄 오른쪽 휴지통으로 합니다. 금액은 눌러서 바로 고칩니다. 0은 <b>안 올라가 있음</b>입니다.
      </p>
    </div>
  );
}

/**
 * 금액 한 칸 — 눌러서 바로 고친다.
 *
 * 저장 버튼을 따로 두지 않는다. 249줄짜리 표에서 칸마다 버튼을 놓으면 정작 숫자가 안 보인다.
 * 칸을 떠날 때(또는 엔터) 적고, 안 바뀌었으면 아무 일도 안 한다.
 */
function Money({ value, onSave, tone }: { value: number; onSave: (next: number) => void; tone?: string }) {
  const [text, setText] = useState(value > 0 ? NUM(value) : '');

  useEffect(() => setText(value > 0 ? NUM(value) : ''), [value]);

  const commit = () => {
    const next = Number(text.replace(/[^0-9]/g, '')) || 0;
    if (next !== value) onSave(next);
  };

  return (
    <input
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      inputMode="numeric"
      placeholder="미등록"
      className={`w-20 rounded border border-transparent px-1.5 py-0.5 text-right text-xs outline-none hover:border-slate-200 focus:border-indigo-400 ${
        tone ?? 'text-slate-700'
      }`}
    />
  );
}
