import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import {
  BROKER_FEE_PAYOUTS,
  BROKER_FEE_PAYOUT_LABEL,
  purchaseGrandTotal,
  purchasePrepTotal,
  saleProfit,
  type BrokerFeePayout,
  type PurchaseSettlement,
  type SettlementStatus,
} from '../../types';
import { api } from '../../lib/api';
import { moneyToNumber, withCommas } from '../../lib/money';
import PrepCostEditor, { type PrepCostRow } from './PrepCostEditor';
import { CalcRow, DateField, EmployeeField, MoneyField, StatusField, TextField } from './fields';

interface Props {
  editing: PurchaseSettlement | null;
  defaultEmployeeId: string;
  onClose: () => void;
}

export default function PurchaseSettlementForm({ editing, defaultEmployeeId, onClose }: Props) {
  const { state, upsertPurchaseSettlement } = useStore();
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [transferFee, setTransferFee] = useState(editing ? String(editing.transferFee) : '0');
  const [purchasePrice, setPurchasePrice] = useState(editing ? String(editing.purchasePrice) : '');
  const [brokerFee, setBrokerFee] = useState(editing ? String(editing.brokerFee) : '0');
  const [brokerFeePayout, setBrokerFeePayout] = useState<BrokerFeePayout>(editing?.brokerFeePayout ?? 'CASH');
  // 판 값 — 상담이 판매완료로 끝나면 채운다. 아직 안 팔았으면 비워둔다.
  const [salePrice, setSalePrice] = useState(editing ? String(editing.salePrice) : '');
  const [cashCommission, setCashCommission] = useState(editing ? String(editing.cashCommission) : '0');
  const [installmentFee, setInstallmentFee] = useState(editing ? String(editing.installmentFee) : '0');
  const [insuranceFee, setInsuranceFee] = useState(editing ? String(editing.insuranceFee) : '0');
  const [dealerLoanFee, setDealerLoanFee] = useState(editing ? String(editing.dealerLoanFee) : '0');
  const [prepRows, setPrepRows] = useState<PrepCostRow[]>(() =>
    (editing?.prepCosts ?? []).map(c => ({
      kind: c.kind,
      vendor: c.vendor,
      amount: String(c.amount),
      memo: c.memo,
    })),
  );
  // 업체·카테고리 자동완성 목록 — 지금까지 쓴 이름을 서버에서 받아온다.
  const [vendors, setVendors] = useState<Record<string, string[]>>({});
  const [settlementAmount, setSettlementAmount] = useState(editing ? String(editing.settlementAmount) : '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  const [status, setStatus] = useState<SettlementStatus>(editing?.status ?? 'IN_PROGRESS');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Record<string, string[]>>('/settlements/purchase/vendors')
      .then(setVendors)
      .catch(() => {
        // 자동완성은 부가 기능이라 실패해도 조용히 넘긴다 — 직접 치면 된다.
      });
  }, []);

  // 0원짜리 줄은 아직 안 적은 칸이라 합계에서 뺀다(서버도 같은 규칙으로 버린다).
  const prepCosts = prepRows
    .map(r => ({ kind: r.kind, vendor: r.vendor.trim(), amount: moneyToNumber(r.amount), memo: r.memo.trim() }))
    .filter(r => r.amount > 0);

  const nums = {
    transferFee: moneyToNumber(transferFee),
    purchasePrice: moneyToNumber(purchasePrice),
    brokerFee: moneyToNumber(brokerFee),
    salePrice: moneyToNumber(salePrice),
    cashCommission: moneyToNumber(cashCommission),
    installmentFee: moneyToNumber(installmentFee),
    insuranceFee: moneyToNumber(insuranceFee),
    dealerLoanFee: moneyToNumber(dealerLoanFee),
  };
  const prepTotal = purchasePrepTotal(prepCosts);
  const grandTotal = purchaseGrandTotal(nums.purchasePrice, prepTotal, nums.transferFee, nums.brokerFee);
  // 폼에서는 차량비용(주유·배터리)을 모른다 — 표에서는 그것까지 더한 총합계로 낸다.
  const profit = saleProfit(nums.salePrice, grandTotal);

  const handleSubmit = () => {
    if (!vehicleName.trim() || !vehicleNumber.trim() || !purchasePrice) {
      setError('차량명, 차량번호, 매입가는 필수 입력입니다.');
      return;
    }
    upsertPurchaseSettlement({
      id: editing?.id,
      date,
      vehicleName: vehicleName.trim(),
      vehicleNumber: vehicleNumber.trim(),
      ...nums,
      brokerFeePayout,
      prepCosts,
      // 비워두면 매입+상품화총비용을 그대로 정산금액으로 잡는다
      settlementAmount: settlementAmount === '' ? grandTotal : moneyToNumber(settlementAmount),
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
          <h3 className="text-base font-bold text-slate-800">{editing ? '매입 정산 수정' : '매입 정산 추가'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">금액은 <b>원</b>으로 적습니다 — 35000 이면 35,000원입니다.</p>
        <p className="mt-0.5 text-xs text-slate-400">구전은 방식마다 나가는 금액이 다릅니다 — 현금 90 / 3.3% 88 / 13.3% 75 처럼 <b>실제로 나간 금액</b>을 적습니다.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DateField label="정산일자" value={date} onChange={setDate} />
          <TextField label="차량명" value={vehicleName} onChange={setVehicleName} placeholder="그랜저 GN7" required />
          <TextField label="차량번호" value={vehicleNumber} onChange={setVehicleNumber} placeholder="12가3456" required />
          <EmployeeField label="담당자" value={employeeId} onChange={setEmployeeId} employees={state.employees} />

          <MoneyField label="이전비 + 추가이전비" value={transferFee} onChange={setTransferFee} className="col-span-2 sm:col-span-1" />
          <MoneyField label="매입가" value={purchasePrice} onChange={setPurchasePrice} required />
          <MoneyField label="구전" value={brokerFee} onChange={setBrokerFee} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">구전 지급방식</label>
            <select
              value={brokerFeePayout}
              onChange={e => setBrokerFeePayout(e.target.value as BrokerFeePayout)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {BROKER_FEE_PAYOUTS.map(p => (
                <option key={p} value={p}>{BROKER_FEE_PAYOUT_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <PrepCostEditor rows={prepRows} onChange={setPrepRows} vendors={vendors} />
        </div>

        {/* 판 값. 산 값과 한 화면에 있어야 그 차에서 얼마가 남았는지가 보인다. */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">판매 (판매완료된 뒤에 적습니다)</p>
          <p className="mb-2 text-[11px] text-slate-400">
            차량판매가는 알선 정산에 <b>실차주입금</b>을 적으면 그때 따라옵니다 — 여기서 고쳐도
            알선 정산을 다시 저장하면 그 값으로 돌아갑니다.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MoneyField label="차량판매가" value={salePrice} onChange={setSalePrice} />
            <MoneyField label="현금 수수료" value={cashCommission} onChange={setCashCommission} />
            <MoneyField label="할부 피" value={installmentFee} onChange={setInstallmentFee} />
            <MoneyField label="보험 피" value={insuranceFee} onChange={setInsuranceFee} />
            <MoneyField label="차대금업" value={dealerLoanFee} onChange={setDealerLoanFee} />
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          <CalcRow label="상품화총비용" formula="광택·세차 + 판금·덴트 + 성능비 + 탁송비 + 수리비 + 진단비 (이전비·구전 제외)" value={prepTotal} />
          <CalcRow label="총비용" formula="매입가 + 이전비 + 구전 + 상품화총비용" value={grandTotal} strong />
          <CalcRow label="판매수익" formula="차량판매가 − 총비용 (주유·배터리 같은 차량비용은 표에서 더합니다)" value={profit} strong />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyField label="정산금액" value={settlementAmount} onChange={setSettlementAmount} />
          <StatusField value={status} onChange={v => setStatus(v as SettlementStatus)} />
          <TextField label="메모" value={memo} onChange={setMemo} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">정산금액을 비워두면 위의 총비용({withCommas(grandTotal)}원)이 자동으로 들어갑니다.</p>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
