import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, MessageSquarePlus } from 'lucide-react';
import { api } from '../../lib/api';
import { vehicleListOf } from '../../lib/vehicle';
import type { ManagedVehicle } from '../../types';

interface Props {
  /** 이미 상담이 잡힌 차량번호 — 목록에서 흐리게 표시한다 */
  consultedNumbers: Set<string>;
  onStart: (vehicle: ManagedVehicle) => void;
}

/**
 * 상담 가능 차량.
 *
 * 차량관리에서 상품화·광고완료를 모두 체크하면(이동금지가 아니면) 손님에게 보여줄 수 있는
 * 상태가 된다 — 그 차들을 여기로 끌어와, 문의가 들어오면 바로 상담을 등록하게 한다.
 * 차량번호를 다시 옮겨 치지 않는 게 요점이다.
 *
 * 차량 목록은 전역 store에 없어서(차량관리 화면이 따로 받아온다) 여기서 직접 받아온다.
 */
export default function SellableVehicles({ consultedNumbers, onStart }: Props) {
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    try {
      const rows = await api<ManagedVehicle[]>('/vehicles');
      if (myReq !== reqId.current) return;
      // 상품화 + 광고완료 + 이동금지 아님 = 외부 이동 가능
      setVehicles(rows.filter(v => vehicleListOf(v) === 'MOVABLE'));
    } catch {
      // 목록을 못 받아도 상담 등록 자체는 되므로 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (vehicles.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Car size={14} className="text-emerald-700" />
        <p className="text-xs font-bold text-emerald-800">상담 가능 차량</p>
        <span className="text-[11px] text-emerald-700/70">
          상품화·광고 완료 {vehicles.length}대 — 누르면 그 차로 상담이 열립니다
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {vehicles.map(v => {
          const consulted = consultedNumbers.has(v.vehicleNumber);
          return (
            <button
              key={v.id}
              onClick={() => onStart(v)}
              title={consulted ? '이미 상담이 등록된 차량입니다' : '이 차로 상담 등록'}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                consulted
                  ? 'border-slate-200 bg-white/60 text-slate-400 hover:bg-white'
                  : 'border-emerald-300 bg-white text-slate-700 hover:bg-emerald-100'
              }`}
            >
              <span className="font-mono font-semibold">{v.vehicleNumber}</span>
              <span className="text-slate-500">{v.vehicleModel}</span>
              <MessageSquarePlus size={12} className={consulted ? 'text-slate-300' : 'text-emerald-600'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
