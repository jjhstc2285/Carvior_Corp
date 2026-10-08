import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarCheck, Loader2, Shuffle, UserRoundX } from 'lucide-react';
import { useStore } from '../../store';
import { api, ApiError } from '../../lib/api';
import { alertError, alertSuccess } from '../../lib/alert';
import { visitHour } from '../../lib/visitParse';
import type { ConsultationRecord, Employee } from '../../types';

/**
 * 방문 배정판 — 그날 오는 손님을 누가 맞을지 정한다.
 *
 * 전화를 받아 적은 사람과 그날 손님을 맞을 사람은 다르다. 전화받은 사람이 여기서 바로
 * 지정하고, 안 정해 둔 건은 버튼 한 번으로 나눈다.
 *
 * 나누는 규칙은 둘이다 — 한 사람은 같은 시간대에 한 손님만(맞고 있는 동안 다른 손님은
 * 못 받는다), 그 시간에 빈 사람 중 그날 제일 적게 맡은 사람에게. 계산은 서버가 한다.
 *
 * 종결한 건은 빼고 본다. 안 오기로 한 손님 자리까지 잡아 두면 올 손님이 갈 데가 없다.
 */

/** 방문을 맡는 팀 — 서버도 같은 팀을 본다 */
const VISIT_TEAM = '알선팀';

interface AssignResult {
  visits: number;
  assigned: number;
  noTime: string[];
  noRoom: string[];
  dealers: { id: string; name: string; count: number }[];
}

export function visitDealers(employees: Employee[]): Employee[] {
  return employees.filter(e => e.active !== false && e.department === VISIT_TEAM);
}

