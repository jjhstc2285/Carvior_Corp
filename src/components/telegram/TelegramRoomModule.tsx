import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { PLATE_SEARCH_CLASS } from '../../lib/searchBox';
import SettlementCalendar, { SettlementViewToggle, type SettlementView } from '../settlement/SettlementCalendar';

/**
 * 한 방에 무엇이 나갔나.
 *
 * 리스트와 캘린더를 같이 둔다. 리스트는 '무엇이 갔나', 캘린더는 '언제 몇 건 갔나'다 —
 * 그 달에 몇 대를 샀는지, 어느 날이 비었는지는 줄로 늘어놓으면 안 보인다.
 *
 * 못 보낸 것도 같이 뜬다. 안 간 걸 모르는 게 제일 나쁘다 — 방이 끊기면 쪽지는 안 가는데
 * 화면에서는 아무 일도 안 일어나서, 며칠 뒤에야 "요즘 안 오네" 하고 안다.
 */

export interface RoomSpec {
  /** 서버가 아는 방 이름 */
  key: 'SALE' | 'BROADCAST';
  title: string;
  /** 무엇이 왜 올라오는지 — 처음 보는 사람이 읽을 한 줄 */
  hint: string;
  /** 표에 세울 칸 — 쪽지에서 이 이름으로 값을 집는다 */
  columns: { field: string; label: string; align?: string; strong?: boolean }[];
  /** 위쪽 고르는 칸 — 이 값으로 추린다 */
  filterField: { field: string; label: string };
  /** 달력 칸에 한 줄로 들어갈 값 */
  calLabel: string;
  /** 그날 펼쳤을 때 뒤에 붙는 값 */
  calSub: string;
  /*
    서버 .env 에 적는 방 번호 이름 — 안 왔을 때 무엇을 볼지 알려 준다.

    관리자만 보는 방에만 적는다. 전 직원이 보는 화면에 '.env 를 보세요'라고 띄우면
    고칠 수 없는 사람에게 할 일을 시키는 꼴이다.
  */
  envKey?: string;
}

interface LogRow {
  id: string;
  text: string;
  ok: boolean;
  reason: string;
  vehicleNumber: string;
  createdAt: string;
}

/**
 * 쪽지에서 값을 집는다.
 *
 * 두 양식 다 '이름 : 값' 줄로 되어 있다(매입은 앞에 ▶ 가 붙는다). 머리줄과 꼬리줄은
 * 콜론이 없어서 저절로 걸러진다.
 *
 * 보낸 글을 그대로 남기고 여기서 읽는다 — 칸마다 따로 저장해 두면, 양식이 바뀔 때마다
 * 표가 늘고 지난 쪽지는 빈칸이 된다.
 */
function fieldsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^[▶\s]*([^:]+?)\s*:\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** 같은 차에 몇 번째 쪽지이고, 지난번과 무엇이 달라졌나 */
interface Trace {
  seq: number;
  total: number;
  changes: { key: string; from: string; to: string }[];
}

/**
 * 한 차에 쪽지가 여러 번 간다.
 *
 * 판매가는 고칠 때마다 가고, 매입은 등록할 때 한 번 검차 끝나고 또 한 번 간다. 줄만
 * 늘어놓으면 같은 차가 서너 줄씩 보이는데, 그중 무엇이 달라져서 다시 갔는지가 안 보인다 —
 * 광고가가 바뀐 건지 담당자가 바뀐 건지 쪽지를 둘 다 열어 눈으로 맞춰 봐야 했다.
 *
 * 차량번호로 묶어 앞 쪽지와 견준다. 값이 바뀐 칸만 '1,200 → 1,250' 으로 적는다.
 *
 * 보낸 차례대로 봐야 한다 — 목록은 최근 것부터 내려오므로 뒤집어서 센다.
 */
function traceOf(
  rows: { row: { id: string; vehicleNumber: string }; f: Record<string, string> }[],
): Map<string, Trace> {
  const out = new Map<string, Trace>();
  const seen = new Map<string, { f: Record<string, string>; ids: string[] }>();

  for (const p of [...rows].reverse()) {
    const plate = p.row.vehicleNumber.trim();
    if (!plate) {
      out.set(p.row.id, { seq: 1, total: 1, changes: [] });
      continue;
    }
    const prev = seen.get(plate);
    const changes: Trace['changes'] = [];
    if (prev) {
      // 양쪽에 있는 이름을 다 본다 — 칸이 새로 생긴 것도 '바뀜'이다
      for (const key of new Set([...Object.keys(prev.f), ...Object.keys(p.f)])) {
        const from = prev.f[key] ?? '';
        const to = p.f[key] ?? '';
        // 둘 다 비었으면 바뀐 게 아니다. 어느 화면에서 고쳤는지는 값이 아니라 꼬리말이다
        if (from === to) continue;
        changes.push({ key, from, to });
      }
    }
    const ids = [...(prev?.ids ?? []), p.row.id];
    seen.set(plate, { f: p.f, ids });
    out.set(p.row.id, { seq: ids.length, total: 0, changes });
  }

  // 몇 번 중 몇 번째인지 — 전체를 다 세고 나서야 알 수 있다
  for (const { ids } of seen.values()) {
    for (const id of ids) {
      const t = out.get(id);
      if (t) t.total = ids.length;
    }
  }
  return out;
}

