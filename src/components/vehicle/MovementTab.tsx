import { useMemo, useState, type FormEvent } from 'react';
import { Car, Plus, Trash2 } from 'lucide-react';
import {
  PLATE_MESSAGE,
  VEHICLE_LIST_LABEL,
  VEHICLE_LIST_ORDER,
  VEHICLE_LIST_STYLE,
  isValidPlate,
  normalizePlate,
  vehicleListOf,
  type VehicleListKey,
} from '../../lib/vehicle';
import type { ManagedVehicle } from '../../types';
import type { VehiclesApi } from './useVehicles';
import { confirmDanger } from '../../lib/alert';

export default function MovementTab({ api }: { api: VehiclesApi }) {
  const { vehicles, addVehicle, toggleFlag, removeVehicle } = api;

  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [filter, setFilter] = useState<VehicleListKey | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  // 리스트별 개수는 필터 칩에 그대로 쓴다.
  const counts = useMemo(() => {
    const base: Record<VehicleListKey, number> = { WAITING_PREP: 0, AD_PENDING: 0, MOVABLE: 0, BLOCKED: 0 };
    for (const v of vehicles) base[vehicleListOf(v)] += 1;
    return base;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return vehicles
      .filter(v => filter === 'ALL' || vehicleListOf(v) === filter)
      .filter(v => !q || v.vehicleNumber.includes(q) || v.vehicleModel.includes(q));
  }, [vehicles, filter, query]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const vehicleNumber = normalizePlate(plate);
    const vehicleModel = model.trim();

    if (!isValidPlate(vehicleNumber)) {
      setFormError(PLATE_MESSAGE.format);
      return;
    }
    if (vehicles.some(v => v.vehicleNumber === vehicleNumber)) {
      setFormError(PLATE_MESSAGE.duplicate);
      return;
    }
    if (!vehicleModel) {
      setFormError('차량명을 입력해 주세요.');
      return;
    }

    setBusy(true);
    const failed = await addVehicle(vehicleNumber, vehicleModel);
    setBusy(false);
    setFormError(failed);
    if (!failed) {
      setPlate('');
      setModel('');
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">매입 차량 등록</p>
        <div className="flex flex-wrap items-start gap-2">
          <div>
            <input
              value={plate}
              onChange={e => { setPlate(e.target.value); setFormError(null); }}
              placeholder="전체 차량번호 입력"
              className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <p className="mt-1 text-[11px] text-slate-400">12가3456 / 123가4567 형식</p>
          </div>
          <input
            value={model}
            onChange={e => { setModel(e.target.value); setFormError(null); }}
            placeholder="차량명 입력"
            className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={15} /> 등록
          </button>
        </div>
        {formError && <p className="mt-2 text-xs font-medium text-red-500">{formError}</p>}
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            filter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
          }`}
        >
          전체 {vehicles.length}
        </button>
        {VEHICLE_LIST_ORDER.map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            {VEHICLE_LIST_LABEL[key]} {counts[key]}
          </button>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호·차량명 검색"
          className="ml-auto w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Car size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">
            {vehicles.length === 0 ? '등록된 차량이 없습니다. 위에서 매입 차량을 등록해 주세요.' : '조건에 맞는 차량이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">차량번호</th>
                <th className="px-4 py-3 font-medium">차량명</th>
                <th className="px-3 py-3 text-center font-medium">상품화</th>
                <th className="px-3 py-3 text-center font-medium">광고 완료</th>
                <th className="px-3 py-3 text-center font-medium">외부 이동 금지</th>
                <th className="px-4 py-3 font-medium">분류</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <VehicleRow key={v.id} vehicle={v} onToggle={toggleFlag} onRemove={removeVehicle} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  vehicle: ManagedVehicle;
  onToggle: VehiclesApi['toggleFlag'];
  onRemove: VehiclesApi['removeVehicle'];
}

function VehicleRow({ vehicle, onToggle, onRemove }: RowProps) {
  const list = vehicleListOf(vehicle);

  const confirmRemove = async () => {
    if (await confirmDanger(`${vehicle.vehicleNumber} 차량을 목록에서 지울까요?`, '등록된 주유·배터리 이력도 함께 삭제됩니다.')) {
      void onRemove(vehicle.id);
    }
  };

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{vehicle.vehicleNumber}</td>
      <td className="px-4 py-3 text-slate-600">{vehicle.vehicleModel}</td>

      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={vehicle.prepared}
          onChange={e => onToggle(vehicle, { prepared: e.target.checked })}
          className="size-4 accent-indigo-600"
          aria-label="상품화"
        />
      </td>

      <td className="px-3 py-3 text-center">
        {/* 상품화 전에는 광고완료를 켤 수 없다 */}
        <input
          type="checkbox"
          checked={vehicle.advertised}
          disabled={!vehicle.prepared}
          onChange={e => onToggle(vehicle, { advertised: e.target.checked })}
          className="size-4 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="광고 완료"
          title={vehicle.prepared ? undefined : '상품화를 먼저 체크해 주세요.'}
        />
      </td>

      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={vehicle.moveBlocked}
          onChange={e => onToggle(vehicle, { moveBlocked: e.target.checked })}
          className="size-4 accent-red-500"
          aria-label="외부 이동 금지"
        />
      </td>

      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VEHICLE_LIST_STYLE[list]}`}>
          {VEHICLE_LIST_LABEL[list]}
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        <button onClick={() => void confirmRemove()} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="삭제">
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
