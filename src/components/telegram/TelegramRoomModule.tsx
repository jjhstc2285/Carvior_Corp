import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Check, Copy, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { PLATE_SEARCH_CLASS } from '../../lib/searchBox';
import SettlementCalendar, { SettlementViewToggle, type SettlementView } from '../settlement/SettlementCalendar';
import { ColumnResetButton, useColumnOrder, type Column } from '../table/useColumnOrder';
import SaleCardForm from './SaleCardForm';

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
    손으로 올릴 수 있는 방인가.

    입금방만이다. 공지방·매입방은 일이 벌어지면 저절로 나가는 자리라, 거기에 손으로
    끼워 넣으면 방에 뜬 줄과 시스템이 아는 것이 어긋난다.
  */
  canCompose?: boolean;
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
  /** 손으로 올렸으면 올린 사람 */
  sentBy: string;
  createdAt: string;
  /*
    아직 안 올린 차인가.

    매입 관리에 있는데 방에 쪽지가 간 적이 없는 차다. 올린 줄과 같은 표에 섞어 둔다 —
    따로 두면 무엇이 남았는지 보려고 두 화면을 번갈아 봐야 한다.

    보낸 적이 없으니 보낸 때도, 지울 쪽지도 없다. 매입일을 대신 적는다.
  */
  pending?: boolean;
  /*
    상담이 붙은 차인가 — 안 올린 줄에만 쓴다.

    오백 대 중 어느 것이 실제로 손님이 붙은 차인지가 여기서 갈린다. 상담이 없는 차는
    아직 광고도 안 나간 차라, 입금 이야기가 나올 자리가 아니다.
  */
  lead?: boolean;
}

/** 매입 관리에서 불러온 칸 — 금액은 만원이다. 광고가·코드가는 그날 정하는 값이라 안 온다 */
interface Fill {
  vehicleNumber: string;
  vehicleName: string;
  dealer: string;
  purchasePrice: number;
  brokerFee: number;
  platform: string;
  intakeOn: string;
  hasLead: boolean;
}

/**
 * 아직 안 올린 차를 쪽지 꼴로 세운다.
 *
 * 표는 쪽지 글에서 칸을 집는다(fieldsOf). 그러니 이 줄도 같은 꼴이면 표가 그대로 읽는다 —
 * 칸마다 따로 길을 내면 양식이 바뀔 때 두 군데를 고쳐야 한다.
 *
 * 광고가·코드가는 비워 둔다. 적어 넣을 자리라는 게 표에서 '—'로 보여야 한다.
 */
