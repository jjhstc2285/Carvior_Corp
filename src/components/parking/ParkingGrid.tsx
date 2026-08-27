import { useState } from 'react';
import { useStore } from '../../store';
import type { ParkingStatus, ParkingVehicle } from '../../types';
import { PARKING_LOTS, PARKING_SLOTS } from '../../lib/parkingLayout';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
  onCellClick: (lot: string, zone: string, slot: string, existing: ParkingVehicle | null) => void;
  /** 끌어다 놓기 실패를 화면에 알린다 */
  onMoveError: (message: string) => void;
}

const STATUS_DOT: Record<ParkingStatus, string> = {
  DISPLAY: 'bg-blue-400',
  RESERVED: 'bg-amber-400',
  SOLD: 'bg-emerald-400',
  MOVING: 'bg-gray-400',
};

/** 지금 끌고 있는 칸 / 놓으려는 칸을 가리키는 키 */
function cellKey(lot: string, zone: string, slot: string): string {
  return `${lot}|${zone}|${slot}`;
}

// 요청받은 엑셀 시트지(주차장 배너 → 구역 컬럼 → 앞/뒤 겹주차 행)를 그대로 재현한 그리드.
// 영화관 좌석표처럼 셀을 클릭하면 그 자리의 차량을 등록/수정/비울 수 있다(관리자만).
//
// 차를 끌어다 다른 칸에 놓으면 자리를 옮긴다. 그 칸에 차가 있으면 서로 자리를 바꾼다.
// 실제 이동은 서버가 한 트랜잭션으로 처리한다 — 화면에서 두 번 나눠 부르면
// 중간에 끊겼을 때 두 차가 같은 칸에 있거나 한 대가 사라진다.
export default function ParkingGrid({ role, onCellClick, onMoveError }: Props) {
  const { state, moveParkingVehicle } = useStore();
  const [dragging, setDragging] = useState<ParkingVehicle | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const canMove = role === 'ADMIN';

  const vehicleAt = (lot: string, zone: string, slot: string) =>
    state.parkingVehicles.find(v => v.lot === lot && v.zone === zone && v.slot === slot) ?? null;

  const handleDrop = async (lot: string, zone: string, slot: string) => {
    const moving = dragging;
    setDragging(null);
    setOver(null);
    if (!moving) return;
    // 제자리에 놓으면 아무 일도 없다.
    if (moving.lot === lot && moving.zone === zone && moving.slot === slot) return;

    try {
      await moveParkingVehicle(moving.id, { lot, zone, slot });
    } catch (e) {
      onMoveError(e instanceof Error ? e.message : '자리를 옮기지 못했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      {canMove && (
        <p className="text-xs text-slate-400">
          차를 끌어다 다른 칸에 놓으면 자리가 바뀝니다. 그 칸에 차가 있으면 서로 맞바뀝니다.
        </p>
      )}

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
                        const key = cellKey(lot, zone, slot);
                        const isOver = over === key;
                        const isSource = dragging?.id === v?.id && !!v;

                        return (
                          <td key={zone} className="border border-slate-100 p-0">
                            <button
                              onClick={() => onCellClick(lot, zone, slot, v)}
                              disabled={role !== 'ADMIN' && !v}
                              draggable={canMove && !!v}
                              onDragStart={() => v && setDragging(v)}
                              onDragEnd={() => { setDragging(null); setOver(null); }}
                              onDragOver={e => {
                                if (!canMove || !dragging) return;
                                // 기본 동작을 막아야 이 칸이 '놓을 수 있는 곳'이 된다.
                                e.preventDefault();
                                setOver(key);
                              }}
                              onDragLeave={() => setOver(prev => (prev === key ? null : prev))}
                              onDrop={e => { e.preventDefault(); void handleDrop(lot, zone, slot); }}
                              className={`flex h-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-center transition-colors ${
                                isOver
                                  ? 'bg-indigo-200 ring-2 ring-inset ring-indigo-500'
                                  : v
                                    ? 'bg-orange-100 hover:bg-orange-200'
                                    : 'bg-white hover:bg-slate-50'
                              } ${isSource ? 'opacity-40' : ''} ${role !== 'ADMIN' && !v ? 'cursor-default' : ''} ${
                                canMove && v ? 'cursor-grab active:cursor-grabbing' : ''
                              }`}
                            >
                              {v ? (
                                <span className="flex items-center gap-1 font-mono font-semibold text-slate-800">
                                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[v.status]}`} />
                                  {v.vehicleNumber}
                                </span>
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
