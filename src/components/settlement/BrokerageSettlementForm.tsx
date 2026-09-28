import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import {
  brokerageProfit,
  brokerageSettlementAmount,
  brokerageSettlementRate,
  CONSULTATION_KIND_LABEL,
  type BrokerageSettlement,
  type ConsultationKind,
  type SettlementStatus,
} from '../../types';
import { CalcRow, DateField, EmployeeField, MoneyField, StatusField, TextField } from './fields';
import ContractPhotos from './ContractPhotos';

interface Props {
  /** 어느 표에서 열었는가 — 새로 적는 건 이 종류로 들어간다 */
  kind: ConsultationKind;
  editing: BrokerageSettlement | null;
  defaultEmployeeId: string;
  /** 판매완료된 상담에서 넘어올 때 — 차량과 입금액을 미리 채운다 */
  preset?: { vehicleNumber: string; vehicleName: string; totalSaleAmount: number; employeeId: string };
  onClose: () => void;
}

export default function BrokerageSettlementForm({ kind, editing, defaultEmployeeId, preset, onClose }: Props) {
  const kindLabel = CONSULTATION_KIND_LABEL[editing?.kind ?? kind];
  const { state, upsertBrokerageSettlement } = useStore();
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? preset?.vehicleNumber ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? preset?.vehicleName ?? '');
  // 상담에서 넘어왔으면 출고 때 적어둔 입금액을 판매금액으로 먼저 채운다(고치면 된다).
  const [totalSaleAmount, setTotalSaleAmount] = useState(
    editing?.totalSaleAmount?.toString() ?? (preset?.totalSaleAmount ? String(preset.totalSaleAmount) : ''),
  );
  const [ownerDeposit, setOwnerDeposit] = useState(editing?.ownerDeposit?.toString() ?? '');
  const [transferFee, setTransferFee] = useState(editing?.transferFee?.toString() ?? '0');
  const [transferFeeBalance, setTransferFeeBalance] = useState(editing?.transferFeeBalance?.toString() ?? '0');
  const [cashCommission, setCashCommission] = useState(editing?.cashCommission?.toString() ?? '0');
  const [installmentFee, setInstallmentFee] = useState(editing?.installmentFee?.toString() ?? '0');
  const [insuranceFee, setInsuranceFee] = useState(editing?.insuranceFee?.toString() ?? '0');
  const [etcCost, setEtcCost] = useState(editing?.etcCost?.toString() ?? '0');
  const [settlementAmount, setSettlementAmount] = useState(editing?.settlementAmount?.toString() ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? preset?.employeeId ?? defaultEmployeeId);
  const [status, setStatus] = useState<SettlementStatus>(editing?.status ?? 'IN_PROGRESS');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [contractPhotos, setContractPhotos] = useState(editing?.contractPhotos ?? '');
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
  // 구간 비율로 낸 값. 사람이 손으로 적으면 그 값이 우선이다 — 예외가 있다.
  const suggested = brokerageSettlementAmount(profit);
  const rate = brokerageSettlementRate(profit);

  /* 보내고 나서 닫는다 — 안 기다리고 닫으면 실패해도 저장된 것처럼 보인다 */
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleNumber.trim() || !vehicleName.trim() || !totalSaleAmount) {
      setError('차량번호, 차량명, 총 진행 판매금액은 필수 입력입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertBrokerageSettlement({
        id: editing?.id,
        date,
        vehicleNumber: vehicleNumber.trim(),
        vehicleName: vehicleName.trim(),
        ...nums,
        // 비워두면 구간 비율로 낸 값이 들어간다
        settlementAmount: settlementAmount === '' ? suggested : Number(settlementAmount) || 0,
        employeeId,
        status,
        memo: memo.trim(),
        contractPhotos,
        // 고칠 때는 원래 종류를 그대로 둔다 — 표를 옮기는 건 다른 일이다
        kind: editing?.kind ?? kind,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '정산 내역을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? `${kindLabel} 정산 수정` : `${kindLabel} 정산 추가`}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">금액 단위는 <b>원</b>입니다. 할부 피처럼 12,345원으로 떨어지는 값도 그대로 넣으세요.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DateField label="일자" value={date} onChange={setDate} />
          <TextField label="차량번호" value={vehicleNumber} onChange={setVehicleNumber} placeholder="12가3456" required />
          <TextField label="차량명" value={vehicleName} onChange={setVehicleName} placeholder="그랜저 GN7" required />
          <EmployeeField label="담당자" value={employeeId} onChange={setEmployeeId} employees={state.employees} />

          <MoneyField label="총 진행 판매금액" value={totalSaleAmount} onChange={setTotalSaleAmount} required />
          {/* 비워두면 총 진행 판매금액이 매입 정산의 차량판매가로 넘어간다 */}
          <MoneyField label="실차주입금" value={ownerDeposit} onChange={setOwnerDeposit} />
          <MoneyField label="이전비" value={transferFee} onChange={setTransferFee} />
          <MoneyField label="이전비 잔액" value={transferFeeBalance} onChange={setTransferFeeBalance} />

          <MoneyField label="현금 수수료" value={cashCommission} onChange={setCashCommission} />
          <MoneyField label="할부 피" value={installmentFee} onChange={setInstallmentFee} />
          <MoneyField label="보험 피" value={insuranceFee} onChange={setInsuranceFee} />
          <MoneyField label="차대금업" value={etcCost} onChange={setEtcCost} />
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          <CalcRow label="수익금" formula="현금 수수료 + 할부 피 + 보험 피 + 차대금업" value={profit} strong />
          <CalcRow
            label="정산 기준"
            formula={
              rate > 0
                ? `수익금의 ${Math.round(rate * 100)}% (100만원 이상 20% · 200만원 이상 30%)`
                : '수익금 100만원 미만 — 정액 5만원'
            }
            value={suggested}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyField
            label="정산받을금액"
            value={settlementAmount}
            onChange={setSettlementAmount}
          />
          <StatusField value={status} onChange={v => setStatus(v as SettlementStatus)} />
          <TextField label="메모" value={memo} onChange={setMemo} className="col-span-2" />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          정산받을금액을 비워두면 <b>{suggested.toLocaleString()}원</b>
          {rate > 0 ? ` (수익금의 ${Math.round(rate * 100)}%)` : ' (수익금 100만원 미만 — 정액)'}이 들어갑니다.
          예외가 있으면 직접 적으세요.
        </p>

        <div className="mt-3">
          <ContractPhotos value={contractPhotos} onChange={setContractPhotos} />
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
