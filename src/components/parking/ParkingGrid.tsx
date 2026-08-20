import { useStore } from '../../store';
import type { ParkingStatus, ParkingVehicle } from '../../types';
import { PARKING_LOTS, PARKING_SLOTS } from '../../lib/parkingLayout';

interface Props {
  role: 'employee' | 'admin';
  onCellClick: (lot: string, zone: string, slot: string, existing: ParkingVehicle | null) => void;
}

const STATUS_DOT: Record<ParkingStatus, string> = {
  전시중: 'bg-blue-400',
  예약중: 'bg-amber-400',
  판매완료: 'bg-emerald-400',
  이동중: 'bg-gray-400',
};

// 요청받은 엑셀 시트지(주차장 배너 → 구역 컬럼 → 앞/뒤 겹주차 행)를 그대로 재현한 그리드.
// 영화관 좌석표처럼 셀을 클릭하면 그 자리의 차량을 등록/수정/비울 수 있다(관리자만).
export default function ParkingGrid({ role, onCellClick }: Props) {
  const { state } = useStore();

  const vehicleAt = (lot: string, zone: string, slot: string) =>
    state.parkingVehicles.find(v => v.lot === lot && v.zone === zone && v.slot === slot) ?? null;

  return (
    <div className="space-y-6">
      {PARKING_LOTS.map(({ lot, bandColor, zones }) => (
        <div key={lot} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th style={{ backgroundColor: bandColor }} className="w-10 border border-white/40" />
                  <th colSpan={zones.length} style={{ backgroundColor: bandColor }} className="border border-white/40 py-1.5 text-center text-sm font-bold text-slate-900">
                    {lot}
                  </th>
                </tr>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-slate-700 px-1 py-1.5" />
                  {zones.map(zone => (
                    <th key={zone} className="min-w-24 border border-slate-700 px-1 py-1.5 font-medium">{zone}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PARKING_SLOTS.map((slot, i) => {
                  const isFirstOfGroup = slot.startsWith('앞') ? slot === '앞1' : slot === '뒤1';
                  const groupLabel = slot.startsWith('앞') ? '앞' : '뒤';
                  return (
                    <tr key={slot} className={i === 2 ? 'border-t-2 border-t-slate-300' : ''}>
                      {isFirstOfGroup && (
                        <td rowSpan={2} className="border border-slate-100 bg-slate-50 px-1 text-center align-middle font-semibold text-slate-500">
                          {groupLabel}
                        </td>
                      )}
                      {zones.map(zone => {
                        const v = vehicleAt(lot, zone, slot);
                        return (
                          <td key={zone} className="border border-slate-100 p-0">
                            <button
                              onClick={() => onCellClick(lot, zone, slot, v)}
                              disabled={role !== 'admin' && !v}
                              className={`flex h-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-center transition-colors ${
                                v ? 'bg-orange-100 hover:bg-orange-200' : 'bg-white hover:bg-slate-50'
                              } ${role !== 'admin' && !v ? 'cursor-default' : ''}`}
                            >
                              {v ? (
                                <>
                                  <span className="flex items-center gap-1 font-mono font-semibold text-slate-800">
                                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[v.status]}`} />
                                    {v.vehicleNumber}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-300">·</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {(Object.entries(STATUS_DOT) as [ParkingStatus, string][]).map(([status, dot]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {status}
          </span>
        ))}
      </div>
    </div>
  );
}
