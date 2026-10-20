import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, FileText, Phone } from 'lucide-react';
import { useStore } from '../../store';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { conversionOf, isContracted } from '../../lib/consultationStats';
import { REASONS } from '../consultation/VisitReviewSection';
import { CONSULTATION_STATUS_LABEL, type ConsultationRecord } from '../../types';
import { ContractPhotoThumb, splitPhotos } from './ContractPhotos';

/**
 * 그 달 계약이 어디까지 왔나.
 *
 * 표를 훑어서는 "이번 달 몇 건 했지"가 안 나온다. 목표를 적어 두고, 지금 몇 건이고
 * 몇 건 남았는지를 한 장으로 본다.
 *
 * 세는 규칙은 전환율과 같다(lib/consultationStats.ts) — 계약 = 계약 + 판매완료,
 * 종결은 모수에서 뺀다. 두 곳이 다르게 세면 같은 화면에서 숫자가 어긋난다.
 *
 * 목표는 서버에 둔다.
 *
 * 브라우저에만 담아 뒀었다 — 대표 혼자 보는 숫자라 서버에 둘 일이 아니라고 봤다.
 * 그런데 팀장이 같이 보게 되면서 각자 다른 숫자를 보게 됐다. 한 사람이 적은 목표를
 * 다른 사람이 못 보면 그건 목표가 아니다.
 *
 * 적는 건 관리자와 알선팀이다. 그 달 숫자를 맞춰 가는 사람들이라 목표도 그쪽이 쥔다.
 */

/**
 * 숫자를 누르면 펼쳐지는 목록.
 *
 * 길어질 수 있어 칸 안에서 구르게 한다 — 페이지가 통째로 길어지면 아래 사유 분포가
 * 화면 밖으로 밀린다.
 *
 * 비어 있는 것(계약서 없음·번호 없음)을 머리에 세어 둔다. 그게 이 목록을 여는 까닭이다.
 */
