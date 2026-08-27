import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
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

interface CellPos {
  lot: string;
  zone: string;
  slot: string;
}

function cellKey(p: CellPos): string {
  return `${p.lot}|${p.zone}|${p.slot}`;
}

/**
 * 칸 하나.
 *
 * 놓는 자리(droppable)와 끄는 대상(draggable)을 겸한다 — dnd-kit의 훅은 컴포넌트 안에서만
 * 부를 수 있어서 칸마다 조각으로 뺐다.
 */
function ParkingCell({
  pos,
  vehicle,
  canEdit,
  onClick,
}: {
  pos: CellPos;
  vehicle: ParkingVehicle | null;
  canEdit: boolean;
  onClick: () => void;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `cell:${cellKey(pos)}`, data: pos });
  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id: `car:${vehicle?.id ?? cellKey(pos)}`,
    disabled: !vehicle,
    data: { vehicle },
  });

  return (
    <td ref={dropRef} className="border border-slate-100 p-0">
      <button
        ref={dragRef}
        {...attributes}
        {...listeners}
        onClick={onClick}
        disabled={!canEdit && !vehicle}
        className={`flex h-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-center transition-colors ${
          isOver
            ? 'bg-indigo-200 ring-2 ring-inset ring-indigo-500'
            : vehicle
              ? 'bg-orange-100 hover:bg-orange-200'
              : 'bg-white hover:bg-slate-50'
        } ${isDragging ? 'opacity-30' : ''} ${!canEdit && !vehicle ? 'cursor-default' : ''} ${
          vehicle ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {vehicle ? (
          <span className="flex items-center gap-1 font-mono font-semibold text-slate-800">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[vehicle.status]}`} />
            {vehicle.vehicleNumber}
          </span>
        ) : (
          <span className="text-slate-300">·</span>
        )}
      </button>
    </td>
  );
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

  const canEdit = role === 'ADMIN';

  /**
   * 손가락으로도 끌 수 있게 포인터 하나로 마우스·터치를 같이 받는다.
   *
   * 0.2초 눌러야 끌기가 시작된다 — 표가 옆으로 스크롤되는 화면이라, 바로 반응하게 하면
   * 손가락으로 밀어 스크롤할 때마다 차가 끌려간다. 짧게 누르면 그대로 칸이 열린다.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const vehicleAt = (pos: CellPos) =>
    state.parkingVehicles.find(v => v.lot === pos.lot && v.zone === pos.zone && v.slot === pos.slot) ?? null;

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current?.vehicle as ParkingVehicle | undefined) ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const moving = (e.active.data.current?.vehicle as ParkingVehicle | undefined) ?? null;
    const to = e.over?.data.current as CellPos | undefined;
    setDragging(null);
    if (!moving || !to) return;
    // 제자리에 놓으면 아무 일도 없다.
    if (moving.lot === to.lot && moving.zone === to.zone && moving.slot === to.slot) return;

    try {
      await moveParkingVehicle(moving.id, to);
    } catch (err) {
      onMoveError(err instanceof Error ? err.message : '자리를 옮기지 못했습니다.');
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        <p className="text-xs text-slate-400">
          차를 <b>꾹 눌러</b> 다른 칸에 놓으면 자리가 바뀝니다. 그 칸에 차가 있으면 서로 맞바뀝니다. (휴대폰도 됩니다)
        </p>

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
                          const pos = { lot, zone, slot };
                          const v = vehicleAt(pos);
                          return (
                            <ParkingCell
                              key={zone}
                              pos={pos}
                              vehicle={v}
                              canEdit={canEdit}
                              onClick={() => onCellClick(lot, zone, slot, v)}
                            />
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

      {/* 끌고 있는 동안 손가락·커서를 따라다니는 조각 */}
      <DragOverlay>
        {dragging && (
          <div className="flex items-center gap-1 rounded-lg border-2 border-indigo-500 bg-orange-100 px-2 py-1.5 font-mono text-xs font-semibold text-slate-800 shadow-lg">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[dragging.status]}`} />
            {dragging.vehicleNumber}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