const SELECT =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 outline-none focus:border-indigo-400';

export default function TelegramRoomModule({ room }: { room: RoomSpec }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SettlementView>('list');
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [monthPick, setMonthPick] = useState('all');
  const [valuePick, setValuePick] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<LogRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await api<LogRow[]>(`/telegram/logs/${room.key}?limit=300`));
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : '가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [room.key]);

  useEffect(() => {
    void load();
  }, [load]);

  /* 쪽지마다 값을 한 번만 집어 둔다 — 줄마다 다시 읽으면 삼백 줄 × 열여덟 줄이 된다 */
  const parsed = useMemo(
    () => rows.map(r => ({ row: r, f: fieldsOf(r.text), day: dayjs(r.createdAt).format('YYYY-MM-DD') })),
    [rows],
  );

  /** 고를 수 있는 값 — 쌓인 것에서 뽑는다. 미리 적어 두면 새 값이 생길 때마다 고쳐야 한다 */
  const months = useMemo(
    () => [...new Set(parsed.map(p => p.day.slice(0, 7)))].sort((a, b) => b.localeCompare(a)),
    [parsed],
  );
  const values = useMemo(
    () => [...new Set(parsed.map(p => p.f[room.filterField.field]).filter(Boolean))].sort(),
    [parsed, room.filterField.field],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return parsed
      .filter(p => monthPick === 'all' || p.day.startsWith(monthPick))
      .filter(p => valuePick === 'all' || p.f[room.filterField.field] === valuePick)
      // 차량번호가 제일 잦은 검색이라 쪽지 전체에서 찾는다 — 차명·고객이름으로도 걸린다
      .filter(p => !q || p.row.text.includes(q) || p.row.vehicleNumber.includes(q));
  }, [parsed, monthPick, valuePick, query, room.filterField.field]);

  /* 추적은 추리기 전 전체로 센다 — 걸러 놓고 세면 '2번째'가 '1번째'로 보인다 */
  const trace = useMemo(() => traceOf(parsed), [parsed]);

  const failed = filtered.filter(p => !p.row.ok).length;
  /** 두 번 넘게 간 차 — 그만큼 값이 흔들렸다는 뜻이다 */
  const repeated = useMemo(
    () => new Set(filtered.filter(p => (trace.get(p.row.id)?.total ?? 1) > 1).map(p => p.row.vehicleNumber)).size,
    [filtered, trace],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{room.title}</h1>
        <div className="flex items-center gap-2">
          <SettlementViewToggle view={view} onChange={setView} />
          <button
            onClick={() => void load()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </div>

      {/* 고르는 칸과 셈을 한 줄에 — 추리고 나서 몇 건인지가 바로 옆에 있어야 한다 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={valuePick} onChange={e => setValuePick(e.target.value)} className={SELECT}>
          <option value="all">{room.filterField.label} 전체</option>
          {values.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={monthPick} onChange={e => setMonthPick(e.target.value)} className={SELECT}>
          <option value="all">달 전체</option>
          {months.map(m => (
            <option key={m} value={m}>
              {dayjs(`${m}-01`).format('YYYY년 M월')}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호 · 차명 · 이름"
          className={`w-56 px-2.5 py-1.5 text-sm outline-none ${PLATE_SEARCH_CLASS}`}
        />
        <span className="text-sm text-slate-500">
          총 {filtered.length}건
          {/* 같은 차에 여러 번 간 게 몇 대인지 — 값이 흔들린 차가 몇 대냐는 말이다 */}
          {repeated > 0 && <span className="ml-1.5 text-slate-400">· 두 번 넘게 간 차 {repeated}대</span>}
          {/* 못 간 게 있으면 먼저 말한다 — 안 간 걸 모르는 게 제일 나쁘다 */}
          {failed > 0 && <b className="ml-1.5 font-bold text-red-600">· 못 보냄 {failed}건</b>}
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-400">{room.hint}</p>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!busy && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-slate-500">아직 이 방으로 나간 게 없습니다.</p>
          {/* 방이 안 적혀 있으면 아무것도 안 나간다 — 고칠 수 있는 사람에게만 적어 준다 */}
          {room.envKey && (
            <p className="mt-1 text-xs text-slate-400">
              서버 <code>.env</code> 의 <code>{room.envKey}</code> 에 방 번호가 있는지 확인해 주세요.
            </p>
          )}
        </div>
      )}

      {view === 'calendar' ? (
        <SettlementCalendar
          month={month}
          onMonthChange={setMonth}
          items={filtered.map(p => ({
            id: p.row.id,
            date: p.day,
            label: p.f[room.calLabel] || p.row.vehicleNumber || '(이름 없음)',
            sublabel: p.f[room.calSub] ?? '',
            tone: p.row.ok ? 'done' : 'progress',
            onSelect: () => setOpen(p.row),
          }))}
        />
      ) : (
        rows.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr>
                    <th className="px-3 py-3 font-medium">보낸 때</th>
                    {room.columns.map(c => (
                      <th key={c.field} className={`px-3 py-3 font-medium ${c.align ?? ''}`}>
                        {c.label}
                      </th>
                    ))}
                    {/* 같은 차에 몇 번째이고 무엇이 달라졌나 — 중복처럼 보이는 줄의 까닭이다 */}
                    <th className="px-3 py-3 font-medium">바뀐 것</th>
                    <th className="px-3 py-3 text-right font-medium">쪽지</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={room.columns.length + 3} className="px-5 py-10 text-center text-sm text-slate-400">
                        찾는 건이 없습니다.
                      </td>
                    </tr>
                  )}
                  {filtered.map(({ row, f }) => {
                    const t = trace.get(row.id);
                    return (
                    /* 줄을 누르면 보낸 글이 그대로 뜬다 — 방에 뜬 것과 견줘 보는 자리다 */
                    <tr
                      key={row.id}
                      onClick={e => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setOpen(row);
                      }}
                      title="눌러서 보낸 글을 봅니다"
                      className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50/40 ${
                        row.ok ? '' : 'bg-red-50/40'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {row.ok ? (
                            <Check size={12} className="shrink-0 text-emerald-500" />
                          ) : (
                            <AlertTriangle size={12} className="shrink-0 text-red-500" />
                          )}
                          <span className="tabular-nums text-slate-500">
                            {dayjs(row.createdAt).format('YYYY-MM-DD HH:mm')}
                          </span>
                        </div>
                      </td>
                      {room.columns.map(c => (
                        <td key={c.field} className={`px-3 py-2.5 ${c.align ?? ''}`}>
                          {f[c.field] ? (
                            <span className={c.strong ? 'font-semibold text-slate-800' : 'text-slate-600'}>
                              {f[c.field]}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="whitespace-normal px-3 py-2.5">
                        <div className="flex max-w-md flex-wrap items-center gap-1">
                          {/* 두 번 이상 간 차만 차례를 적는다 — 한 번뿐인 줄에 '1/1'은 잡음이다 */}
                          {t && t.total > 1 && (
                            <span
                              className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600"
                              title={`이 차로 모두 ${t.total}번 나갔습니다`}
                            >
                              {t.seq}/{t.total}번째
                            </span>
                          )}
                          {t && t.seq === 1 && t.total > 1 && (
                            <span className="text-[11px] text-slate-400">처음</span>
                          )}
                          {t && t.seq > 1 && t.changes.length === 0 && (
                            <span className="text-[11px] text-slate-400">값은 그대로</span>
                          )}
                          {t?.changes.map(c => (
                            <span
                              key={c.key}
                              className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
                              title={`${c.key} : ${c.from || '(빈칸)'} → ${c.to || '(빈칸)'}`}
                            >
                              <b className="font-bold">{c.key}</b> {c.from || '—'} → {c.to || '—'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => void navigator.clipboard.writeText(row.text).then(() => setCopied(row.id))}
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                          title="글을 그대로 복사합니다"
                        >
                          <Copy size={12} className="inline" /> {copied === row.id ? '복사됨' : '복사'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* 보낸 글 그대로 — 방에 뜬 것과 같은 꼴이어야 견줄 수 있다 */}
      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">{dayjs(open.createdAt).format('YYYY-MM-DD HH:mm')}</h3>
              {!open.ok && <span className="text-xs font-semibold text-red-600">못 보냄</span>}
              <button
                onClick={() => void navigator.clipboard.writeText(open.text).then(() => setCopied(open.id))}
                className="ml-auto rounded px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                {copied === open.id ? '복사됨' : '복사'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">
              {open.text}
            </pre>
            {!open.ok && open.reason && <p className="mt-2 text-xs text-red-600">{open.reason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
