import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Flower2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { withCommas, moneyToNumber } from '../../lib/money';
import { useTableSort, type SortColumn } from '../table/useTableSort';
import CondolenceForm from './CondolenceForm';
import { KIND_LABEL, KIND_STYLE, KINDS, type Condolence, type CondolenceKind } from './condolence';

/**
 * 경조사비 대장.
 *
 * 지금은 카톡으로 주고받고 만다. "김재웅 20만원 플러스 화환" 같은 말이 흩어져 있어서,
 * 연말에 얼마를 썼는지도 모르고 다음에 같은 자리에서 얼마를 내야 하는지도 모른다.
 * 받은 데 또 안 내는 일도, 두 번 내는 일도 여기서 생긴다.
 *
 * 화환은 금액과 따로 센다. 대표님 말씀대로 '전부 화환은 추가'라 한 칸에 합쳐 두면
 * 축의금이 얼마였는지가 사라진다.
 *
 * 해 단위로 본다 — 연말에 얼마 썼는지 세고 다음 해에 다시 센다.
 */

export default function CondolenceModule() {
  const [year, setYear] = useState(() => dayjs().year());
  const [years, setYears] = useState<number[]>([dayjs().year()]);
  const [rows, setRows] = useState<Condolence[]>([]);
  const [kindFilter, setKindFilter] = useState<CondolenceKind | 'all'>('all');
  /*
    경조사와 명절 선물세트를 나눈다.

    성격이 다른 돈이다 — 경조사는 그 집 일이 있을 때 한 번 내는 것이고, 명절 세트는
    해마다 돌리는 것이다. 한 표에 섞여 있으면 "올해 경조사비 얼마 썼나"가 안 나온다.
  */
  const [book, setBook] = useState<'condolence' | 'holiday'>('condolence');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Condolence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, ys] = await Promise.all([
        api<Condolence[]>(`/condolences?year=${year}`),
        api<number[]>('/condolences/years').catch(() => [dayjs().year()]),
      ]);
      setRows(list);
      setYears(ys);
    } catch (e) {
      setError(e instanceof Error ? e.message : '경조사 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows
      .filter(r => (book === 'holiday' ? r.kind === 'HOLIDAY' : r.kind !== 'HOLIDAY'))
      .filter(r => kindFilter === 'all' || r.kind === kindFilter)
      .filter(r => !q || r.person.includes(q) || r.memo.includes(q) || r.place.includes(q));
  }, [rows, book, kindFilter, query]);

  /** 화환은 따로 센다 — 합쳐 두면 얼마를 냈는지가 사라진다 */
  const sum = useMemo(
    () => ({
      amount: filtered.reduce((s, r) => s + r.amount, 0),
      wreath: filtered.reduce((s, r) => s + (r.wreath ? r.wreathPrice : 0), 0),
      count: filtered.length,
      wreathCount: filtered.filter(r => r.wreath).length,
    }),
    [filtered],
  );

  /** 종류별로 얼마나 나갔는지 — 어디에 돈이 몰렸는지 한눈에 */
  const byKind = useMemo(
    () =>
      KINDS.map(k => {
        const mine = rows.filter(r => r.kind === k);
        return {
          kind: k,
          count: mine.length,
          total: mine.reduce((s, r) => s + r.amount + (r.wreath ? r.wreathPrice : 0), 0),
        };
      }).filter(x => x.count > 0),
    [rows],
  );

  const COLUMNS: SortColumn<Condolence>[] = [
    { key: 'eventOn', label: '일자', value: r => r.eventOn },
    { key: 'kind', label: '구분', value: r => KIND_LABEL[r.kind] },
    { key: 'person', label: '대상', value: r => r.person },
    { key: 'subject', label: '관계', value: r => r.subject },
    // 받은 쪽은 나중에 갚는다 — 그때 연락할 번호를 대장에서 바로 본다
    { key: 'phone', label: '연락처', value: r => r.phone },
    { key: 'amount', label: '금액', value: r => r.amount, align: 'text-right' },
    { key: 'wreath', label: '화환', value: r => (r.wreath ? r.wreathPrice : null), align: 'text-right' },
    { key: 'total', label: '합계', value: r => r.amount + (r.wreath ? r.wreathPrice : 0), align: 'text-right' },
    { key: 'place', label: '장소 · 메모', value: r => r.place || r.memo },
    { key: 'actions', label: '관리', align: 'text-right' },
  ];
  const sorter = useTableSort(COLUMNS);
  const sorted = sorter.apply(filtered);

  const remove = async (row: Condolence) => {
    const ok = await confirmDanger(`${row.person} 경조사 기록을 지울까요?`, '되돌릴 수 없습니다.');
    if (!ok) return;
    try {
      await api(`/condolences/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof Error ? e.message : '');
    }
  };

  const download = () => {
    const data = sorted.map(r => ({
      일자: r.eventOn,
      구분: KIND_LABEL[r.kind],
      대상: r.person,
      소속: r.relation,
      관계: r.subject,
      연락처: r.phone,
      금액: r.amount,
      화환: r.wreath ? r.wreathPrice : 0,
      합계: r.amount + (r.wreath ? r.wreathPrice : 0),
      장소: r.place,
      메모: r.memo,
    }));
    data.push({
      일자: '',
      구분: '합계',
      대상: '',
      소속: '',
      관계: '',
      연락처: '',
      금액: sum.amount,
      화환: sum.wreath,
      합계: sum.amount + sum.wreath,
      장소: '',
      메모: '',
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년 경조사비`);
    XLSX.writeFile(wb, `경조사비_${year}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">경조사비 대장</h1>
        <p className="mt-1 text-sm text-slate-500">
          결혼·장례·명절에 나간 돈을 한곳에 둡니다. 화환은 금액과 따로 세니, 다음에 같은 자리에서 얼마를 내야 할지 바로
          보입니다.
        </p>
      </div>

      {/* 올해 얼마나 나갔나 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-400">경조사비</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {withCommas(String(sum.amount))}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{sum.count}건</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-400">화환</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">
            {withCommas(String(sum.wreath))}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{sum.wreathCount}건</p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-xs font-medium text-indigo-500">합계</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {withCommas(String(sum.amount + sum.wreath))}
            <span className="ml-1 text-sm font-medium text-indigo-400">원</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-1 text-xs font-medium text-slate-400">구분별</p>
          <div className="space-y-0.5">
            {byKind.length === 0 && <p className="text-[11px] text-slate-300">아직 없습니다</p>}
            {byKind.map(k => (
              <p key={k.kind} className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-500">
                  {KIND_LABEL[k.kind]} <span className="text-slate-300">{k.count}</span>
                </span>
                <span className="font-semibold text-slate-700">{withCommas(String(k.total))}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> 등록
        </button>

        {/* 성격이 다른 돈이라 장부를 나눈다 — 섞이면 "올해 경조사비 얼마 썼나"가 안 나온다 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {([
            ['condolence', '경조사'],
            ['holiday', '명절 선물'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setBook(key);
                setKindFilter('all');
              }}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                book === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}{' '}
              <span className="font-bold">
                {rows.filter(r => (key === 'holiday' ? r.kind === 'HOLIDAY' : r.kind !== 'HOLIDAY')).length}
              </span>
            </button>
          ))}
        </div>

        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        {/* 명절 장부는 구분이 하나뿐이라 고를 게 없다 */}
        {book === 'condolence' && (
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as CondolenceKind | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="all">전체 구분</option>
            {KINDS.filter(k => k !== 'HOLIDAY').map(k => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="이름 · 장소 · 메모"
          className="w-48 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />

        <button
          onClick={download}
          disabled={sorted.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">{sorter.headers()}</tr>
            </thead>
            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-5 py-10 text-center text-sm text-slate-400">
                    {year}년에 적힌 경조사가 없습니다.
                  </td>
                </tr>
              )}
              {sorted.map(r => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{dayjs(r.eventOn).format('M/D (ddd)')}</td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[r.kind]}`}>
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-700">
                    {r.person}
                    {r.relation && <span className="ml-1 text-xs text-slate-400">{r.relation}</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-slate-500">{r.subject || '—'}</td>
                  {/*
                    연락처 칸을 안 그려서 뒤가 통째로 한 칸씩 밀려 있었다 — 금액이 연락처
                    자리에, 화환이 금액 자리에 앉아 장례 15만원이 전화번호로 보였다.
                    머리글은 COLUMNS 가, 몸은 여기가 그린다. 둘이 따로라 칸을 더할 때
                    한쪽만 고치면 이렇게 된다.
                  */}
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-slate-500">
                    {r.phone || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold text-slate-800">
                    {r.amount > 0 ? withCommas(String(r.amount)) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">
                    {r.wreath ? (
                      <span className="inline-flex items-center gap-1 text-rose-600">
                        <Flower2 size={12} />
                        {withCommas(String(r.wreathPrice))}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right font-bold text-indigo-700">
                    {withCommas(String(r.amount + (r.wreath ? r.wreathPrice : 0)))}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-500">
                    {r.place}
                    {r.place && r.memo && ' · '}
                    <span className="text-slate-400">{r.memo}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing(r);
                          setFormOpen(true);
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void remove(r)}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <CondolenceForm
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** 폼에서도 쓰는 값 변환 — 한 곳에 둔다 */
export { moneyToNumber };
