import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { brokerageProfit, brokerageSaleProfit, type BrokerageSettlement, type SettlementStatus } from '../../types';
import { CalcRow, DateField, EmployeeField, MoneyField, StatusField, TextField } from './fields';

interface Props {
  editing: BrokerageSettlement | null;
  defaultEmployeeId: string;
  onClose: () => void;
}

export default function BrokerageSettlementForm({ editing, defaultEmployeeId, onClose }: Props) {
  const { state, upsertBrokerageSettlement } = useStore();
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? '');
  const [totalSaleAmount, setTotalSaleAmount] = useState(editing?.totalSaleAmount?.toString() ?? '');
  const [ownerDeposit, setOwnerDeposit] = useState(editing?.ownerDeposit?.toString() ?? '');
  const [transferFee, setTransferFee] = useState(editing?.transferFee?.toString() ?? '0');
  const [transferFeeBalance, setTransferFeeBalance] = useState(editing?.transferFeeBalance?.toString() ?? '0');
  const [cashCommission, setCashCommission] = useState(editing?.cashCommission?.toString() ?? '0');
  const [installmentFee, setInstallmentFee] = useState(editing?.installmentFee?.toString() ?? '0');
  const [insuranceFee, setInsuranceFee] = useState(editing?.insuranceFee?.toString() ?? '0');
  const [etcCost, setEtcCost] = useState(editing?.etcCost?.toString() ?? '0');
  const [settlementAmount, setSettlementAmount] = useState(editing?.settlementAmount?.toString() ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [status, setStatus] = useState<SettlementStatus>(editing?.status ?? 'inProgress');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  const nums = {
    totalSaleAmount: Number(totalSaleAmount) || 0,
    ownerDeposit: Number(ownerDeposit) || 0,
    transferFee: Number(transferFee) || 0,
    transferFeeBalance: Number(transferFeeBalance) || 0,
    cashCommission: Number(cashCommission) || 0,
    installmentFee: Number(installmentFee) || 0,
    insuranceFee: Number(insuranceFee) || 0,
    etcCost: Number(etcCost) || 0,
  };
  const profit = brokerageProfit(nums);
  const saleProfit = brokerageSaleProfit(nums);

  const handleSubmit = () => {
    if (!vehicleNumber.trim() || !vehicleName.trim() || !totalSaleAmount) {
      setError('차량번호, 차량명, 총 진행 판매금액은 필수 입력입니다.');
      return;
    }
    upsertBrokerageSettlement({
      id: editing?.id,
      date,
      vehicleNumber: vehicleNumber.trim(),
      vehicleName: vehicleName.trim(),
      ...nums,
      // 비워두면 판매 수익을 그대로 정산받을금액으로 잡는다
      settlementAmount: settlementAmount === '' ? saleProfit : Number(settlementAmount) || 0,
      employeeId,
      status,
      memo: memo.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '알선 정산 수정' : '알선 정산 추가'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">금액 단위는 만원입니다.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DateField label="일자" value={date} onChange={setDate} />
          <TextField label="차량번호" value={vehicleNumber} onChange={setVehicleNumber} placeholder="12가3456" required />
          <TextField label="차량명" value={vehicleName} onChange={setVehicleName} placeholder="그랜저 GN7" required />
          <EmployeeField label="담당자" value={employeeId} onChange={setEmployeeId} employees={state.employees} />

          <MoneyField label="총 진행 판매금액" value={totalSaleAmount} onChange={setTotalSaleAmount} required />
          <MoneyField label="실차주입금" value={ownerDeposit} onChange={setOwnerDeposit} />
          <MoneyField label="이전비" value={transferFee} onChange={setTransferFee} />
          <MoneyField label="이전비 잔액" value={transferFeeBalance} onChange={setTransferFeeBalance} />

          <MoneyField label="현금 수수료" value={cashCommission} onChange={setCashCommission} />
          <MoneyField label="할부 피" value={installmentFee} onChange={setInstallmentFee} />
          <MoneyField label="보험 피" value={insuranceFee} onChange={setInsuranceFee} />
          <MoneyField label="기타비용" value={etcCost} onChange={setEtcCost} />
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          <CalcRow label="수익금" formula="총 진행 판매금액 − 실차주입금" value={profit} />
          <CalcRow label="판매 수익" formula="수익금 + 이전비 잔액 + 현금 수수료 + 할부 피 + 보험 피 − 기타비용" value={saleProfit} strong />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyField label="정산받을금액" value={settlementAmount} onChange={setSettlementAmount} />
          <StatusField value={status} onChange={v => setStatus(v as SettlementStatus)} />
          <TextField label="메모" value={memo} onChange={setMemo} className="col-span-2" />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">정산받을금액을 비워두면 위의 판매 수익({saleProfit.toLocaleString()}만원)이 자동으로 들어갑니다.</p>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