function pendingRow(f: Fill): LogRow {
  const man = (n: number) => n.toLocaleString();
  const bought = f.purchasePrice > 0 ? `${man(f.purchasePrice)}만원${f.brokerFee > 0 ? `+${man(f.brokerFee)}만원` : ''}` : '';
  const text = [
    `담당자 : ${f.dealer}`,
    `차량번호 : ${f.vehicleNumber}`,
    `차량명 : ${f.vehicleName}`,
    `매입가 : ${bought}`,
    '광고가 : ',
    '코드가 : ',
    '입금 : -90',
    `유입경로 : ${f.platform}`,
  ].join('\n');
  return {
    id: `pending:${f.vehicleNumber}`,
    text,
    ok: true,
    reason: '',
    vehicleNumber: f.vehicleNumber,
    sentBy: '',
    createdAt: `${f.intakeOn}T00:00:00.000Z`,
    pending: true,
    lead: f.hasLead,
  };
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

/*
  바뀐 값에 입히는 색.

  처음 고친 건 파랑, 그다음부터 빨강이다 — 한 번 고쳐 적는 건 흔한 일이지만, 같은 차를
  세 번 네 번 고쳐 올리고 있으면 값이 흔들리는 중이라는 뜻이고 그건 눈에 걸려야 한다.

  방에서는 색을 못 쓴다. 텔레그램 봇이 넣을 수 있는 건 굵게·기울임·취소선·밑줄뿐이라,
  거기서는 굵게 적고 몇 번째인지를 꼬리에 숫자로 적는다.
*/
const changeTone = (seq: number) => (seq <= 2 ? 'font-bold text-blue-600' : 'font-bold text-red-600');

export default function TelegramRoomModule({ room }: { room: RoomSpec }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SettlementView>('list');
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [monthPick, setMonthPick] = useState('all');
  const [valuePick, setValuePick] = useState('all');
  /** 올린 것만·안 올린 것만 — 남은 게 몇 대인지가 제일 잦은 물음이다 */
  const [sentPick, setSentPick] = useState<'all' | 'sent' | 'pending' | 'lead'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<LogRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /*
    새로 올리는 중.

    null 이면 안 열려 있다. '' 는 빈 칸으로 새로, 글이 들어 있으면 그 값으로 채워서
    새로 올린다(아직 안 올린 차를 눌렀을 때다) — 고치는 줄은 open 이 들고 있다.
  */
  const [adding, setAdding] = useState<string | null>(null);
  /** '바뀐 것'을 펼쳐 둔 줄 — 한 번에 하나만 펼친다 */
  const [detail, setDetail] = useState<string | null>(null);

  /*
    표에 세울 칸.

    쪽지에서 집는 칸(방마다 다르다)에 어느 방에나 있는 칸을 앞뒤로 붙인다.

    차례는 사람마다 다르게 둔다. 돈 넣는 사람은 광고가부터 보고, 올린 걸 훑는 사람은
    보낸 때부터 본다 — 끌어 옮긴 차례는 그 브라우저에만 남는다.
  */
  const COLUMNS: Column[] = useMemo(
    () => [
      ...(room.canCompose ? [{ key: 'drop', label: '삭제' }] : []),
      { key: 'sentAt', label: '보낸 때' },
      ...room.columns.map(c => ({ key: c.field, label: c.label, align: c.align })),
      { key: 'changes', label: '바뀐 것', title: '같은 차로 몇 번째이고, 지난 쪽지와 무엇이 달라졌나' },
      { key: 'actions', label: '쪽지', align: 'text-right' },
    ],
    [room],
  );
  const cols = useColumnOrder(`telegram-room-${room.key}`, COLUMNS);

  /** 아직 안 올린 차 — 올린 줄과 같은 표에 섞는다 */
  const [pending, setPending] = useState<LogRow[]>([]);

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
    /*
      안 올린 차는 따로 받아 온다.

      못 받아와도 올린 줄은 보여야 한다 — 매입 관리가 비었든 서버가 아직 새 것이
      아니든, 그것 때문에 화면이 통째로 비면 안 된다.
    */
    if (!room.canCompose) return;
    try {
      setPending((await api<Fill[]>('/telegram/sale/pending')).map(pendingRow));
    } catch {
      setPending([]);
    }
  }, [room.key, room.canCompose]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 한 줄을 지운다 — 방에서도 지운다.
   *
   * 목록에서만 지우면 방에는 그 쪽지가 그대로 남는다. 지우는 까닭이 그 방을 보는 사람이
   * 틀린 숫자로 입금을 넣지 않게 하려는 거라, 방에 남으면 아무 소용이 없다.
   *
   * 방에서 못 지우는 때가 있다(텔레그램은 이틀이 지난 쪽지를 봇이 못 지우게 한다).
   * 그때는 말없이 넘어가지 않고 "방에서 직접 지워 주세요"라고 말해 준다.
   */
  const drop = async (row: LogRow) => {
    const ok = await confirmDanger(
      `${row.vehicleNumber || '이 쪽지'} 를 지울까요?`,
      '입금확인방에서도 함께 지웁니다. 올린 지 이틀이 지난 쪽지는 방에서 못 지울 수 있습니다.',
    );
    if (!ok) return;
    try {
      const done = await api<{ inRoom: boolean; reason: string }>(`/telegram/sale/${row.id}`, { method: 'DELETE' });
      if (!done.inRoom) {
        void alertError(
          '방에서는 못 지웠습니다',
          '목록에서는 지웠습니다. 텔레그램 입금확인방에서 직접 지워 주세요.',
          done.reason,
        );
      }
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
    await load();
  };

  /*
    올린 줄과 안 올린 차를 한 줄 세운다 — 최근 것이 위다.

    올린 줄은 보낸 때로, 안 올린 차는 매입일로 센다. 둘 다 '그 차 이야기가 생긴 날'이라
    같은 자로 놓고 봐도 된다.
  */
  const all = useMemo(
    () => [...rows, ...pending].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, pending],
  );

  /* 쪽지마다 값을 한 번만 집어 둔다 — 줄마다 다시 읽으면 삼백 줄 × 열여덟 줄이 된다 */
  const parsed = useMemo(
    () => all.map(r => ({ row: r, f: fieldsOf(r.text), day: dayjs(r.createdAt).format('YYYY-MM-DD') })),
    [all],
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
      .filter(p => {
        if (sentPick === 'all') return true;
        if (sentPick === 'sent') return !p.row.pending;
        if (sentPick === 'pending') return !!p.row.pending;
        // 상담이 붙은 차만 — 아직 광고도 안 나간 차는 입금 이야기가 나올 자리가 아니다
        return !!p.row.pending && !!p.row.lead;
      })
      .filter(p => monthPick === 'all' || p.day.startsWith(monthPick))
      .filter(p => valuePick === 'all' || p.f[room.filterField.field] === valuePick)
      // 차량번호가 제일 잦은 검색이라 쪽지 전체에서 찾는다 — 차명·고객이름으로도 걸린다
      .filter(p => !q || p.row.text.includes(q) || p.row.vehicleNumber.includes(q));
  }, [parsed, monthPick, valuePick, query, sentPick, room.filterField.field]);

  /* 추적은 추리기 전 전체로 센다 — 걸러 놓고 세면 '2번째'가 '1번째'로 보인다 */
  const trace = useMemo(() => traceOf(parsed.filter(p => !p.row.pending)), [parsed]);

  const failed = filtered.filter(p => !p.row.ok && !p.row.pending).length;
  const waiting = filtered.filter(p => p.row.pending).length;
  /** 두 번 넘게 간 차 — 그만큼 값이 흔들렸다는 뜻이다 */
  const repeated = useMemo(
    () => new Set(filtered.filter(p => (trace.get(p.row.id)?.total ?? 1) > 1).map(p => p.row.vehicleNumber)).size,
    [filtered, trace],
  );

  // 칸이 열한 개다 — 가로를 안 묶는다. 묶어 두면 '바뀐 것'이 늘 화면 밖에 있다
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{room.title}</h1>
        <div className="flex items-center gap-2">
          {/* 손으로 올리는 자리 — 입금방만이다 */}
          {room.canCompose && (
            <button
              onClick={() => setAdding('')}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> 쪽지 올리기
            </button>
          )}
          <SettlementViewToggle view={view} onChange={setView} />
          {view === 'list' && <ColumnResetButton onReset={cols.reset} />}
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
        {room.canCompose && (
          <select
            value={sentPick}
            onChange={e => setSentPick(e.target.value as 'all' | 'sent' | 'pending' | 'lead')}
            className={SELECT}
          >
            <option value="all">올린 것 + 안 올린 차</option>
            <option value="sent">올린 것만</option>
            <option value="pending">안 올린 차만</option>
            <option value="lead">안 올린 차 · 상담 붙은 것만</option>
          </select>
        )}
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
          {/* 남은 게 몇 대인지 — 이 화면에서 제일 잦은 물음이다 */}
          {waiting > 0 && <b className="ml-1.5 font-bold text-amber-600">· 안 올린 차 {waiting}대</b>}
          {failed > 0 && <b className="ml-1.5 font-bold text-red-600">· 못 보냄 {failed}건</b>}
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-400">{room.hint}</p>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!busy && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-slate-500">
            {room.canCompose ? '아직 올린 게 없습니다. 위 [쪽지 올리기] 로 올립니다.' : '아직 이 방으로 나간 게 없습니다.'}
          </p>
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
                  <tr>{cols.headers()}</tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={cols.count} className="px-5 py-10 text-center text-sm text-slate-400">
                        찾는 건이 없습니다.
                      </td>
                    </tr>
                  )}
                  {filtered.map(({ row, f }) => {
                    const t = trace.get(row.id);
                    return (
                      /* 줄을 누르면 고치는 창이 뜬다 — 적는 창에 보낸 글이 그대로 보인다 */
                      <tr
                        key={row.id}
                        onClick={e => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          // 안 올린 차는 고칠 쪽지가 없다 — 그 값으로 새로 올린다
                          if (row.pending) setAdding(row.text);
                          else setOpen(row);
                        }}
                        title={
                          row.pending
                            ? '눌러서 광고가를 적고 올립니다'
                            : room.canCompose
                              ? '눌러서 고칩니다'
                              : '눌러서 보낸 글을 봅니다'
                        }
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50/40 ${
                          row.pending ? 'bg-amber-50/30' : row.ok ? '' : 'bg-red-50/40'
                        }`}
                      >
                        {cols.cells(
                          {
                            // 맨 앞에 지우는 칸 — 잘못 올린 줄을 바로 내린다
                            drop: row.pending ? null : (
                              <button
                                onClick={() => void drop(row)}
                                className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                                title="이 쪽지를 지웁니다 — 방에서도 지웁니다"
                              >
                                <Trash2 size={14} />
                              </button>
                            ),

                            sentAt: row.pending ? (
                              /* 보낸 적이 없다 — 매입일을 대신 적는다 */
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  안 올림
                                </span>
                                {/* 상담이 붙은 차 — 손님이 붙었다는 뜻이라 먼저 올릴 자리다 */}
                                {row.lead && (
                                  <span
                                    className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700"
                                    title="상담이 붙은 차입니다"
                                  >
                                    상담
                                  </span>
                                )}
                                <span className="tabular-nums text-slate-400">
                                  {dayjs(row.createdAt).format('YYYY-MM-DD')} 매입
                                </span>
                              </div>
                            ) : (
                              <>
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
                                {/* 손으로 올린 줄은 누가 올렸는지가 남는다 — 숫자를 물어볼 자리다 */}
                                {row.sentBy && <div className="mt-0.5 pl-[18px] text-[11px] text-slate-400">{row.sentBy}</div>}
                              </>
                            ),

                            /* 쪽지에서 집는 칸 — 지난 쪽지와 달라진 값은 색으로 칠한다 */
                            ...Object.fromEntries(
                              room.columns.map(c => {
                                const moved = t?.changes.find(x => x.key === c.field);
                                return [
                                  c.field,
                                  f[c.field] ? (
                                    <span
                                      className={
                                        moved
                                          ? changeTone(t?.seq ?? 1)
                                          : c.strong
                                            ? 'font-semibold text-slate-800'
                                            : 'text-slate-600'
                                      }
                                      title={moved ? `${moved.from || '(빈칸)'} → ${moved.to || '(빈칸)'}` : undefined}
                                    >
                                      {f[c.field]}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  ),
                                ];
                              }),
                            ),

                            /*
                              바뀐 것 — 한 줄로 접어 둔다.

                              'A → B' 로 다 펼쳐 놓았더니 세 칸만 바뀌어도 줄 높이가
                              손가락 길이가 됐다. 늘 보는 건 '무엇이 바뀌었나'지 '얼마가
                              얼마로'가 아니다 — 그건 궁금할 때만 펼친다.

                              안쪽에 너비를 못 박은 칸을 하나 둔다. 표는 글이 길면 칸을
                              늘려 버려서, 칸에 너비를 적어 두는 것만으로는 안 잘린다.
                            */
                            changes: t && t.total > 1 && (
                              <div className="w-56">
                                <div className="flex items-center gap-1">
                                  <span
                                    className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600"
                                    title={`이 차로 모두 ${t.total}번 올라갔습니다`}
                                  >
                                    {t.seq}/{t.total}
                                  </span>

                                  {t.seq === 1 ? (
                                    <span className="text-[11px] text-slate-400">처음</span>
                                  ) : t.changes.length === 0 ? (
                                    <span className="text-[11px] text-slate-400">값은 그대로</span>
                                  ) : (
                                    <>
                                      {/* 이름만 한 줄로 — 넘치면 잘린다. 값은 펼쳐야 보인다 */}
                                      <span
                                        className={`min-w-0 flex-1 truncate text-[11px] ${changeTone(t.seq)}`}
                                        title={t.changes
                                          .map(c => `${c.key} : ${c.from || '(빈칸)'} → ${c.to || '(빈칸)'}`)
                                          .join('\n')}
                                      >
                                        {t.changes.map(c => c.key).join(' · ')}
                                      </span>
                                      <button
                                        onClick={() => setDetail(detail === row.id ? null : row.id)}
                                        className="shrink-0 rounded px-1 py-0.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                        title={detail === row.id ? '접습니다' : '얼마가 얼마로 바뀌었는지 봅니다'}
                                      >
                                        {detail === row.id ? '접기' : '⋯ 더보기'}
                                      </button>
                                    </>
                                  )}
                                </div>

                                {detail === row.id && (
                                  <div className="mt-1 space-y-0.5 whitespace-normal">
                                    {t.changes.map(c => (
                                      <div key={c.key} className="break-all text-[11px] leading-snug text-slate-500">
                                        <b className={`font-bold ${changeTone(t.seq)}`}>{c.key}</b> {c.from || '—'}
                                        <span className="mx-0.5 text-slate-300">→</span>
                                        {c.to || '—'}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ),

                            actions: row.pending ? (
                              <button
                                onClick={() => setAdding(row.text)}
                                className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                                title="광고가를 적고 방에 올립니다"
                              >
                                올리기
                              </button>
                            ) : (
                              <>
                                {room.canCompose && (
                                  <button
                                    onClick={() => setOpen(row)}
                                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                                    title="고쳐서 방에 통째로 다시 올립니다"
                                  >
                                    <Pencil size={12} className="inline" /> 고치기
                                  </button>
                                )}
                                <button
                                  onClick={() => void navigator.clipboard.writeText(row.text).then(() => setCopied(row.id))}
                                  className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                  title="글을 그대로 복사합니다"
                                >
                                  <Copy size={12} className="inline" /> {copied === row.id ? '복사됨' : '복사'}
                                </button>
                              </>
                            ),
                          },
                          // 보낸 때와 바뀐 것은 두 줄이 될 수 있다 — 줄마다 위로 맞춘다
                          'align-top',
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* 손으로 올리는 방은 줄을 누르면 바로 고친다 — 적는 창에 보낸 글이 그대로 보인다 */}
      {(adding !== null || (open && room.canCompose)) && (
        <SaleCardForm
          editing={adding !== null ? null : open}
          draft={adding || undefined}
          // 쓰던 유입경로에서 고르게 — '인스타'와 '인스타그램'으로 갈리지 않는다
          platforms={values}
          onClose={() => {
            setAdding(null);
            setOpen(null);
          }}
          onSaved={() => void load()}
        />
      )}

      {/* 보낸 글 그대로 — 방에 뜬 것과 같은 꼴이어야 견줄 수 있다 */}
      {open && !room.canCompose && (
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
