import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { useStore } from '../../store';
import { CLEANING_FLOORS, type CleaningItemKey, type CleaningLog, type Role } from '../../types';

interface Props {
  role: Role;
}

type CheckState = Partial<Record<CleaningItemKey, boolean>>;

/**
 * 청소 관리 대장.
 *
 * 벽에 붙여두고 손으로 체크하던 종이를 그대로 옮겼다 —
 * 날짜 / 청소 담당자 / 시간 / 항목 체크 / 기타.
 *
 * 층마다 대장이 따로 있고 항목도 다르다(5층은 파쇄기·종이컵, 1층은 물걸레).
 * 어떤 층에 무엇이 있는지는 types.ts 의 CLEANING_FLOORS 가 정한다.
 *
 * 청소를 막 끝내고 적는 흐름이라 날짜·시간·담당자는 미리 채워둔다.
 * 표에서도 체크를 바로 눌러 고칠 수 있다(빠뜨린 걸 나중에 채우는 일이 잦다).
 */
export default function CleaningModule({ role }: Props) {
  const { state } = useStore();
  const [floorKey, setFloorKey] = useState(CLEANING_FLOORS[0].key);
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [rows, setRows] = useState<CleaningLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // 등록 줄 — 지금 시각과 본인으로 채워 둔다.
  const [checks, setChecks] = useState<CheckState>({});
  const [note, setNote] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [time, setTime] = useState(() => dayjs().format('HH:mm'));
  const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [busy, setBusy] = useState(false);

  const isAdmin = role === 'ADMIN';
  // 지금 보고 있는 층의 항목 목록 — 표·등록·엑셀이 모두 이걸 따른다.
  const floor = CLEANING_FLOORS.find(f => f.key === floorKey) ?? CLEANING_FLOORS[0];
  const items = floor.items;

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<CleaningLog[]>(`/cleaning?month=${month}&floor=${floorKey}`);
      if (myReq !== reqId.current) return;
      setRows(data);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '청소 기록을 불러오지 못했습니다.');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [month, floorKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // 내 계정이 명단에 잡히면 담당자 기본값으로 둔다.
  useEffect(() => {
    if (!employeeId && state.currentEmployeeId) setEmployeeId(state.currentEmployeeId);
  }, [employeeId, state.currentEmployeeId]);

  const employeeName = (id: string) => state.employees.find(e => e.id === id)?.name ?? '';

  /** 이번 달에 누가 몇 번 했는지 — 대장을 벽에 붙여두던 이유가 이거다. */
  const byStaff = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.employeeId, (count.get(r.employeeId) ?? 0) + 1);
    return [...count.entries()]
      .map(([id, n]) => ({ id, name: employeeName(id) || '(퇴사)', count: n }))
      .sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.employees]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/cleaning', {
        method: 'POST',
        body: { floor: floorKey, date, time, employeeId, ...checks, note: note.trim() },
      });
      setChecks({});
      setNote('');
      setTime(dayjs().format('HH:mm'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /** 표에서 체크를 바로 누르면 그 줄만 갈아끼운다 — 전체를 다시 받으면 화면이 튄다. */
  const toggle = async (row: CleaningLog, key: CleaningItemKey) => {
    const next = !row[key];
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [key]: next } : r)));
    try {
      await api(`/cleaning/${row.id}`, { method: 'PATCH', body: { [key]: next } });
    } catch (e) {
      // 서버가 거부하면 화면을 되돌린다 — 안 그러면 체크된 것처럼 보인 채로 남는다.
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [key]: !next } : r)));
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.');
    }
  };

  const remove = async (row: CleaningLog) => {
    if (!(await confirmDanger(`${row.date} ${row.time} 청소 기록을 지울까요?`))) return;
    try {
      await api(`/cleaning/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('삭제하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const handleExport = () => {
    const data = rows.map(r => ({
      날짜: r.date,
      '청소 담당자': r.employee?.name ?? employeeName(r.employeeId),
      시간: r.time,
      ...Object.fromEntries(items.map(i => [i.label, r[i.key] ? 'V' : ''])),
      기타: r.note,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${floor.label} 청소관리대장`);
    XLSX.writeFile(wb, `청소관리대장_${floor.label}_${month}.xlsx`);
  };

  const allChecked = items.every(i => checks[i.key]);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">청소 관리 대장</h1>
          <p className="mt-1 text-sm text-slate-500">
            청소를 끝내고 항목을 체크해 등록하세요. 날짜·시간·담당자는 지금 기준으로 채워져 있습니다.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Download size={15} /> 엑셀
        </button>
      </div>

      {/* 층마다 대장이 따로 있고 항목도 다르다 */}
      <div className="mb-4 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {CLEANING_FLOORS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFloorKey(f.key); setChecks({}); }}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              floorKey === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 층마다 붙는 주의사항 — 체크 항목이 아니라 청소할 때 지킬 일이다 */}
      {floor.notice && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          ※ {floor.notice}
        </p>
      )}

      {/* 등록 줄 — 대장 한 줄을 그대로 적는 모양 */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">청소 담당자</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {state.employees.filter(e => e.active).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">시간</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <button
            type="button"
            onClick={() => setChecks(allChecked ? {} : Object.fromEntries(items.map(i => [i.key, true])) as CheckState)}
            className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            <Sparkles size={12} /> {allChecked ? '전체 해제' : '전체 체크'}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setChecks(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                checks[item.key]
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {checks[item.key] ? '✓ ' : ''}{item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="기타 (특이사항이 있으면 적으세요)"
            className="min-w-56 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={15} /> 등록
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        {byStaff.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {byStaff.map(s => (
              <span key={s.id} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                {s.name} <b className="text-slate-800">{s.count}</b>
              </span>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `총 ${rows.length}건`}</span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                <th className="px-3 py-2.5 text-left font-medium">날짜</th>
                <th className="px-3 py-2.5 text-left font-medium">청소 담당자</th>
                <th className="px-3 py-2.5 text-left font-medium">시간</th>
                {items.map(i => (
                  <th key={i.key} className="px-2 py-2.5 text-center font-medium">{i.label}</th>
                ))}
                <th className="px-3 py-2.5 text-left font-medium">기타</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={items.length + 5} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : `${floor.label} ${dayjs(month).format('M월')} 청소 기록이 없습니다.`}
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-600">{dayjs(r.date).format('M/D')}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{r.employee?.name ?? employeeName(r.employeeId)}</td>
                  <td className="px-3 py-2 text-slate-500">{r.time}</td>
                  {items.map(i => (
                    <td key={i.key} className="px-2 py-2 text-center">
                      {/* 빠뜨린 항목을 나중에 채우는 일이 잦아 표에서 바로 누를 수 있게 둔다 */}
                      <button
                        onClick={() => void toggle(r, i.key)}
                        className={`h-5 w-5 rounded border text-[11px] font-bold transition-colors ${
                          r[i.key]
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white text-transparent hover:border-slate-400'
                        }`}
                        aria-label={i.label}
                      >
                        ✓
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-slate-500">{r.note || <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-2">
                    {/* 잘못 적었을 때 본인이 지울 수 있어야 한다 */}
                    {(isAdmin || r.employeeId === state.currentEmployeeId) && (
                      <button
                        onClick={() => void remove(r)}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