function DrillDown({
  title,
  hint,
  empty,
  count,
  missing,
  missingLabel,
  children,
}: {
  title: string;
  hint: string;
  empty: string;
  count: number;
  missing: number;
  missingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-xs font-bold text-slate-700">{title}</p>
        <p className="text-[11px] text-slate-400">{hint}</p>
        {missing > 0 && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            {missingLabel} {missing}건
          </span>
        )}
      </div>
      {count === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-50 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}

export default function ContractGoalPanel({
  month,
  allMonths,
  canEdit,
}: {
  month: string;
  allMonths: boolean;
  /** 목표를 적을 수 있는가 — 관리자와 알선팀 */
  canEdit: boolean;
}) {
  const { state } = useStore();
  /** 적어 둔 적이 없으면 스무 건으로 본다 — 0 이면 달성률을 셀 수 없다 */
  const [goal, setGoalValue] = useState(20);
  /** 누가 마지막으로 고쳤나 — 숫자가 바뀌어 있으면 누구에게 물을지 알아야 한다 */
  const [goalBy, setGoalBy] = useState('');
  /*
    숫자를 누르면 그 건들이 펼쳐진다.

    "미체결 68건"까지만 보고는 할 일이 안 나온다 — 누구에게 전화를 걸어야 하는지,
    어느 계약서가 안 올라왔는지가 그 숫자 안에 있다. 세어만 두고 못 꺼내 보면
    숫자를 본 사람이 다시 목록을 뒤져야 한다.
  */
  const [open, setOpen] = useState<'done' | 'open' | null>(null);

  // 달을 바꾸면 그 달 목표를 받아온다
  useEffect(() => {
    if (allMonths) return;
    let alive = true;
    void api<{ target: number; updatedBy: string }>(`/settlements/contract-goal?month=${month}`)
      .then(r => {
        if (!alive) return;
        setGoalValue(r.target);
        setGoalBy(r.updatedBy);
      })
      .catch(() => {
        // 못 받아와도 화면은 돈다 — 기본값으로 그린다
      });
    return () => {
      alive = false;
    };
  }, [month, allMonths]);

  /*
    적는 동안에는 화면만 바꾸고, 칸을 떠날 때 보낸다.

    한 글자마다 보내면 '2'를 치는 순간 목표가 2가 되어 모두에게 그렇게 보인다.
  */
  const setGoal = (next: number) => setGoalValue(Math.max(0, Math.round(next)));

  const saveGoal = async () => {
    try {
      const r = await api<{ target: number; updatedBy: string }>('/settlements/contract-goal', {
        method: 'POST',
        body: { month, target: goal },
      });
      setGoalValue(r.target);
      setGoalBy(r.updatedBy);
    } catch (e) {
      void alertError('목표를 저장하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /** 그 달 알선 상담 — 상담일 기준 */
  const stat = useMemo(() => {
    /*
      종류를 안 가린다.

      알선만 세게 해 뒀더니 0으로 떴다 — 실제로는 판매 상담과 수출로 적고 있어서
      알선 상담이 한 건도 없는 달이 있다. 계약은 어느 탭에서 적었든 계약이다.
    */
    const rows = state.consultations.filter(c => allMonths || c.date.startsWith(month));
    return conversionOf(rows);
  }, [state.consultations, month, allMonths]);

  /**
   * 못 간 건이 왜 못 갔나 — 적어 둔 사유를 모은다.
   *
   * 달성률만 띄우면 "몇 퍼센트"까지만 알고 그래서 무엇을 고쳐야 하는지는 모른다. 예산이
   * 모자라서 못 간 것과 할부가 부결돼서 못 간 것은 다음에 할 일이 아주 다르다.
   *
   * 아직 안 적은 건도 같이 센다 — 그 숫자가 크면 아래 사유 분포 자체를 믿을 수 없다.
   */
  const reasons = useMemo(() => {
    const open = state.consultations
      .filter(c => allMonths || c.date.startsWith(month))
      .filter(c => !isContracted(c.status));

    const counted = new Map<string, number>();
    let blank = 0;
    for (const c of open) {
      const key = (c.missReason ?? '').trim();
      if (!key) {
        blank += 1;
        continue;
      }
      counted.set(key, (counted.get(key) ?? 0) + 1);
    }

    // 적어 둔 차례(REASONS)대로 늘어놓는다 — 달마다 자리가 바뀌면 견주기 어렵다
    const rows = REASONS.map(r => ({ reason: r, count: counted.get(r) ?? 0 })).filter(r => r.count > 0);
    for (const [reason, count] of counted) {
      if (!REASONS.includes(reason)) rows.push({ reason, count });
    }
    return { rows, blank, total: open.length };
  }, [state.consultations, month, allMonths]);

  /*
    펼쳤을 때 보여줄 건들.

    체결은 계약서를 띄운다 — 계약서는 정산에 붙어 있어서 차량번호로 맞춰 온다.
    미체결은 손님번호를 띄운다 — 눌러서 바로 걸 수 있게.
  */
  const lists = useMemo(() => {
    const rows = state.consultations
      .filter(c => allMonths || c.date.startsWith(month))
      // 종결·방문취소는 모수에서 뺀 건이다 — 여기서도 안 띄운다
      .filter(c => c.status !== 'CLOSED' && c.status !== 'VISIT_CANCELED');

    /** 차량번호로 계약서 사진을 찾는다. 번호에 공백이 섞여 있어 걷어내고 맞춘다 */
    const plate = (v?: string | null) => (v ?? '').replace(/\s+/g, '').trim();
    const photos = new Map<string, string>();
    for (const s of [...state.purchaseSettlements, ...state.brokerageSettlements]) {
      const key = plate(s.vehicleNumber);
      const got = (s.contractPhotos ?? '').trim();
      if (key && got && !photos.get(key)) photos.set(key, got);
    }

    const by = (a: ConsultationRecord, b: ConsultationRecord) => b.date.localeCompare(a.date);
    return {
      done: rows.filter(c => isContracted(c.status)).sort(by).map(c => ({ c, photos: photos.get(plate(c.vehicleNumber)) ?? '' })),
      open: rows.filter(c => !isContracted(c.status)).sort(by),
    };
  }, [state.consultations, state.purchaseSettlements, state.brokerageSettlements, month, allMonths]);

  const nameOf = (id: string) => state.employees.find(e => e.id === id)?.name ?? '';

  /** 목표 대비 — 목표가 0이면 비율을 낼 수 없다 */
  const percent = goal > 0 ? Math.round((stat.contracted / goal) * 100) : 0;
  const left = goal - stat.contracted;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(percent, 100) / 100) * circumference;

  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-slate-900">
          {allMonths ? '전체 기간' : dayjs(month).format('M월')} 계약 체결 진행 현황
        </h3>
        <span className="text-[11px] text-slate-400">월간 목표 달성 지표</span>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${
            percent >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          달성률 {percent}%
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* 도넛 — 목표를 채운 만큼 */}
        <div className="relative mx-auto h-36 w-36 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="13" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={percent >= 100 ? '#059669' : '#2563eb'}
              strokeWidth="13"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900">{percent}%</span>
            <span className="text-[11px] text-slate-400">체결 달성률</span>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          {/* 목표는 손으로 적는다 — 달마다 다르다 */}
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">총 계약 목표</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <input
                type="number"
                min={0}
                value={goal}
                onChange={e => setGoal(Number(e.target.value))}
                onBlur={() => void saveGoal()}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                disabled={allMonths || !canEdit}
                title={canEdit ? '고치면 모두에게 같은 목표로 보입니다' : '관리자와 알선팀만 고칩니다'}
                className="w-16 rounded border border-transparent bg-transparent text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-400 disabled:opacity-60"
              />
              <span className="text-sm font-medium text-slate-400">건</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {allMonths
                ? '달을 고르면 목표를 적습니다'
                : goalBy
                  ? `${dayjs(month).format('M월')} 전체 · ${goalBy} 적음`
                  : `${dayjs(month).format('M월')} 전체`}
            </p>
          </div>

          <button
            onClick={() => setOpen(v => (v === 'done' ? null : 'done'))}
            className={`rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-100 ${
              open === 'done' ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-slate-50'
            }`}
          >
            <p className="flex items-center text-[11px] font-medium text-slate-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle" />
              체결 완료
              <ChevronDown size={13} className={`ml-auto transition-transform ${open === 'done' ? 'rotate-180' : ''}`} />
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {stat.contracted}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] italic text-emerald-600">
              비율 {stat.total > 0 ? Math.round((stat.contracted / stat.total) * 100) : 0}% · 눌러서 계약서 보기
            </p>
          </button>

          <button
            onClick={() => setOpen(v => (v === 'open' ? null : 'open'))}
            className={`rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-100 ${
              open === 'open' ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-slate-50'
            }`}
          >
            <p className="flex items-center text-[11px] font-medium text-slate-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400 align-middle" />
              진행/미체결
              <ChevronDown size={13} className={`ml-auto transition-transform ${open === 'open' ? 'rotate-180' : ''}`} />
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {stat.total - stat.contracted}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] text-slate-400">
              비율 {stat.total > 0 ? Math.round(((stat.total - stat.contracted) / stat.total) * 100) : 0}%
              {stat.closed > 0 && ` · 종결 ${stat.closed}건 제외`} · 눌러서 번호 보기
            </p>
          </button>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">잔여 목표</p>
            <p className={`mt-0.5 text-xl font-bold ${left > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
              {Math.max(0, left)}
              <span className="ml-1 text-sm font-medium text-slate-400">건</span>
            </p>
            <p className="text-[11px] text-slate-400">
              {left > 0 ? `목표까지 ${left}건` : `목표를 ${-left}건 넘겼습니다`}
            </p>
          </div>
        </div>
      </div>

      {/*
        누른 칸을 펼친다.

        체결은 계약서, 미체결은 손님번호다 — 숫자를 본 사람이 바로 다음 일을 할 수 있게
        그 자리에서 꺼내 준다. 번호는 눌러서 걸고, 계약서는 눌러서 크게 본다.
      */}
      {open === 'done' && (
        <DrillDown
          title="체결 완료 — 계약서"
          hint={`${lists.done.length}건 · 계약서는 정산에 붙은 사진입니다 · 눌러서 크게 봅니다`}
          empty="체결된 건이 없습니다."
          count={lists.done.length}
          missing={lists.done.filter(r => !splitPhotos(r.photos).length).length}
          missingLabel="계약서 안 올라온 건"
        >
          {lists.done.map(({ c, photos }) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-16 shrink-0 text-[11px] text-slate-400">{dayjs(c.date).format('M/D')}</span>
              <span className="w-24 shrink-0 text-xs font-bold text-slate-800">{c.vehicleNumber || '번호 없음'}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{c.vehicleName}</span>
              <span className="w-16 shrink-0 text-[11px] text-slate-400">{nameOf(c.employeeId)}</span>
              {splitPhotos(photos).length > 0 ? (
                <ContractPhotoThumb value={photos} size={36} alt="계약서" />
              ) : (
                /*
                  계약서가 없는 건이 제일 봐야 할 건이다 — 빈칸으로 두면 안 보인다.

                  누르면 그 차로 보내 주고 싶지만, 여기가 이미 정산 화면 안이라 걸림쇠를
                  집어가는 자리(열릴 때 한 번)가 다시 안 열린다. 번호를 띄워 두면 위
                  빨간 칸에 치면 된다.
                */
                <span className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 text-[11px] font-bold text-amber-700">
                  <FileText size={12} /> 계약서 없음
                </span>
              )}
            </li>
          ))}
        </DrillDown>
      )}

      {open === 'open' && (
        <DrillDown
          title="진행/미체결 — 손님번호"
          hint={`${lists.open.length}건 · 번호를 누르면 바로 걸립니다`}
          empty="진행 중인 건이 없습니다."
          count={lists.open.length}
          missing={lists.open.filter(c => !(c.customerPhone ?? '').trim()).length}
          missingLabel="번호 안 적힌 건"
        >
          {lists.open.map(c => {
            const phone = (c.customerPhone ?? '').trim();
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-16 shrink-0 text-[11px] text-slate-400">{dayjs(c.date).format('M/D')}</span>
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                    className="flex w-32 shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                  >
                    <Phone size={11} /> {phone}
                  </a>
                ) : (
                  <span className="w-32 shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                    번호 없음
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                  {c.vehicleNumber && <b className="font-bold text-slate-800">{c.vehicleNumber}</b>} {c.vehicleName}
                  {c.missReason && <span className="ml-1 text-slate-400">· {c.missReason}</span>}
                </span>
                <span className="w-14 shrink-0 text-[11px] text-slate-400">{nameOf(c.employeeId)}</span>
                <span className="w-14 shrink-0 text-right text-[11px] font-medium text-slate-500">
                  {CONSULTATION_STATUS_LABEL[c.status]}
                </span>
              </li>
            );
          })}
        </DrillDown>
      )}

      {/*
        왜 못 갔나.

        달성률만 띄우면 몇 퍼센트까지만 알고 무엇을 고쳐야 하는지는 모른다. 예산이 모자라
        못 간 것과 할부가 부결돼 못 간 것은 다음에 할 일이 아주 다르다.

        아직 안 적은 건을 같이 적는다 — 그 숫자가 크면 이 분포 자체를 믿으면 안 된다.
      */}
      {reasons.total > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
            <p className="text-xs font-bold text-slate-600">못 간 건 — 적어 둔 사유</p>
            <p className="text-[11px] text-slate-400">
              계약으로 안 간 {reasons.total}건
              {reasons.blank > 0 && (
                <>
                  {' · '}
                  <b className="font-bold text-amber-600">아직 안 적음 {reasons.blank}건</b>
                </>
              )}
            </p>
          </div>

          {reasons.rows.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              아래 목록에서 💬 를 눌러 왜 안 됐는지 적어 주세요 — 적힌 것이 여기 모입니다.
            </p>
          ) : (
            <div className="space-y-1">
              {reasons.rows.map(r => (
                <div key={r.reason} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] font-medium text-slate-600">{r.reason}</span>
                  {/* 막대로 그린다 — 숫자만 늘어놓으면 어느 쪽이 큰지 세어 가며 본다 */}
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-indigo-500"
                      style={{ width: `${Math.round((r.count / reasons.total) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[11px] text-slate-500">
                    {r.count}건 · {Math.round((r.count / reasons.total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
