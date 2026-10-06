import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, MessageSquarePlus, UserX } from 'lucide-react';
import { useStore } from '../../store';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { conversionOf, isOfKind } from '../../lib/consultationStats';
import ConsultationDetailModal from './ConsultationDetailModal';
import { CONSULTATION_STATUS_LABEL, type ConsultationRecord, type ConsultationStatus } from '../../types';

/**
 * 담당자별 전환율과, 그 숫자 뒤에 있는 손님들.
 *
 * 전환율은 숫자로만 보인다 — 몇 퍼센트인지는 알겠는데 어느 손님이 그냥 갔는지, 왜
 * 갔는지는 안 보인다. 그래서 다음 달에 같은 이유로 또 놓친다.
 *
 * 세 가지를 한 자리에 둔다. 사람마다 몇 퍼센트인지, 그중 누가 그냥 갔는지, 그리고 왜
 * 그랬는지(리뷰). 카드를 누르면 그 사람 것만 추려진다.
 *
 * 남의 실적은 안 보인다 — 대표만 전원을 보고, 나머지는 자기 것만 본다.
 *
 * 온 날이 지난 건만 센다. 아직 안 온 손님을 '안 됐다'로 세면 매일 아침 목록이 부풀어
 * 오른다. 계약·판매완료로 간 건은 당연히 뺀다.
 */

/** 상담과 방문을 맡는 팀 */
const VISIT_TEAM = '알선팀';

/** 계약으로 안 간 상태 — 보류·종결·진행중 */
const MISS_STATUS: ConsultationStatus[] = ['ON_HOLD', 'CLOSED', 'IN_PROGRESS'];

const STATUS_CLASS: Record<string, string> = {
  ON_HOLD: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-slate-200 text-slate-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
};

/**
 * 안 된 이유 — 고르는 칸이다.
 *
 * 적어 두는 자리를 자유 입력만으로 두면 사람마다 다르게 적어서 달마다 견줄 수가 없다.
 * 고르는 몇 가지를 두고, 못 담는 말은 뒤에 한 줄로 적는다.
 */
const REASONS = ['가격', '차량 상태', '할부 안 됨', '다른 차 구매', '단순 비교', '재방문 예정', '연락 두절', '기타'];