/** 담당 딜러 고르는 칸 — 표에서도 배정판에서도 같은 걸 쓴다 */
export function VisitDealerSelect({
  value,
  dealers,
  onPick,
  className = '',
}: {
  value: string | null;
  dealers: Employee[];
  onPick: (dealerId: string) => void | Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async (next: string) => {
    setBusy(true);
    try {
      await onPick(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      value={value ?? ''}
      disabled={busy}
      onChange={e => void pick(e.target.value)}
      className={`rounded-md border px-1.5 py-1 text-xs outline-none disabled:opacity-50 ${
        value ? 'border-indigo-200 bg-indigo-50/60 font-medium text-indigo-700' : 'border-slate-200 bg-white text-slate-400'
      } ${className}`}
    >
      <option value="">미지정</option>
      {dealers.map(d => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export default function VisitAssignPanel() {
  const { state, refresh } = useStore();
  const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [busy, setBusy] = useState(false);

  const dealers = useMemo(() => visitDealers(state.employees), [state.employees]);

  /*
    그날 오는 손님.

    종류(알선·판매·수출)를 안 가린다 — 손님은 한 자리에 오고, 맞는 사람도 한 사람이다.
    이른 시각부터 세운다. 시각을 못 읽은 건은 맨 뒤로 보낸다.
  */
  const visits = useMemo(() => {
    return state.consultations
      .filter(c => c.visitDate === date && c.status !== 'CLOSED')
      .map(c => ({ c, hour: visitHour(c.visitTime) }))
      .sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99));
  }, [state.consultations, date]);

  /** 손님이 안 온 건(노쇼 포함) — 상태 하나로 가린다 */
  const isCanceled = (c: ConsultationRecord) => c.status === 'VISIT_CANCELED';

  /** 취소한 건은 셈에서 뺀다 — 자리가 비어 있는 것과 같다 */
  const unassigned = visits.filter(v => !v.c.visitDealerId && !isCanceled(v.c)).length;
  const canceled = visits.filter(v => isCanceled(v.c)).length;

  /*
    손님이 취소했다고 적는다.

    맡은 딜러는 그 시간을 비워 두고 기다렸을 뿐 손님을 맞은 게 아니다. 취소로 적으면
    배정 셈에서 빠져서, 다음 손님이 올 때 그 딜러가 먼저 받는다.

    줄은 지우지 않는다 — 약속이 있었다는 것과 손님이 안 왔다는 것 둘 다 남아야, 나중에
    그 손님에게 다시 걸 때 무슨 일이 있었는지 알 수 있다.
  */
  const setCanceled = async (c: ConsultationRecord, next: boolean) => {
    try {
      // 되돌리면 진행중으로 — 그날 안 왔을 뿐 다시 부를 손님이다
      await api(`/consultations/${c.id}`, {
        method: 'PATCH',
        body: { status: next ? 'VISIT_CANCELED' : 'IN_PROGRESS' },
      });
      await refresh();
    } catch (e) {
      void alertError('취소로 바꾸지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const setDealer = async (c: ConsultationRecord, dealerId: string) => {
    try {
      await api(`/consultations/${c.id}`, { method: 'PATCH', body: { visitDealerId: dealerId } });
      await refresh();
    } catch (e) {
      void alertError('담당 딜러를 정하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const autoAssign = async () => {
    setBusy(true);
    try {
      const res = await api<AssignResult>('/consultations/visits/assign', { method: 'POST', body: { date } });
      await refresh();

      const lines = [
        `${res.visits}건 중 ${res.assigned}건을 나눴습니다.`,
        res.dealers.filter(d => d.count > 0).map(d => `${d.name} ${d.count}`).join(' · '),
      ];
      // 왜 안 나뉘었는지까지 적는다 — '0건 배정'만 뜨면 고칠 방법을 알 수가 없다
      if (res.noTime.length > 0) lines.push(`방문 시각이 없어 못 나눔: ${res.noTime.join(', ')}`);
      if (res.noRoom.length > 0) lines.push(`그 시간에 빈 사람이 없음: ${res.noRoom.join(', ')}`);

      void alertSuccess('방문을 나눴습니다', lines.filter(Boolean).join(' / '));
    } catch (e) {
      void alertError('나누지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarCheck size={14} className="text-indigo-700" />
        <p className="text-xs font-bold text-indigo-800">방문 배정</p>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-400"
        />
        <span className="text-[11px] text-indigo-700/70">
          {visits.length > 0
            ? `방문 ${visits.length}건 · 아직 안 정한 건 ${unassigned}건${canceled > 0 ? ` · 취소 ${canceled}건` : ''}`
            : '그날 예약된 방문이 없습니다'}
        </span>
        <button
          onClick={() => void autoAssign()}
          disabled={busy || unassigned === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          title="한 시간 자리에 한 사람씩, 적게 맡은 사람부터 나눕니다. 이미 정해 둔 건은 그대로 둡니다"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
          자동 배정
        </button>
      </div>

      {visits.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {visits.map(({ c, hour }) => (
            <div
              key={c.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                isCanceled(c) ? 'bg-slate-100 text-slate-400 line-through decoration-slate-300' : 'bg-white'
              }`}
            >
              <span className="w-14 shrink-0 text-xs font-bold text-indigo-700">
                {hour === null ? <span className="text-amber-600">시각?</span> : `${String(hour).padStart(2, '0')}시`}
              </span>
              <span className="text-[11px] text-slate-400">{c.visitTime || '시각 미기재'}</span>
              <span className="font-mono text-xs text-slate-600">{c.vehicleNumber}</span>
              <span className="text-xs text-slate-500">{c.vehicleName}</span>
              <span className="text-[11px] text-slate-400">{c.customerPhone || c.customerName}</span>
              <VisitDealerSelect
                value={c.visitDealerId}
                dealers={dealers}
                onPick={id => setDealer(c, id)}
                className="ml-auto"
              />
              {/* 손님이 안 오기로 한 건 — 맡은 딜러가 다음 손님을 먼저 받는다 */}
              <button
                onClick={() => void setCanceled(c, !isCanceled(c))}
                title={
                  isCanceled(c)
                    ? '방문취소로 적혀 있습니다 — 누르면 진행중으로 되돌립니다'
                    : '손님이 안 왔으면 누릅니다(노쇼 포함). 맡은 딜러가 다음 손님을 먼저 받습니다'
                }
                className={`shrink-0 rounded-md px-1.5 py-1 ${
                  isCanceled(c) ? 'bg-slate-300 text-white' : 'text-slate-400 hover:bg-slate-200'
                }`}
              >
                <UserRoundX size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 그날 누가 몇을 맡았는지 — 고르게 나뉘었는지 한눈에 본다 */}
      {visits.length > 0 && dealers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dealers.map(d => {
            const count = visits.filter(v => v.c.visitDealerId === d.id && !isCanceled(v.c)).length;
            return (
              <span
                key={d.id}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  count > 0 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'
                }`}
              >
                {d.name} {count}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
