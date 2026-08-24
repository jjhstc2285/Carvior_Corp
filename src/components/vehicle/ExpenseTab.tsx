import { useMemo, useState, type FormEvent } from 'react';
import dayjs from 'dayjs';
import { BatteryCharging, Fuel, Plus, Trash2, Wrench } from 'lucide-react';
import { PLATE_MESSAGE, formatWon } from '../../lib/vehicle';
import {
  VEHICLE_EXPENSE_KIND_LABEL,
  VEHICLE_USAGE_NOTE_LABEL,
  type VehicleExpenseKind,
  type VehicleExpenseLog,
  type VehicleUsageNote,
} from '../../types';
import type { VehiclesApi } from './useVehicles';

const NOTE_KEYS = Object.keys(VEHICLE_USAGE_NOTE_LABEL) as VehicleUsageNote[];

/**
 * 화면에서 직접 등록하는 종류. 주차비(PARKING)는 주차장 관리에서 자동으로 쌓이므로
 * 여기 목록에는 없다 — 라벨 목록을 그대로 쓰면 손으로 못 넣는 종류까지 버튼이 생긴다.
 */
const KIND_KEYS: VehicleExpenseKind[] = ['FUEL', 'BATTERY', 'REPAIR'];

/** 종류별 배지 색 — 목록에서 한눈에 갈리게 */
const KIND_BADGE: Record<VehicleExpenseKind, string> = {
  FUEL: 'bg-orange-50 text-orange-600',
  BATTERY: 'bg-sky-50 text-sky-600',
  REPAIR: 'bg-violet-50 text-violet-600',
};

function KindIcon({ kind, size = 14 }: { kind: VehicleExpenseKind; size?: number }) {
  if (kind === 'FUEL') return <Fuel size={size} />;
  if (kind === 'BATTERY') return <BatteryCharging size={size} />;
  return <Wrench size={size} />;
}

export default function ExpenseTab({ api }: { api: VehiclesApi }) {
  const { vehicles, expenses, addExpense, editExpense, removeExpense } = api;

  const [kind, setKind] = useState<VehicleExpenseKind>('FUEL');
  const [tail, setTail] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState<VehicleUsageNote>('IN_PREP');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kindFilter, setKindFilter] = useState<VehicleExpenseKind | 'ALL'>('ALL');
  const [month, setMonth] = useState('');

  // 뒤 4자리가 다 찍혔을 때만 찾는다. 이미 받아둔 목록에서 고르므로 입력 즉시 반응한다.
  const matches = useMemo(
    () => (tail.length === 4 ? vehicles.filter(v => v.plateTail === tail) : []),
    [tail, vehicles],
  );

  // 한 대뿐이면 그대로 쓰고, 여러 대면 선택박스에서 고른 차를 쓴다.
  const picked = matches.length === 1 ? matches[0] : (matches.find(v => v.id === selectedId) ?? null);
  const notFound = tail.length === 4 && matches.length === 0;

  const changeTail = (value: string) => {
    setTail(value.replace(/\D/g, '').slice(0, 4));
    setSelectedId('');
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (matches.length === 0) {
      setFormError(PLATE_MESSAGE.notFound);
      return;
    }
    if (!picked) {
      setFormError(PLATE_MESSAGE.unselected);
      return;
    }
    const won = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(won) || won <= 0) {
      setFormError('금액을 입력해 주세요.');
      return;
    }

    setBusy(true);
    const failed = await addExpense({
      vehicleId: picked.id,
      kind,
      amount: won,
      ...(kind === 'FUEL' ? { note } : {}),
    });
    setBusy(false);
    setFormError(failed);
    if (!failed) {
      setTail('');
      setSelectedId('');
      setAmount('');
    }
  };

  const filtered = useMemo(
    () =>
      expenses
        .filter(e => kindFilter === 'ALL' || e.kind === kindFilter)
        .filter(e => !month || e.date.startsWith(month)),
    [expenses, kindFilter, month],
  );
  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-1">
          {KIND_KEYS.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setFormError(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                kind === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <KindIcon kind={k} />
              {VEHICLE_EXPENSE_KIND_LABEL[k]}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">등록일 {dayjs().format('YYYY-MM-DD')} (자동)</span>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <div>
            <input
              value={tail}
              onChange={e => changeTail(e.target.value)}
              inputMode="numeric"
              placeholder="차량번호 뒤 4자리"
              className="w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <p className="mt-1 text-[11px] text-slate-400">숫자 4자리</p>
          </div>

          {/* 같은 뒷자리 차가 여러 대면 전체 차량번호와 차종을 함께 보여주고 고르게 한다. */}
          {matches.length > 1 ? (
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setFormError(null); }}
              className="w-64 rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">차량 선택 ({matches.length}대)</option>
              {matches.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicleNumber} · {v.vehicleModel}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={picked?.vehicleModel ?? ''}
              readOnly
              placeholder="차량명 (자동 입력)"
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none"
            />
          )}

          {/* 차량이 찾아졌을 때만 금액칸이 열린다 */}
          {matches.length > 0 && (
            <>
              <input
                value={amount}
                onChange={e => { setAmount(e.target.value.replace(/[^\d,]/g, '')); setFormError(null); }}
                inputMode="numeric"
                placeholder="금액(원)"
                className="w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />

              {kind === 'FUEL' && (
                <select
                  value={note}
                  onChange={e => setNote(e.target.value as VehicleUsageNote)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  {NOTE_KEYS.map(k => (
                    <option key={k} value={k}>{VEHICLE_USAGE_NOTE_LABEL[k]}</option>
                  ))}
                </select>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus size={15} /> 등록
              </button>
            </>
          )}
        </div>

        {(notFound || formError) && (
          <p className="mt-2 text-xs font-medium text-red-500">{formError ?? PLATE_MESSAGE.notFound}</p>
        )}
        {picked && !formError && (
          <p className="mt-2 text-xs text-slate-500">
            선택된 차량 <span className="font-mono font-semibold text-slate-700">{picked.vehicleNumber}</span> · {picked.vehicleModel}
          </p>
        )}
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['ALL', ...KIND_KEYS] as const).map(k => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              kindFilter === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            {k === 'ALL' ? '전체' : VEHICLE_EXPENSE_KIND_LABEL[k]}
          </button>
        ))}
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        {month && (
          <button onClick={() => setMonth('')} className="text-xs text-slate-400 hover:text-slate-600">월 필터 해제</button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length}건 · 합계 <span className="font-semibold text-slate-700">{formatWon(total)}</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Fuel size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">등록된 주유·배터리 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">날짜</th>
                <th className="px-3 py-3 font-medium">종류</th>
                <th className="px-4 py-3 font-medium">차량번호</th>
                <th className="px-4 py-3 font-medium">차량명</th>
                <th className="px-4 py-3 text-right font-medium">금액</th>
                <th className="px-3 py-3 font-medium">비고</th>
                <th className="px-3 py-3 font-medium">등록자</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <ExpenseRow key={log.id} log={log} onEdit={editExpense} onRemove={removeExpense} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  log: VehicleExpenseLog;
  onEdit: VehiclesApi['editExpense'];
  onRemove: VehiclesApi['removeExpense'];
}

