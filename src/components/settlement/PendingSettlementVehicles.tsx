import { useMemo } from 'react';
import { ReceiptText } from 'lucide-react';
import { useStore } from '../../store';
import { CONSULTATION_KIND_LABEL, type ConsultationKind, type ConsultationRecord } from '../../types';
import { isOfKind } from '../../lib/consultationStats';

interface Props {
  /** 이 종류의 상담만 — 알선 정산 표에는 알선 건만 올라온다 */
  kind: ConsultationKind;
  onStart: (consultation: ConsultationRecord) => void;
}

/**
 * 정산 대상 차량.
 *
 * 상담 → 계약 → 판매완료까지 간 건은 정산을 해야 한다. 그 차들을 알선 정산 위에 띄우고,
 * 누르면 차량번호·차명·입금액이 채워진 정산 등록 창이 열린다.
 *
 * 이미 알선 정산이 잡힌 차량번호는 빠진다 — 남은 것만 보여야 "무엇이 밀렸는지"가 된다.
 *
 * 알선 표에는 알선 건만, 수출 표에는 수출 건만 뜬다. 그래도 종류를 붙여 보여준다 —
 * 상담 내용에 '수출'이라 적혀 이쪽으로 넘어온 건이 있어서, 왜 여기 있는지가 보여야 한다.
 */
export default function PendingSettlementVehicles({ kind, onStart }: Props) {
  const { state } = useStore();

  const pending = useMemo(() => {
    const settled = new Set(state.brokerageSettlements.map(s => s.vehicleNumber));
    return state.consultations
      // 내용에 '수출'이라 적힌 건은 수출로 본다 — 상담 목록에서 가르는 것과 같은 규칙이다
      .filter(c => isOfKind(c, kind) && c.status === 'SOLD' && !settled.has(c.vehicleNumber))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.consultations, state.brokerageSettlements, kind]);

  if (pending.length === 0) return null;

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  return (
    <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <ReceiptText size={14} className="text-indigo-700" />
        <p className="text-xs font-bold text-indigo-800">정산 대상 차량</p>
        <span className="text-[11px] text-indigo-700/70">
          판매완료 {pending.length}대 — 누르면 그 차로 정산이 열립니다. 주차 구역도에서는 이미 빠졌습니다
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pending.map(c => (
          <button
            key={c.id}
            onClick={() => onStart(c)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:bg-indigo-100"
          >
            <span
              className={`rounded px-1 text-[10px] font-bold ${
                c.kind === 'EXPORT' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {CONSULTATION_KIND_LABEL[c.kind]}
            </span>
            <span className="font-mono font-semibold">{c.vehicleNumber}</span>
            {c.vehicleName && <span className="text-slate-500">{c.vehicleName}</span>}
            {c.depositAmount > 0 && (
              <span className="font-semibold text-indigo-600">{c.depositAmount.toLocaleString()}만원</span>
            )}
            <span className="text-slate-400">{employeeOf(c.employeeId)?.name ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
