import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { LayoutGrid, List, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { PARKING_STATUS_LABEL, type ParkingStatus, type ParkingVehicle } from '../../types';
import ParkingForm from './ParkingForm';
import ParkingGrid from './ParkingGrid';

interface Props {
  role: 'employee' | 'admin';
}

const STATUS_COLOR: Record<ParkingStatus, string> = {
  전시중: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  예약중: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  판매완료: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  이동중: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

export default function ParkingModule({ role }: Props) {
  const { state, deleteParkingVehicle } = useStore();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [lotFilter, setLotFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ParkingStatus | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParkingVehicle | null>(null);
  const [presetPosition, setPresetPosition] = useState<{ lot: string; zone: string; slot: string } | null>(null);

  const lots = useMemo(() => Array.from(new Set(state.parkingVehicles.map(v => v.lot))).sort(), [state.parkingVehicles]);
  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const filtered = state.parkingVehicles
    .filter(v => lotFilter === 'all' || v.lot === lotFilter)
    .filter(v => statusFilter === 'all' || v.status === statusFilter)
    .filter(v => !query.trim() || v.vehicleNumber.includes(query.trim()) || v.vehicleModel.includes(query.trim()))
    .sort((a, b) => a.lot.localeCompare(b.lot) || a.zone.localeCompare(b.zone));

  const handleCellClick = (lot: string, zone: string, slot: string, existing: ParkingVehicle | null) => {
    if (role !== 'admin' && !existing) return;
    setPresetPosition({ lot, zone, slot });
    setEditing(existing);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">주차장 차량 위치 관리</h1>
          <p className="mt-1 text-sm text-slate-500">주차장 → 구역 → 위치별로 차량을 조회하고 관리합니다. 칸을 클릭해서 바로 등록/수정하세요. (기존 엑셀 시트지 대체)</p>
        </div>
        {role === 'admin' && (
          <button
            onClick={() => { setEditing(null); setPresetPosition(null); setFormOpen(true); }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 차량 등록
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView('grid')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <LayoutGrid size={14} /> 구역도
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <List size={14} /> 리스트
          </button>
        </div>
        {view === 'list' && (
          <>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="차량번호 또는 차종 검색"
              className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <select value={lotFilter} onChange={e => setLotFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="all">전체 주차장</option>
              {lots.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ParkingStatus | 'all')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="all">전체 상태</option>
              {Object.entries(PARKING_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="ml-auto text-xs text-slate-400">총 {filtered.length}대</span>
          </>
        )}
      </div>

      {view === 'grid' ? (
        <ParkingGrid role={role} onCellClick={handleCellClick} />
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">주차장</th>
                <th className="px-5 py-2.5 font-medium">구역</th>
                <th className="px-5 py-2.5 font-medium">위치</th>
                <th className="px-5 py-2.5 font-medium">차량번호</th>
                <th className="px-5 py-2.5 font-medium">차종</th>
                <th className="px-5 py-2.5 font-medium">담당자</th>
                <th className="px-5 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium">최근 수정</th>
                {role === 'admin' && <th className="px-5 py-2.5 font-medium text-right">관리</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={role === 'admin' ? 9 : 8} className="px-5 py-10 text-center text-sm text-slate-400">조건에 맞는 차량이 없습니다.</td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-2.5 text-slate-600">{v.lot}</td>
                  <td className="px-5 py-2.5 text-slate-600">{v.zone}</td>
                  <td className="px-5 py-2.5 text-slate-500">{v.slot}</td>
                  <td className="px-5 py-2.5 font-mono font-medium text-slate-700">{v.vehicleNumber}</td>
                  <td className="px-5 py-2.5 text-slate-600">{v.vehicleModel}</td>
                  <td className="px-5 py-2.5 text-slate-500">{employeeOf(v.employeeId)?.name ?? '-'}</td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[v.status]}`}>
                      {PARKING_STATUS_LABEL[v.status]}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-400">{dayjs(v.updatedAt).format('M/D HH:mm')}</td>
                  {role === 'admin' && (
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => { setEditing(v); setPresetPosition(null); setFormOpen(true); }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">수정</button>
                        <button onClick={() => { if (confirm('삭제할까요?')) deleteParkingVehicle(v.id); }} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {formOpen && (
        <ParkingForm
          editing={editing}
          defaultEmployeeId={state.currentEmployeeId}
          presetPosition={presetPosition ?? undefined}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
