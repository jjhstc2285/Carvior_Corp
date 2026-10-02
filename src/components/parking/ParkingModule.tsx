import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Check, ChevronRight, Download, LayoutGrid, List, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { useTableSort, type SortColumn } from '../table/useTableSort';
import { PARKING_STATUS_LABEL, type ParkingStatus, type ParkingVehicle } from '../../types';
import ParkingForm from './ParkingForm';
import ParkingGrid from './ParkingGrid';
import SheetImportModal from './SheetImportModal';
import MoveSuggestions from './MoveSuggestions';
import KeyDispatchPanel from './KeyDispatchPanel';
import { alertError, confirmDanger } from '../../lib/alert';
import { PARKING_LOTS, lotLabel } from '../../lib/parkingLayout';
import { PARKING_STATUS_STYLE } from '../../lib/parkingStatus';
import { REINSPECT_MONTHS, reinspectLabel } from '../../lib/reinspection';

// 주차 자리는 등록·이동·비우기 모두 현장에서 하는 일이라 권한을 나누지 않는다.
// 시트 가져오기만 관리자다 — 한 번에 백 대가 넘는 자리를 덮어쓰는 일이라서.
/** 재검 칸을 접어뒀는지 — 이 브라우저에만 기억한다 */
const REINSPECT_FOLD_KEY = 'parking-reinspect-fold';

