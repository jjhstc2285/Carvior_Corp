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
import { PARKING_STATUS_LABEL, type ParkingStatus, type ParkingVehicle } from '../../types';
import { PARKING_GROUPS, PARKING_LOTS, slotsOf, type ParkingGroup } from '../../lib/parkingLayout';
import { PARKING_STATUS_STYLE } from '../../lib/parkingStatus';

interface Props {
  onCellClick: (lot: string, zone: string, slot: string, existing: ParkingVehicle | null) => void;
  /** 끌어다 놓기 실패를 화면에 알린다 */
  onMoveError: (message: string) => void;
}

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
  onClick,
}: {
  pos: CellPos;
  vehicle: ParkingVehicle | null;
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
        className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition-colors ${
          isOver
            ? 'bg-indigo-200 ring-2 ring-inset ring-indigo-500'
            : vehicle
              ? PARKING_STATUS_STYLE[vehicle.status].cell
              : 'bg-white hover:bg-slate-50'
        } ${isDragging ? 'opacity-30' : ''} ${vehicle ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {vehicle ? (
          <>
            <span className="flex items-center gap-1 font-mono font-semibold">
              <span className={`h-1.5 w-1.5 rounded-full ${PARKING_STATUS_STYLE[vehicle.status].dot}`} />
              {vehicle.vehicleNumber}
            </span>
            {/*
              메모는 "3시", "재검", "외부 고색"처럼 그 자리에서 바로 알아야 하는 말이 적힌다.
              칸이 좁아 한 줄로는 차량번호에 묻히니 아래 줄에 따로 둔다.
              길면 잘라 보여주고 전체는 마우스를 올려 본다.
            */}
            {vehicle.memo && (
              <span className="w-full truncate text-[10px] leading-tight opacity-70" title={vehicle.memo}>
                {vehicle.memo}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-300">·</span>
        )}
      </button>
    </td>
  );
}

// 요청받은 엑셀 시트지(주차장 배너 → 구역 컬럼 → 앞/뒤 겹주차 행)를 그대로 재현한 그리드.
// 영화관 좌석표처럼 셀을 클릭하면 그 자리의 차량을 등록·수정할 수 있다.
// 등록·이동은 현장에서 하는 일이라 직원도 한다(삭제만 목록 화면에서 관리자로 막는다).
//
// 차를 끌어다 다른 칸에 놓으면 자리를 옮긴다. 그 칸에 차가 있으면 서로 자리를 바꾼다.
// 실제 이동은 서버가 한 트랜잭션으로 처리한다 — 화면에서 두 번 나눠 부르면
// 중간에 끊겼을 때 두 차가 같은 칸에 있거나 한 대가 사라진다.
export default function ParkingGrid({ onCellClick, onMoveError }: Props) {
  const { state, moveParkingVehicle } = useStore();
  const [dragging, setDragging] = useState<ParkingVehicle | null>(null);
  // 주차장이 열 곳이 넘어 다 펼치면 표가 너무 길다 — 본관/외부로 나눠 본다.
  const [group, setGroup] = useState<ParkingGroup>('본관');

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

        {/* 묶음 탭 — 어느 주차장에 차가 몇 대 있는지도 같이 보여준다 */}
        <div className="flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
          {PARKING_GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
                group === g ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {g}
              <span className="ml-1 text-xs text-slate-400">
                {state.parkingVehicles.filter(v => PARKING_LOTS.some(l => l.group === g && l.lot === v.lot)).length}
              </span>
            </button>
          ))}
        </div>

        {PARKING_LOTS.filter(l => l.group === group).map(config => {
          const { lot, bandColor, zones } = config;
          const slots = slotsOf(config);
          // 본관은 앞/뒤 두 대씩 겹쳐 대서 묶음 이름을 세로로 합쳐 보여준다.
          // 외부는 그냥 줄이 늘어서 있을 뿐이라 줄 이름을 그대로 적는다.
          const grouped = slots.length === 4 && slots[0] === '앞1';
          return (
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
                  {slots.map((slot, i) => {
                    const isFirstOfGroup = !grouped || slot === '앞1' || slot === '뒤1';
                    const groupLabel = grouped ? (slot.startsWith('앞') ? '앞' : '뒤') : slot;
                    return (
                      <tr key={slot} className={grouped && i === 2 ? 'border-t-2 border-t-slate-300' : ''}>
                        {isFirstOfGroup && (
                          <td rowSpan={grouped ? 2 : 1} className="border border-slate-100 bg-slate-50 px-1 text-center align-middle text-[11px] font-semibold text-slate-500">
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
          );
        })}

        {/* 칸 색과 같은 색으로 보여준다 — 범례가 구역도와 다르면 볼 이유가 없다 */}
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(PARKING_STATUS_STYLE) as ParkingStatus[]).map(status => (
            <span
              key={status}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ${PARKING_STATUS_STYLE[status].cell}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${PARKING_STATUS_STYLE[status].dot}`} />
              {PARKING_STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      </div>

      {/* 끌고 있는 동안 손가락·커서를 따라다니는 조각 */}
      <DragOverlay>
        {dragging && (
          <div
            className={`flex items-center gap-1 rounded-lg border-2 border-indigo-500 px-2 py-1.5 font-mono text-xs font-semibold shadow-lg ${PARKING_STATUS_STYLE[dragging.status].cell}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${PARKING_STATUS_STYLE[dragging.status].dot}`} />
            {dragging.vehicleNumber}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
