import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { netProfit, type SettlementRecord, type SettlementStatus } from '../../types';
import dayjs from 'dayjs';

interface Props {
  editing: SettlementRecord | null;
  defaultEmployeeId: string;
  onClose: () => void;
}

export default function SettlementForm({ editing, defaultEmployeeId, onClose }: Props) {
  const { state, upsertSettlement } = useStore();
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [vehicleInfo, setVehicleInfo] = useState(editing?.vehicleInfo ?? '');
  const [purchaseCost, setPurchaseCost] = useState(editing?.purchaseCost?.toString() ?? '');
  const [prepCost, setPrepCost] = useState(editing?.prepCost?.toString() ?? '0');
  const [saleAmount, setSaleAmount] = useState(editing?.saleAmount?.toString() ?? '');
  const [feeAmount, setFeeAmount] = useState(editing?.feeAmount?.toString() ?? '0');
  const [status, setStatus] = useState<SettlementStatus>(editing?.status ?? 'IN_PROGRESS');
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  const nums = {
    purchaseCost: Number(purchaseCost) || 0,
    prepCost: Number(prepCost) || 0,
    saleAmount: Number(saleAmount) || 0,
    feeAmount: Number(feeAmount) || 0,
  };
  const profit = netProfit(nums);

  const handleSubmit = () => {
    if (!vehicleInfo.trim() || !purchaseCost || !saleAmount) {
      setError('차량정보, 매입가, 판매금액은 필수 입력입니다.');
      return;
    }
    upsertSettlement({
      id: editing?.id,
      employeeId,
      vehicleInfo: vehicleInfo.trim(),
      ...nums,
      status,
      date,
      memo,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '정산 내역 수정' : '정산 내역 추가'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량정보 (차량명/차량번호)</label>
            <input value={vehicleInfo} onChange={e => setVehicleInfo(e.target.value)} placeholder="예: 아반떼 CN7 (12가3456)"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">담당자</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">정산 기준일</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">매입가 (만원) *</label>
            <input type="number" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상품화 비용 (만원)</label>
            <input type="number" value={prepCost} onChange={e => setPrepCost(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">판매금액 (만원) *</label>
            <input type="number" value={saleAmount} onChange={e => setSaleAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">수수료 (만원)</label>
            <input type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">정산 상태</label>
            <select value={status} onChange={e => setStatus(e.target.value as SettlementStatus)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="IN_PROGRESS">진행중</option>
              <option value="COMPLETED">정산완료</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">메모</label>
            <input value={memo} onChange={e => setMemo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-indigo-50 px-3.5 py-2.5">
          <span className="text-sm font-medium text-indigo-700">순이익 자동계산</span>
          <span className={`text-lg font-bold ${profit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{profit.toLocaleString()}만원</span>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