export default function ParkingModule({ isAdmin }: { isAdmin: boolean }) {
  const { state, deleteParkingVehicle, refresh } = useStore();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [lotFilter, setLotFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ParkingStatus | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParkingVehicle | null>(null);
  const [presetPosition, setPresetPosition] = useState<{ lot: string; zone: string; slot: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /*
    매도한 차는 목록에서 내린다.

    차가 나갔는데 자리에 남아 있으면 그 칸이 찬 것으로 보인다 — 다음 차를 어디 세울지
    고를 때 그만큼 자리가 없는 셈이 된다. 기록은 지우지 않고 가려만 둔다.
  */
  const [showSold, setShowSold] = useState(false);

  // 배치도와 같은 순서로 늘어놓는다 — 화면마다 순서가 다르면 같은 주차장을 매번 다시 찾게 된다.
  const lotOrder = useMemo(() => new Map(PARKING_LOTS.map((l, i) => [l.lot, i])), []);
  const rankOf = (lot: string) => lotOrder.get(lot) ?? Number.MAX_SAFE_INTEGER;

  const lots = useMemo(
    () => Array.from(new Set(state.parkingVehicles.map(v => v.lot))).sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.parkingVehicles, lotOrder],
  );
  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const soldCount = state.parkingVehicles.filter(v => v.soldDate).length;

  const filtered = state.parkingVehicles
    .filter(v => showSold || !v.soldDate)
    .filter(v => lotFilter === 'all' || v.lot === lotFilter)
    .filter(v => statusFilter === 'all' || v.status === statusFilter)
    .filter(v => !query.trim() || v.vehicleNumber.includes(query.trim()) || v.vehicleModel.includes(query.trim()))
    .sort((a, b) => rankOf(a.lot) - rankOf(b.lot) || a.lot.localeCompare(b.lot) || a.zone.localeCompare(b.zone));

  /*
    제목줄을 눌러 정렬한다.

    목록이 길어지면 찾는 방법이 눈으로 훑는 것밖에 없었다. 재검이 급한 차부터 보거나
    담당자끼리 모아 보려면 칸을 눌러서 세울 수 있어야 한다.

    안 누르면 원래 차례 그대로다 — 주차장·구역 순으로 서 있는 게 자리를 찾아갈 때는
    제일 편하다.
  */
  const COLUMNS: SortColumn<(typeof filtered)[number]>[] = [
    { key: 'lot', label: '주차장', value: v => v.lot },
    { key: 'zone', label: '구역', value: v => v.zone },
    { key: 'slot', label: '위치', value: v => v.slot },
    { key: 'vehicleNumber', label: '차량번호', value: v => v.vehicleNumber },
    { key: 'vehicleModel', label: '차량명', value: v => v.vehicleModel },
    {
      key: 'reinspect',
      label: '재검',
      // 남은 날이 적을수록 급하다. 기한이 없는 차는 빈 값이라 뒤로 밀린다
      value: v => v.reinspect?.daysLeft ?? null,
      title: '눌러서 정렬합니다 — 남은 날이 적은 차부터',
    },
    { key: 'employee', label: '담당자', value: v => employeeOf(v.employeeId)?.name ?? '' },
    { key: 'status', label: '상태', value: v => PARKING_STATUS_LABEL[v.status] },
    { key: 'updatedAt', label: '최근 수정', value: v => v.updatedAt },
    { key: 'actions', label: '관리', align: 'text-right' },
  ];
  const sorter = useTableSort(COLUMNS);
  const rows = sorter.apply(filtered);

  /**
   * 재검이 필요한 차.
   *
   * 이전한 지 넉 달이 지나면 성능점검을 다시 받아야 하는데, 주차장에 세워둔 차는
   * 그 날짜가 지나는 줄 모르고 그냥 서 있는다. 구역도에서 한 칸씩 찾아보게 두지 않고
   * 화면 맨 위에 모아 둔다 — 지난 지 오래된 차가 맨 앞이다.
   *
   * 이전일자는 차량관리에 적은 값이고, 서버가 차량번호로 짝지어 붙여 준다.
   */
  const dueReinspect = useMemo(
    () =>
      state.parkingVehicles
        // 판 차는 재검받을 이유가 없다
        .filter(v => !v.soldDate)
        .filter(v => v.reinspect)
        .sort((a, b) => (a.reinspect?.daysLeft ?? 0) - (b.reinspect?.daysLeft ?? 0)),
    [state.parkingVehicles],
  );
  const overdue = dueReinspect.filter(v => v.reinspect?.level === 'DUE');

  /*
    접어둘 수 있게 한다 — 스무 대가 넘으면 구역도가 화면 밖으로 밀린다.
    접어도 몇 대인지는 제목에 남으니 숨는 건 없다.
    접은 채로 두었는지는 이 브라우저에만 기억한다(다른 사람 화면까지 접히면 안 된다).
  */
  const [reinspectOpen, setReinspectOpen] = useState(() => {
    try {
      return localStorage.getItem(REINSPECT_FOLD_KEY) !== 'folded';
    } catch {
      return true;
    }
  });
  const toggleReinspect = () => {
    setReinspectOpen(open => {
      try {
        localStorage.setItem(REINSPECT_FOLD_KEY, open ? 'folded' : 'open');
      } catch {
        // 기억 못 해도 접고 펴는 데는 지장이 없다
      }
      return !open;
    });
  };

  /** 재검 받은 날은 차량 위치 수정 창에서 적는다 — 그 차의 다른 값과 같은 자리에 둔다. */
  const openReinspect = (v: ParkingVehicle) => {
    setEditing(v);
    setPresetPosition(null);
    setFormOpen(true);
  };

  const handleCellClick = (lot: string, zone: string, slot: string, existing: ParkingVehicle | null) => {
    // 차를 대고 자리를 적는 건 현장에서 하는 일이라 직원도 빈 칸을 누를 수 있다.
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
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Download size={15} /> 시트에서 가져오기
            </button>
          )}
          <button
            onClick={() => { setEditing(null); setPresetPosition(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 차량 등록
          </button>
        </div>
      </div>

      {dueReinspect.length > 0 && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3.5">
          <button onClick={toggleReinspect} className="flex w-full flex-wrap items-center gap-2 text-left">
            <ChevronRight
              size={15}
              className={`shrink-0 text-red-700 transition-transform ${reinspectOpen ? 'rotate-90' : ''}`}
            />
            <AlertTriangle size={15} className="text-red-600" />
            <h2 className="text-sm font-bold text-red-800">
              재검이 필요한 차 {overdue.length}대
              {dueReinspect.length > overdue.length && (
                <span className="ml-1.5 font-medium text-amber-700">
                  (곧 지나는 차 {dueReinspect.length - overdue.length}대 포함)
                </span>
              )}
            </h2>
            <span className="text-[11px] text-red-700/70">
              이전일자로부터 {REINSPECT_MONTHS}개월이 지나면 성능점검을 다시 받아야 합니다 — 차량관리팀 ·
              지하 2층(B2F)에 둔 차는 세지 않습니다
            </span>
            <span className="ml-auto text-[11px] font-semibold text-red-700/70">{reinspectOpen ? '접기' : '펴기'}</span>
          </button>

          {reinspectOpen && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {dueReinspect.map(v => (
                <li
                  key={v.id}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    v.reinspect?.level === 'DUE'
                      ? 'border-red-300 bg-white text-red-800'
                      : 'border-amber-300 bg-white text-amber-800'
                  }`}
                  title={`이전 ${v.transferDate} · ${v.reinspect?.dueOn} 까지`}
                >
                  <span className="font-mono font-semibold">{v.vehicleNumber}</span>
                  {v.vehicleModel && <span className="ml-1 text-slate-500">{v.vehicleModel}</span>}
                  <span className="ml-1.5 text-slate-400">
                    {lotLabel(v.lot)} {v.zone} {v.slot}
                  </span>
                  <span className="ml-1.5 font-bold">{v.reinspect && reinspectLabel(v.reinspect)}</span>
                  {/* 받고 와서 그 자리에서 적는다 — 적으면 그날부터 다시 넉 달을 센다 */}
                  <button
                    onClick={() => openReinspect(v)}
                    className="ml-1.5 rounded-md bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                  >
                    재검 완료
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
        {/* 나간 차를 다시 봐야 할 때가 있다 — 지우지 않고 가려만 둔 것이라 되돌려 볼 수 있다 */}
        {soldCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={showSold}
              onChange={e => setShowSold(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            매도한 차도 보기 {soldCount}대
          </label>
        )}
        {view === 'list' && (
          <>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="차량번호 또는 차량명 검색"
              className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <select value={lotFilter} onChange={e => setLotFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="all">전체 주차장</option>
              {lots.map(l => <option key={l} value={l}>{lotLabel(l)}</option>)}
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

      <MoveSuggestions />

      {/* 방문 딜러가 QR 로 키를 가져간 기록 — 지금 나가 있는 차가 어느 것인지 */}
      <KeyDispatchPanel />

      {view === 'grid' ? (
        <ParkingGrid
          showSold={showSold}
          onCellClick={handleCellClick}
          onMoveError={m => void alertError('자리를 옮기지 못했습니다', m)}
        />
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">{sorter.headers()}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">조건에 맞는 차량이 없습니다.</td></tr>
              )}
              {rows.map(v => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-2.5 text-slate-600">{lotLabel(v.lot)}</td>
                  <td className="px-5 py-2.5 text-slate-600">{v.zone}</td>
                  <td className="px-5 py-2.5 text-slate-500">{v.slot}</td>
                  <td className="px-5 py-2.5 font-mono font-medium text-slate-700">{v.vehicleNumber}</td>
                  <td className="px-5 py-2.5 text-slate-600">{v.vehicleModel}</td>
                  {/* 이전일자를 안 적은 차는 셀 기준이 없어 아무 말도 안 한다 */}
                  <td className="whitespace-nowrap px-5 py-2.5">
                    {v.reinspect ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          v.reinspect.level === 'DUE' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                        }`}
                        title={`이전 ${v.transferDate} · ${v.reinspect.dueOn} 까지`}
                      >
                        {reinspectLabel(v.reinspect)}
                      </span>
                    ) : v.lastInspectedOn ? (
                      <span className="text-xs text-slate-400">{v.lastInspectedOn} 재검</span>
                    ) : (
                      <span className="text-xs text-slate-300">{v.transferDate ?? '이전일자 없음'}</span>
                    )}
                    {v.reinspect && (
                      <button
                        onClick={() => openReinspect(v)}
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Check size={10} /> 재검 완료
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-slate-500">{employeeOf(v.employeeId)?.name ?? '-'}</td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PARKING_STATUS_STYLE[v.status].pill}`}>
                      {PARKING_STATUS_LABEL[v.status]}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-slate-400">{dayjs(v.updatedAt).format('M/D HH:mm')}</td>
                  {(
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => { setEditing(v); setPresetPosition(null); setFormOpen(true); }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">수정</button>
                        <button onClick={() => void confirmDanger('이 위치의 차량 기록을 삭제할까요?').then(ok => { if (ok) void deleteParkingVehicle(v.id); })} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
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

      {importOpen && (
        <SheetImportModal onClose={() => setImportOpen(false)} onImported={() => void refresh()} />
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