export default function VisitReviewSection({
  role,
  month,
  allMonths,
}: {
  role: 'EMPLOYEE' | 'ADMIN';
  month: string;
  allMonths: boolean;
}) {
  const { state, refresh } = useStore();
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string | 'all'>('all');
  const [status, setStatus] = useState<ConsultationStatus | 'all'>('all');
  const [detail, setDetail] = useState<ConsultationRecord | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const today = dayjs().format('YYYY-MM-DD');

  /** 전환율을 볼 사람 — 대표는 알선팀 전원, 나머지는 본인뿐이다 */
  const people = useMemo(() => {
    const team = state.employees.filter(e => e.active !== false && e.department === VISIT_TEAM);
    return role === 'ADMIN' ? team : team.filter(e => e.id === state.currentEmployeeId);
  }, [state.employees, role, state.currentEmployeeId]);

  /** 그 달 알선 상담 — 정산이 달마다 하는 일이라 달로 끊어 본다(상담일 기준) */
  const scoped = useMemo(
    () =>
      state.consultations
        .filter(c => isOfKind(c, 'BROKERAGE'))
        .filter(c => allMonths || c.date.startsWith(month)),
    [state.consultations, month, allMonths],
  );

  const stats = useMemo(
    () =>
      people
        .map(emp => ({ emp, ...conversionOf(scoped.filter(c => c.employeeId === emp.id)) }))
        .filter(s => s.total > 0 || s.closed > 0)
        .sort((a, b) => b.rate - a.rate || b.total - a.total),
    [people, scoped],
  );

  /** 그 건을 맡은 사람 — 방문 담당을 정해 뒀으면 그 사람, 아니면 적은 사람 */
  const ownerOf = (c: ConsultationRecord) => c.visitDealerId ?? c.employeeId;
  const nameOf = (id: string) => state.employees.find(e => e.id === id)?.name ?? '';

  /** 방문했는데 계약이 안 된 건 — 방문일 기준으로 끊는다(온 날이 지난 것만) */
  const misses = useMemo(() => {
    const ids = new Set(people.map(p => p.id));
    return state.consultations
      .filter(c => !!c.visitDate && c.visitDate <= today)
      .filter(c => allMonths || (c.visitDate ?? '').startsWith(month))
      .filter(c => MISS_STATUS.includes(c.status))
      // 대표가 아니면 내가 맡은 것만 — 남이 놓친 손님까지 볼 자리가 아니다
      .filter(c => role === 'ADMIN' || ids.has(c.visitDealerId ?? c.employeeId))
      .sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''));
  }, [state.consultations, month, allMonths, today, people, role]);

  const shown = misses
    .filter(c => picked === 'all' || ownerOf(c) === picked)
    .filter(c => status === 'all' || c.status === status);

  /** 아직 왜 안 됐는지 안 적은 건 — 이게 줄어드는 게 이 화면의 쓸모다 */
  const unwritten = shown.filter(c => !c.missReason && !c.missReview).length;

  const saveReview = async (c: ConsultationRecord, reason: string, review: string) => {
    try {
      await api(`/consultations/${c.id}/review`, { method: 'POST', body: { reason, review } });
      await refresh();
      setEditing(null);
    } catch (e) {
      void alertError('리뷰를 적지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  if (stats.length === 0 && misses.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        <span className="shrink-0 text-xs font-bold text-slate-600">
          {role === 'ADMIN' ? '담당자별' : '내'} 상담 → 계약 전환율
        </span>
        <span className="text-[11px] text-slate-400">
          {allMonths ? '전체' : dayjs(month).format('M월')} · {VISIT_TEAM} · 계약 = 계약 + 판매완료 · 계약보류는 계약으로
          안 세고 · 상담종결은 아예 빼고 셉니다
        </span>
        {misses.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
            그냥 간 손님 {misses.length}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          {stats.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {stats.map(({ emp, total, contracted, onHold, closed, rate }) => (
                /* 누르면 아래 목록이 그 사람 것만 남는다 */
                <button
                  key={emp.id}
                  onClick={() => setPicked(p => (p === emp.id ? 'all' : emp.id))}
                  className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                    picked === emp.id ? 'bg-indigo-600' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <p className={`text-xs font-medium ${picked === emp.id ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {emp.name}
                  </p>
                  <p className={`mt-1 text-lg font-bold ${picked === emp.id ? 'text-white' : 'text-slate-800'}`}>
                    {rate}
                    <span className={`text-xs font-medium ${picked === emp.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                      %
                    </span>
                  </p>
                  <p className={`text-[11px] ${picked === emp.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {contracted}/{total}건 계약
                  </p>
                  {/* 보류·종결은 왜 숫자가 그런지 설명해 주는 값이라 같이 둔다 */}
                  {(onHold > 0 || closed > 0) && (
                    <p className={`mt-0.5 text-[11px] ${picked === emp.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {onHold > 0 && (
                        <span className={picked === emp.id ? '' : 'text-amber-700'}>계약보류 {onHold}건</span>
                      )}
                      {onHold > 0 && closed > 0 && ' · '}
                      {closed > 0 && <span>상담종결 {closed}건 제외</span>}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {misses.length > 0 && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <UserX size={13} className="text-rose-700" />
                <span className="text-[11px] font-bold text-rose-800">방문했는데 계약이 안 된 건</span>
                {picked !== 'all' && (
                  <button
                    onClick={() => setPicked('all')}
                    className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white"
                  >
                    {nameOf(picked)} ✕
                  </button>
                )}
                <span className="mx-1 h-3 w-px bg-slate-200" />
                <button
                  onClick={() => setStatus('all')}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    status === 'all' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-rose-100'
                  }`}
                >
                  전체 {shown.length}
                </button>
                {MISS_STATUS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      status === s ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-rose-100'
                    }`}
                  >
                    {CONSULTATION_STATUS_LABEL[s]}{' '}
                    {misses.filter(c => c.status === s && (picked === 'all' || ownerOf(c) === picked)).length}
                  </button>
                ))}
                {unwritten > 0 && <span className="ml-auto text-[11px] text-slate-400">리뷰 안 적은 건 {unwritten}</span>}
              </div>

              {shown.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-400">해당하는 건이 없습니다</p>
              ) : (
                /* 한 달치가 수십 건이 되기도 한다 — 칸 안에서 굴린다 */
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {shown.map(c => (
                    <div key={c.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 누르면 그 상담이 열린다 — 무슨 말이 오갔는지는 내용에 있다 */}
                        <button
                          onClick={() => setDetail(c)}
                          className="flex min-w-0 flex-wrap items-center gap-2 text-left"
                        >
                          <span className="w-10 shrink-0 text-[11px] font-semibold text-slate-500">
                            {dayjs(c.visitDate).format('M/D')}
                          </span>
                          <span className="font-mono text-xs text-slate-600 hover:underline">{c.vehicleNumber}</span>
                          <span className="text-xs text-slate-500">{c.vehicleName}</span>
                          <span className="text-[11px] text-slate-400">{c.customerPhone || c.customerName}</span>
                          <span className="text-[11px] text-slate-400">· {nameOf(ownerOf(c))}</span>
                        </button>
                        <span
                          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STATUS_CLASS[c.status]
                          }`}
                        >
                          {CONSULTATION_STATUS_LABEL[c.status]}
                        </span>
                        <button
                          onClick={() => setEditing(e => (e === c.id ? null : c.id))}
                          className={`shrink-0 rounded-md px-1.5 py-1 ${
                            c.missReason || c.missReview
                              ? 'text-indigo-600 hover:bg-indigo-50'
                              : 'text-slate-400 hover:bg-slate-200'
                          }`}
                          title="왜 안 됐는지 적기"
                        >
                          <MessageSquarePlus size={13} />
                        </button>
                      </div>

                      {/* 적어 둔 리뷰 — 적은 사람과 때를 같이 보여준다 */}
                      {(c.missReason || c.missReview) && editing !== c.id && (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-10 text-[11px]">
                          {c.missReason && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-700">
                              {c.missReason}
                            </span>
                          )}
                          <span className="text-slate-600">{c.missReview}</span>
                          {c.missReviewBy && (
                            <span className="text-slate-400">
                              — {c.missReviewBy}
                              {c.missReviewAt && ` ${dayjs(c.missReviewAt).format('M/D')}`}
                            </span>
                          )}
                        </p>
                      )}

                      {editing === c.id && (
                        <ReviewEditor row={c} onSave={saveReview} onCancel={() => setEditing(null)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 보려고 연 창이다 — 정산 화면에서 상담을 고치게 두지 않는다 */}
      {detail && <ConsultationDetailModal consultation={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/**
 * 리뷰 적는 칸.
 *
 * 사유는 골라서 적는다 — 자유 입력만 두면 사람마다 다르게 적어서 달마다 견줄 수가 없다.
 * 못 담는 말은 뒤 한 줄에 적는다. 둘 다 비우고 저장하면 안 적은 것으로 되돌아간다.
 */
function ReviewEditor({
  row,
  onSave,
  onCancel,
}: {
  row: ConsultationRecord;
  onSave: (c: ConsultationRecord, reason: string, review: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(row.missReason ?? '');
  const [text, setText] = useState(row.missReview ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(row, reason, text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 rounded-lg bg-white p-2">
      <div className="flex flex-wrap gap-1">
        {REASONS.map(r => (
          <button
            key={r}
            onClick={() => setReason(v => (v === r ? '' : r))}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              reason === r ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void save()}
          placeholder="한 줄로 — 다음에 같은 손님을 놓치지 않으려면 무엇이 필요했나"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => void save()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          저장
        </button>
        <button onClick={onCancel} className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100">
          취소
        </button>
      </div>
    </div>
  );
}
