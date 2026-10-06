import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, UserX } from 'lucide-react';
import { useStore } from '../../store';
import ConsultationDetailModal from './ConsultationDetailModal';
import { CONSULTATION_STATUS_LABEL, type ConsultationRecord, type ConsultationStatus } from '../../types';

/**
 * 방문했는데 계약이 안 된 건.
 *
 * 전환율은 숫자로만 보인다 — 몇 퍼센트인지는 알겠는데 어느 손님이 그냥 갔는지는 안
 * 보인다. 정산을 보는 자리에서 그 손님들을 바로 펴 본다.
 *
 * 온 날이 지난 건만 센다. 아직 안 온 손님을 '안 됐다'로 세면 매일 아침 목록이 부풀어
 * 오른다. 계약·판매완료로 간 건은 당연히 뺀다.
 *
 * 눌러서 바로 연다 — 보류면 왜 보류인지, 종결이면 무슨 말이 오갔는지가 상담 내용에 있다.
 */

/** 계약으로 안 간 상태 — 보류·종결·진행중 */
const MISS_STATUS: ConsultationStatus[] = ['ON_HOLD', 'CLOSED', 'IN_PROGRESS'];

const STATUS_CLASS: Record<string, string> = {
  ON_HOLD: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-slate-200 text-slate-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
};

export default function VisitMissPanel({ month, allMonths }: { month: string; allMonths: boolean }) {
  const { state } = useStore();
  const [open, setOpen] = useState(true);
  const [pick, setPick] = useState<ConsultationStatus | 'all'>('all');
  const [detail, setDetail] = useState<ConsultationRecord | null>(null);

  const today = dayjs().format('YYYY-MM-DD');

  const misses = useMemo(() => {
    return state.consultations
      .filter(c => !!c.visitDate && c.visitDate <= today)
      .filter(c => allMonths || c.visitDate!.startsWith(month))
      .filter(c => MISS_STATUS.includes(c.status))
      .sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''));
  }, [state.consultations, month, allMonths, today]);

  /** 그 달에 온 손님이 몇이고 그중 몇이 그냥 갔는지 — 비율이 있어야 숫자에 뜻이 생긴다 */
  const visited = useMemo(
    () =>
      state.consultations.filter(
        c => !!c.visitDate && c.visitDate <= today && (allMonths || c.visitDate.startsWith(month)),
      ).length,
    [state.consultations, month, allMonths, today],
  );

  const countOf = (s: ConsultationStatus) => misses.filter(c => c.status === s).length;
  const shown = pick === 'all' ? misses : misses.filter(c => c.status === pick);
  const dealerOf = (c: ConsultationRecord) =>
    state.employees.find(e => e.id === (c.visitDealerId ?? c.employeeId))?.name ?? '';

  if (visited === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/30">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-rose-50"
      >
        {open ? <ChevronDown size={14} className="text-rose-700" /> : <ChevronRight size={14} className="text-rose-700" />}
        <UserX size={14} className="text-rose-700" />
        <span className="text-xs font-bold text-rose-800">방문했는데 계약이 안 된 건</span>
        <span className="text-[11px] text-rose-700/80">
          온 손님 {visited}명 중 <b className="font-bold">{misses.length}명</b>
          {visited > 0 && ` · ${Math.round((misses.length / visited) * 100)}%`}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setPick('all')}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                pick === 'all' ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-rose-100'
              }`}
            >
              전체 {misses.length}
            </button>
            {MISS_STATUS.map(s => (
              <button
                key={s}
                onClick={() => setPick(s)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  pick === s ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 hover:bg-rose-100'
                }`}
              >
                {CONSULTATION_STATUS_LABEL[s]} {countOf(s)}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-slate-400">해당하는 건이 없습니다</p>
          ) : (
            /* 한 달치가 수십 건이 되기도 한다 — 칸 안에서 굴린다 */
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {shown.map(c => (
                <button
                  key={c.id}
                  onClick={() => setDetail(c)}
                  className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left hover:bg-rose-100/60"
                >
                  <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">
                    {dayjs(c.visitDate).format('M/D')}
                  </span>
                  <span className="text-[11px] text-slate-400">{c.visitTime}</span>
                  <span className="font-mono text-xs text-slate-600">{c.vehicleNumber}</span>
                  <span className="text-xs text-slate-500">{c.vehicleName}</span>
                  <span className="text-[11px] text-slate-400">{c.customerPhone || c.customerName}</span>
                  {dealerOf(c) && <span className="text-[11px] text-slate-400">· {dealerOf(c)}</span>}
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[c.status]}`}
                  >
                    {CONSULTATION_STATUS_LABEL[c.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 보려고 연 창이다 — 정산 화면에서 상담을 고치게 두지 않는다 */}
      {detail && <ConsultationDetailModal consultation={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
