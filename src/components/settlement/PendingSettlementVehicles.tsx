import { useMemo } from 'react';
import { ReceiptText } from 'lucide-react';
import { useStore } from '../../store';
import type { ConsultationRecord } from '../../types';

interface Props {
  onStart: (consultation: ConsultationRecord) => void;
}

/**
 * 정산 대상 차량.
 *
 * 상담 → 계약 → 판매완료까지 간 건은 정산을 해야 한다. 그 차들을 알선 정산 위에 띄우고,
 * 누르면 차량번호·차명·입금액이 채워진 정산 등록 창이 열린다.
 *
 * 이미 알선 정산이 잡힌 차량번호는 빠진다 — 남은 것만 보여야 "무엇이 밀렸는지"가 된다.
 */
export default function PendingSettlementVehicles({ onStart }: Props) {
  const { state } = useStore();

  const pending = useMemo(() => {
    const settled = new Set(state.brokerageSettlements.map(s => s.vehicleNumber));
    return state.consultations
      .filter(c => c.status === 'SOLD' && !settled.has(c.vehicleNumber))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.consultations, state.brokerageSettlements]);

  if (pending.length === 0) return null;

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  return (
    <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <ReceiptText size={14} className="text-indigo-700" />
        <p className="text-xs font-bold text-indigo-800">정산 대상 차량</p>
        <span className="text-[11px] text-indigo-700/70">
          판매완료 {pending.length}대 — 누르면 그 차로 정산이 열립니다
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pending.map(c => (
          <button
            key={c.id}
            onClick={() => onStart(c)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:bg-indigo-100"
          >
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