function ExpenseRow({ log, onEdit, onRemove }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(log.amount));
  const [date, setDate] = useState(log.date);
  const [note, setNote] = useState<VehicleUsageNote>(log.note ?? 'IN_PREP');
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setAmount(String(log.amount));
    setDate(log.date);
    setNote(log.note ?? 'IN_PREP');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const won = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(won) || won <= 0) {
      setError('금액을 입력해 주세요.');
      return;
    }
    const failed = await onEdit(log.id, {
      amount: won,
      date,
      ...(log.kind === 'FUEL' ? { note } : {}),
    });
    setError(failed);
    if (!failed) setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-slate-50 bg-indigo-50/30 last:border-0">
        <td className="px-4 py-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-36 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
        </td>
        <td className="px-3 py-2 text-slate-500">{VEHICLE_EXPENSE_KIND_LABEL[log.kind]}</td>
        <td className="px-4 py-2 font-mono text-slate-700">{log.vehicle.vehicleNumber}</td>
        <td className="px-4 py-2 text-slate-500">{log.vehicle.vehicleModel}</td>
        <td className="px-4 py-2 text-right">
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d,]/g, ''))} inputMode="numeric"
            className="w-28 rounded border border-slate-200 px-2 py-1 text-right text-xs outline-none focus:border-indigo-400" />
        </td>
        <td className="px-3 py-2">
          {log.kind === 'FUEL' ? (
            <select value={note} onChange={e => setNote(e.target.value as VehicleUsageNote)}
              className="rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-indigo-400">
              {NOTE_KEYS.map(k => <option key={k} value={k}>{VEHICLE_USAGE_NOTE_LABEL[k]}</option>)}
            </select>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-400">{log.employee.name}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {error && <span className="mr-2 text-[11px] text-red-500">{error}</span>}
          <button onClick={save} className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">저장</button>
          <button onClick={() => setEditing(false)} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100">취소</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-3 text-slate-500">{log.date}</td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_BADGE[log.kind]}`}>
          {VEHICLE_EXPENSE_KIND_LABEL[log.kind]}
        </span>
      </td>
      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{log.vehicle.vehicleNumber}</td>
      <td className="px-4 py-3 text-slate-600">{log.vehicle.vehicleModel}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatWon(log.amount)}</td>
      <td className="px-3 py-3 text-slate-500">{log.note ? VEHICLE_USAGE_NOTE_LABEL[log.note] : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-3 text-xs text-slate-400">{log.employee.name}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <button onClick={startEdit} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">수정</button>
        <button
          onClick={() => { if (confirm('이 이력을 삭제할까요?')) void onRemove(log.id); }}
          className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
          aria-label="삭제"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
