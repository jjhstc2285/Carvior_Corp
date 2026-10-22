import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, MapPinned } from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { isPlacedWell, suggestLot, type LotSuggestion } from '../../lib/parkingPolicy';
import { VEHICLE_BODY_TYPE_LABEL, type ManagedVehicle, type ParkingVehicle } from '../../types';
import { lotLabel, type ParkingLotConfig } from '../../lib/parkingLayout';

interface Row {
  vehicle: ManagedVehicle;
  /** 지금 서 있는 자리. 아직 주차장에 안 들어온 차는 null */
  parked: ParkingVehicle | null;
  suggestion: LotSuggestion;
}

const STEP_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: '전용 주차장',
  2: '판매 유형',
  3: '차량 가격',
  4: '기타',
};

/**
 * 배치 기준에 어긋나 있는 차를 모아 보여준다.
 *
 * 옮기지는 않는다 — 자리를 옮기려면 실제로 차를 몰고 가야 하고, 그 자리에 빈 칸이
 * 있는지도 현장에서만 안다. 여기서는 "이 차는 여기 있어야 한다"까지만 알려주고,
 * 옮긴 뒤 표에서 끌어다 놓으면 목록에서 빠진다.
 *
 * 이유를 같이 적는 이유: 왜 옮겨야 하는지 모르면 아무도 따르지 않는다.
 */
export default function MoveSuggestions({ lots }: { lots: ParkingLotConfig[] }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  // 차량 관리는 전역 store를 안 거치고 화면마다 따로 받아 온다 — 여기서도 그렇게 한다.
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);

  useEffect(() => {
    // 배치 추천은 곁다리라 못 받아와도 주차장 화면은 그대로 써야 한다.
    api<ManagedVehicle[]>('/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const parkedByNumber = new Map(state.parkingVehicles.map(p => [p.vehicleNumber, p]));

    return vehicles
      .map((vehicle): Row => {
        const parked = parkedByNumber.get(vehicle.vehicleNumber) ?? null;
        return { vehicle, parked, suggestion: suggestLot(vehicle) };
      })
      // 아직 주차장에 안 들어온 차는 '옮길 차'가 아니다 — 처음 댈 때 자리를 고르면 된다.
      .filter(r => r.parked != null && !isPlacedWell(r.suggestion, r.parked.lot))
      .sort((a, b) => a.suggestion.step - b.suggestion.step);
  }, [vehicles, state.parkingVehicles]);

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <MapPinned size={16} className="shrink-0 text-amber-600" />
        <span className="text-sm font-bold text-amber-900">
          배치 기준과 다른 차 {rows.length}대
        </span>
        <span className="text-xs text-amber-700/70">차량 가격·차종·연료 기준</span>
        {open ? (
          <ChevronUp size={16} className="ml-auto shrink-0 text-amber-600" />
        ) : (
          <ChevronDown size={16} className="ml-auto shrink-0 text-amber-600" />
        )}
      </button>

      {open && (
        <div className="max-h-80 space-y-1 overflow-y-auto px-2 pb-2">
          {rows.map(({ vehicle, parked, suggestion }) => (
            <div
              key={vehicle.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs"
            >
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                {vehicle.vehicleNumber}
              </span>
              <span className="font-semibold text-slate-700">{vehicle.vehicleModel}</span>
              <span className="text-slate-400">
                {VEHICLE_BODY_TYPE_LABEL[vehicle.bodyType]}
                {vehicle.priceManwon > 0 && ` · ${vehicle.priceManwon.toLocaleString()}만원`}
                {vehicle.fuel && ` · ${vehicle.fuel}`}
              </span>

              <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-slate-500">
                  {parked ? lotLabel(parked.lot, lots) : ""} {parked?.zone}
                </span>
                <ArrowRight size={12} className="text-amber-500" />
                <span className="font-bold text-amber-700">{suggestion.lots.join(' 또는 ')}</span>
              </span>

              <p className="w-full text-[11px] text-slate-400">
                <span className="mr-1 rounded bg-slate-100 px-1 font-medium text-slate-500">
                  {suggestion.step}단계 {STEP_LABEL[suggestion.step]}
                </span>
                {suggestion.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
