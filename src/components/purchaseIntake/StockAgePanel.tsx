import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 장기 재고 — 들어온 지 오래된 차.
 *
 * 차는 오래 들고 있을수록 손해다. 자리값이 들고, 시세는 떨어지고, 재고금융 이자가 붙는다.
 * 그런데 매일 보는 목록에서는 오래된 차가 새 차 사이에 섞여 있어 눈에 안 띈다.
 *
 * 단계마다 할 일이 다르다 — 서른 날은 값을 다시 보고, 마흔닷새는 내리고, 예순 날은
 * 도매로 넘길지 정한다. 무엇을 했는지 그 자리에서 적어 둔다.
 *
 * 공지방에도 같은 단계로 한 번씩 알림이 간다(서버가 하루에 한 번 본다).
 * 장기 재고가 없는 달에는 아무것도 안 그린다 — 늘 떠 있으면 아무도 안 본다.
 */

interface StockRow {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  intakeDate: string;
  days: number;
  /** 넘긴 단계 — 30 · 45 · 60 */
  stage: number;
  action: string;
  actionNote: string;
  actionBy: string;
  actionAt: string | null;
}

interface Rules {
  stages: { days: number; label: string; todo: string }[];
  actions: string[];
}

const STAGE_CLASS: Record<number, string> = {
  60: 'bg-red-100 text-red-700',
  45: 'bg-amber-100 text-amber-800',
  30: 'bg-slate-200 text-slate-700',
};

export default function StockAgePanel() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<number | 'all'>('all');
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, rule] = await Promise.all([api<StockRow[]>('/stock-age'), api<Rules>('/stock-age/rules')]);
      setRows(list);
      setRules(rule);
    } catch {
      // 못 불러와도 매입 목록은 그대로 보여준다 — 덤으로 띄우는 자리다
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (row: StockRow, action: string, note: string) => {
    try {
      await api(`/stock-age/${row.id}/action`, { method: 'POST', body: { action, note } });
      await load();
      setEditing(null);
    } catch (e) {
      void alertError('적지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const r of rows) c.set(r.stage, (c.get(r.stage) ?? 0) + 1);
    return c;
  }, [rows]);

  const shown = picked === 'all' ? rows : rows.filter(r => r.stage === picked);
  /** 아직 아무것도 안 한 차 — 이 숫자가 줄어드는 게 이 자리의 쓸모다 */
  const untouched = shown.filter(r => !r.action).length;

  if (rows.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-amber-50"
      >
        {open ? <ChevronDown size={14} className="text-amber-700" /> : <ChevronRight size={14} className="text-amber-700" />}
        <AlertTriangle size={14} className="text-amber-700" />
        <span className="text-xs font-bold text-amber-900">장기 재고</span>
        <span className="text-[11px] text-amber-800/80">
          {(rules?.stages ?? [])
            .slice()
            .reverse()
            .filter(s => (counts.get(s.days) ?? 0) > 0)
            .map(s => `${s.label} ${counts.get(s.days)}대`)
            .join(' · ')}
        </span>
        {untouched > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white">
            아직 손 안 댄 차 {untouched}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3.5 pb-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setPicked('all')}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                picked === 'all' ? 'bg-amber-600 text-white' : 'bg-white text-slate-500 hover:bg-amber-100'
              }`}
            >
              전체 {rows.length}
            </button>
            {(rules?.stages ?? [])
              .slice()
              .reverse()
              .map(s => (
                <button
                  key={s.days}
                  onClick={() => setPicked(p => (p === s.days ? 'all' : s.days))}
                  title={s.todo}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    picked === s.days ? 'bg-amber-600 text-white' : STAGE_CLASS[s.days] ?? 'bg-white text-slate-500'
                  }`}
                >
                  {s.label} {counts.get(s.days) ?? 0}
                </button>
              ))}
          </div>

          {/* 그 단계에 무엇을 해야 하는지 — 숫자만 띄우면 그래서 뭘 하라는 건지 모른다 */}
          {picked !== 'all' && (
            <p className="mb-1.5 text-[11px] text-amber-800/80">
              {rules?.stages.find(s => s.days === picked)?.todo}
            </p>
          )}

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {shown.map(row => (
              <div key={`${row.vehicleNumber}-${row.intakeDate}`} className="rounded-lg bg-white px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STAGE_CLASS[row.stage] ?? ''}`}>
                    {row.days}일
                  </span>
                  <span className="font-mono text-xs text-slate-700">{row.vehicleNumber}</span>
                  <span className="min-w-0 truncate text-xs text-slate-500">{row.vehicleName}</span>
                  <span className="text-[11px] text-slate-400">입고 {dayjs(row.intakeDate).format('M/D')}</span>

                  {row.action ? (
                    <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      {row.action}
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] text-slate-300">아직</span>
                  )}
                  {/* 알림이 간 적이 없는 차는 적어 둘 자리가 없다(서버가 아직 안 훑었다) */}
                  {row.id && (
                    <button
                      onClick={() => setEditing(e => (e === row.id ? null : row.id))}
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                    >
                      적기
                    </button>
                  )}
                </div>

                {row.action && editing !== row.id && (
                  <p className="mt-0.5 pl-10 text-[11px] text-slate-500">
                    {row.actionNote}
                    {row.actionBy && (
                      <span className="ml-1 text-slate-400">
                        — {row.actionBy}
                        {row.actionAt && ` ${dayjs(row.actionAt).format('M/D')}`}
                      </span>
                    )}
                  </p>
                )}

                {editing === row.id && (
                  <ActionEditor row={row} actions={rules?.actions ?? []} onSave={save} onCancel={() => setEditing(null)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 무엇을 했는지 적는 칸.
 *
 * 고르는 몇 가지를 두고, 못 담는 말은 뒤 한 줄에 적는다 — 자유 입력만 두면 사람마다
 * 다르게 적어서 달마다 견줄 수가 없다.
 */
function ActionEditor({
  row,
  actions,
  onSave,
  onCancel,
}: {
  row: StockRow;
  actions: string[];
  onSave: (row: StockRow, action: string, note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(row.action);
  const [note, setNote] = useState(row.actionNote);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(row, action, note);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 rounded-lg bg-slate-50 p-2">
      <div className="flex flex-wrap gap-1">
        {actions.map(a => (
          <button
            key={a}
            onClick={() => setAction(v => (v === a ? '' : a))}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              action === a ? 'bg-amber-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-200'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void save()}
          placeholder="얼마로 내렸는지, 어디로 넘겼는지 한 줄로"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
        />
        <button
          onClick={() => void save()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          저장
        </button>
        <button onClick={onCancel} className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white">
          취소
        </button>
      </div>
    </div>
  );
}
