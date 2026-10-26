import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, MessageSquarePlus, PhoneOutgoing, UserX } from 'lucide-react';
import { useStore } from '../../store';
import { dealerName } from './VisitAssignPanel';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { isContracted } from '../../lib/consultationStats';
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
export const REASONS = ['방문취소', '예산부족', '할부부결', '타사구매', '차량불만족', '기타'];

/**
 * 리콜 결과 — 다시 걸어 보고 무엇을 들었나.
 *
 * 담당자가 적는 리뷰와 다른 일이다. 팀장(지금은 대표)이 손님에게 직접 걸어 "문제가
 * 있었나, 우리 직원이 실수한 게 있나, 다른 차를 보겠나"를 묻는다.
 *
 * 몇 가지로 끊어 둔다 — 사람마다 다르게 적으면 달마다 견줄 수가 없다.
 */
const RECALL_RESULTS = ['통화함', '부재중', '다른 차 보기로', '타사 구매', '응대 불만', '그냥 둠'];

export default function VisitReviewSection({
  role,
  month,
  allMonths,
  openToAll = false,
}: {
  role: 'EMPLOYEE' | 'ADMIN';
  month: string;
  allMonths: boolean;
  /**
   * 누구나 보게 열지.
   *
   * 상담 화면에서는 켠다 — 거기서는 원래 전 직원이 상담을 다 본다. 전화를 받아 넘기는
   * 사람(TM)이 "이 손님 지난번에 왔다 그냥 가셨네"를 알아야 다음 통화가 달라진다.
   *
   * 정산 화면에서는 안 켠다. 거기는 실적과 돈을 보는 자리라 팀 밖으로 열 값이 아니다.
   */
  openToAll?: boolean;
}) {
  const { state, refresh } = useStore();
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string | 'all'>('all');
  const [status, setStatus] = useState<ConsultationStatus | 'all'>('all');
  const [detail, setDetail] = useState<ConsultationRecord | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** 지금 리콜을 적고 있는 줄 — 리뷰와 따로 연다(쓰는 사람도 내용도 다르다) */
  const [recalling, setRecalling] = useState<string | null>(null);

  const today = dayjs().format('YYYY-MM-DD');

  /*
    누가 누구 것을 보는가.

    알선팀은 서로 다 본다. 같이 받고 같이 맞는 손님이라 누가 몇 건을 했고 어느 손님이
    그냥 갔는지를 팀이 같이 보는 게 맞다 — 혼자만 보면 옆자리가 놓친 손님을 아무도
    이어받지 못한다.

    알선팀도 대표도 아닌 사람은 자기 것만 본다(그런 사람이 이 화면에 올 일은 드물다).
  */
  const me = state.employees.find(e => e.id === state.currentEmployeeId) ?? null;
  const seesTeam = openToAll || role === 'ADMIN' || me?.department === VISIT_TEAM;

  /*
    리콜을 돌릴 수 있는 자리.

    상담 화면에서는 누구나 돈다 — 낮에 자리에 앉아 전화를 거는 사람이 거기 있다.
    정산 화면은 대표만. 거기까지 열면 실적 보는 자리에서 남의 손님에게 전화를 건다.
  */
  const canRecall = openToAll || role === 'ADMIN';

  /*
    누구를 세는가 — 알선팀이다.

    한때 상담을 적은 사람 전부로 넓혔었다. 전환율이 '그 달 상담 전체'를 모수로 쓰던
    때라, 전화를 제일 많이 받는 광고팀이 빠져 있으면 숫자가 안 맞아 보였다.

    지금은 방문으로 센다. 손님을 맞는 건 알선팀이고, 방문 배정도 그 팀에서만 나눈다
    (VisitAssignPanel) — 그러니 세는 자리도 그 팀이다.

    넓혀 두니 전화만 받고 자리를 뜬 사람이 끼었다. 광고팀 한 사람은 방문 여덟 건에
    그중 다섯이 안 온 건이었는데, 그게 알선팀 옆에 나란히 서서 견줄 수 없는 둘이
    견줘졌다.

    그 밖의 사람은 자기 것만 본다(seesTeam 이 아닐 때).
  */
  const people = useMemo(() => {
    const team = state.employees.filter(e => e.active !== false && e.department === VISIT_TEAM);
    return seesTeam ? team : team.filter(e => e.id === state.currentEmployeeId);
  }, [state.employees, seesTeam, state.currentEmployeeId]);

  /*
    그 달 상담 — 달로 끊어 본다(상담일 기준).

    종류는 안 가린다. 알선만 세게 해 뒀더니 0으로 떴다 — 실제로는 판매 상담과 수출로
    적고 있어서 알선 상담이 한 건도 없는 달이 있다. 아래 '그냥 간 손님' 목록도 종류를
    안 가리므로, 여기서만 가리면 위아래 숫자가 어긋난다.
  */
  /** 그 건을 맡은 사람 — 방문 담당을 정해 뒀으면 그 사람, 아니면 적은 사람 */
  const ownerOf = (c: ConsultationRecord) => c.visitDealerId ?? c.employeeId;

  /*
    방문으로 센다.

    전에는 그 달 상담을 통째로 모수에 넣고, 거기서 상담종결을 빼고, 계약보류는 계약으로
    안 세는 식이었다 — 규칙이 셋이나 붙어서 "13건 중 9건"이 어디서 나온 수인지 아무도
    못 읽었다.

    이 칸이 보려는 건 하나다. 오기로 한 손님이 몇이었고, 몇이 안 왔고, 온 사람 중
    몇을 계약으로 돌렸나.

      예약 = 방문일을 잡은 건(그날이 지난 것만)
      취소 = 안 온 건(방문취소)
      방문 = 예약 − 취소
      계약 = 계약 + 판매완료
      전환율 = 계약 ÷ 방문

    빼는 건 없다. 상담종결도 보류도 '왔는데 계약이 안 된 것'이라 그냥 못 돌린 쪽에
    들어간다 — 빼기 시작하면 정리를 안 하는 사람의 전환율이 올라간다.

    전화만 받고 안 온 건은 아예 안 센다. 방문을 못 돌린 것과 전화가 안 온 것은 다른
    일이고, 섞으면 둘 다 안 보인다.
  */
  const stats = useMemo(() => {
    /*
      달은 방문일로 끊는다 — 아래 '그냥 간 손님' 목록과 같은 자다.

      상담일로 끊으면 9월에 전화해서 10월에 온 손님이 9월 칸에 들어가는데, 아래 목록은
      10월에 띄운다 — 같은 손님이 두 칸에서 다르게 세어진다.
    */
    const visits = state.consultations
      .filter(c => !!c.visitDate && (c.visitDate ?? '') <= today)
      .filter(c => allMonths || (c.visitDate ?? '').startsWith(month));
    return people
      .map(emp => {
        const mine = visits.filter(c => ownerOf(c) === emp.id);
        const canceled = mine.filter(c => c.status === 'VISIT_CANCELED').length;
        const came = mine.length - canceled;
        const contracted = mine.filter(c => isContracted(c.status)).length;
        return {
          emp,
          booked: mine.length,
          canceled,
          came,
          contracted,
          rate: came > 0 ? Math.round((contracted / came) * 100) : 0,
        };
      })
      .filter(s => s.booked > 0)
      .sort((a, b) => b.rate - a.rate || b.came - a.came);
  }, [people, state.consultations, month, allMonths, today]);

  /** 팀 전체 — 사람별로 나누기 전에 전체가 몇인지 먼저 보인다 */
  const team = useMemo(() => {
    const sum = stats.reduce(
      (a, s) => ({
        booked: a.booked + s.booked,
        canceled: a.canceled + s.canceled,
        came: a.came + s.came,
        contracted: a.contracted + s.contracted,
      }),
      { booked: 0, canceled: 0, came: 0, contracted: 0 },
    );
    return { ...sum, rate: sum.came > 0 ? Math.round((sum.contracted / sum.came) * 100) : 0 };
  }, [stats]);
  const nameOf = (id: string) => dealerName(state.employees, id);

  /** 방문했는데 계약이 안 된 건 — 방문일 기준으로 끊는다(온 날이 지난 것만) */
  const misses = useMemo(() => {
    const ids = new Set(people.map(p => p.id));
    return state.consultations
      .filter(c => !!c.visitDate && c.visitDate <= today)
      .filter(c => allMonths || (c.visitDate ?? '').startsWith(month))
      .filter(c => MISS_STATUS.includes(c.status))
      // 알선팀은 서로 다 본다. 그 밖의 사람은 자기가 맡은 것만
      .filter(c => seesTeam || ids.has(c.visitDealerId ?? c.employeeId))
      .sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''));
  }, [state.consultations, month, allMonths, today, people, seesTeam]);

  const shown = misses
    .filter(c => picked === 'all' || ownerOf(c) === picked)
    .filter(c => status === 'all' || c.status === status);

  /** 아직 왜 안 됐는지 안 적은 건 — 이게 줄어드는 게 이 화면의 쓸모다 */
  const unwritten = shown.filter(c => !c.missReason && !c.missReview).length;

  /** 아직 안 걸어 본 건 — 대표가 돌릴 목록이다 */
  const notRecalled = shown.filter(c => !c.recallResult && !c.recallNote).length;

  const saveRecall = async (c: ConsultationRecord, result: string, note: string) => {
    try {
      await api(`/consultations/${c.id}/recall`, { method: 'POST', body: { result, note } });
      await refresh();
      setEditing(null);
    } catch (e) {
      void alertError('리콜을 적지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

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
          {seesTeam ? '담당자별' : '내'} 방문 → 계약 전환율
        </span>
        <span className="text-[11px] text-slate-400">
          {/* 무엇을 무엇으로 나눈 값인지 한 줄로 — 규칙이 여럿이면 아무도 안 읽는다 */}
          {allMonths ? '전체' : dayjs(month).format('M월')} · {VISIT_TEAM} · 방문하기로 한 손님 중 실제로 온 사람을, 몇
          명이나 계약으로 돌렸나
        </span>
        {misses.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
            그냥 간 손님 {misses.length}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          {/*
            팀 전체를 먼저 적는다.

            사람별 카드만 있으면 "그래서 이번 달에 몇 명이 왔고 몇을 돌렸나"를 머리로
            더해야 한다. 이 칸을 여는 까닭이 바로 그 숫자다.
          */}
          {stats.length > 0 && (
            <p className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                오기로 한 손님 <b className="font-bold text-slate-800">{team.booked}명</b>
              </span>
              {team.canceled > 0 && (
                <span className="text-rose-600">
                  · 안 옴 <b className="font-bold">{team.canceled}명</b>
                </span>
              )}
              <span>
                · 왔다 <b className="font-bold text-slate-800">{team.came}명</b>
              </span>
              <span>
                · 계약 <b className="font-bold text-indigo-700">{team.contracted}명</b>
              </span>
              <span className="ml-auto font-bold text-indigo-700">전환 {team.rate}%</span>
            </p>
          )}

          {stats.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {stats.map(({ emp, booked, canceled, came, contracted, rate }) => (
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
                  {/* 나눗셈을 그대로 적는다 — 퍼센트만 있으면 무엇을 무엇으로 나눈 건지 모른다 */}
                  <p className={`text-[11px] ${picked === emp.id ? 'text-indigo-100' : 'text-slate-500'}`}>
                    방문 {came}명 중 {contracted}명 계약
                  </p>
                  {/* 예약과 취소 — 안 온 사람이 몇인지가 전환율만큼 중요한 값이다 */}
                  <p className={`mt-0.5 text-[11px] ${picked === emp.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                    예약 {booked}명
                    {canceled > 0 && (
                      <>
                        {' · '}
                        <span className={picked === emp.id ? '' : 'text-rose-600'}>안 옴 {canceled}명</span>
                      </>
                    )}
                  </p>
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
                <span className="ml-auto text-[11px] text-slate-400">
                  {unwritten > 0 && `리뷰 안 적은 건 ${unwritten}`}
                  {unwritten > 0 && canRecall && notRecalled > 0 && ' · '}
                  {canRecall && notRecalled > 0 && (
                    <b className="font-bold text-emerald-700">리콜 안 돌린 건 {notRecalled}</b>
                  )}
                </span>
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
                          title="왜 안 됐는지 적기 — 담당자가 적습니다"
                        >
                          <MessageSquarePlus size={13} />
                        </button>
                        {/* 리콜은 담당자가 아닌 사람이 하는 일이다 — 지금은 대표만 */}
                        {canRecall && (
                          <button
                            onClick={() => setRecalling(e => (e === c.id ? null : c.id))}
                            className={`shrink-0 rounded-md px-1.5 py-1 ${
                              c.recallResult || c.recallNote
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:bg-slate-200'
                            }`}
                            title="리콜 — 다시 걸어 보고 결과를 적습니다"
                          >
                            <PhoneOutgoing size={13} />
                          </button>
                        )}
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

                      {/* 걸어 본 결과 — 누가 언제 걸었는지 같이 보여준다 */}
                      {(c.recallResult || c.recallNote) && recalling !== c.id && (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-10 text-[11px]">
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">
                            리콜{c.recallResult && ` · ${c.recallResult}`}
                          </span>
                          <span className="text-slate-600">{c.recallNote}</span>
                          {c.recallBy && (
                            <span className="text-slate-400">
                              — {c.recallBy}
                              {c.recallAt && ` ${dayjs(c.recallAt).format('M/D')}`}
                            </span>
                          )}
                        </p>
                      )}

                      {editing === c.id && (
                        <ReviewEditor row={c} onSave={saveReview} onCancel={() => setEditing(null)} />
                      )}
                      {recalling === c.id && (
                        <RecallEditor row={c} onSave={saveRecall} onCancel={() => setRecalling(null)} />
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

/**
 * 리콜 적는 칸.
 *
 * 리뷰와 생김새는 같지만 쓰는 사람도 내용도 다르다. 리뷰는 담당자가 "왜 안 됐나"를
 * 적는 것이고, 리콜은 팀장(지금은 대표)이 손님에게 직접 걸어 들은 말을 적는 것이다.
 *
 * 둘 다 비우고 저장하면 안 건 것으로 되돌아간다.
 */
function RecallEditor({
  row,
  onSave,
  onCancel,
}: {
  row: ConsultationRecord;
  onSave: (c: ConsultationRecord, result: string, note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [result, setResult] = useState(row.recallResult ?? '');
  const [text, setText] = useState(row.recallNote ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(row, result, text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
      <p className="mb-1 text-[11px] font-bold text-emerald-800">
        리콜 — 다시 걸어서 물어본 결과
        <span className="ml-1 font-normal text-emerald-700/70">
          문제가 있었는지 · 우리 직원이 실수한 게 있는지 · 다른 차를 보겠는지
        </span>
      </p>
      <div className="flex flex-wrap gap-1">
        {RECALL_RESULTS.map(r => (
          <button
            key={r}
            onClick={() => setResult(v => (v === r ? '' : r))}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              result === r ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-emerald-100'
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
          placeholder="손님이 뭐라고 하셨는지 한 줄로"
          className="min-w-0 flex-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs outline-none focus:border-emerald-400"
        />
        <button
          onClick={() => void save()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
