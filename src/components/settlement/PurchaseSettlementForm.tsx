import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { purchaseGrandTotal, purchasePrepTotal, type PurchaseSettlement, type SettlementStatus } from '../../types';
import { api } from '../../lib/api';
import { manwonToWon, wonToManwon } from '../../lib/money';
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
  const [transferFee, setTransferFee] = useState(editing ? wonToManwon(editing.transferFee) : '0');
  const [purchasePrice, setPurchasePrice] = useState(editing ? wonToManwon(editing.purchasePrice) : '');
  const [brokerFee, setBrokerFee] = useState(editing ? wonToManwon(editing.brokerFee) : '0');
  const [prepRows, setPrepRows] = useState<PrepCostRow[]>(() =>
    (editing?.prepCosts ?? []).map(c => ({
      kind: c.kind,
      vendor: c.vendor,
      amount: wonToManwon(c.amount),
      memo: c.memo,
    })),
  );
  // 업체·카테고리 자동완성 목록 — 지금까지 쓴 이름을 서버에서 받아온다.
  const [vendors, setVendors] = useState<Record<string, string[]>>({});
  const [settlementAmount, setSettlementAmount] = useState(editing ? wonToManwon(editing.settlementAmount) : '');
  const [newCarName, setNewCarName] = useState(editing?.newCarName ?? '');
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
    .map(r => ({ kind: r.kind, vendor: r.vendor.trim(), amount: manwonToWon(r.amount), memo: r.memo.trim() }))
    .filter(r => r.amount > 0);

  const nums = {
    transferFee: manwonToWon(transferFee),
    purchasePrice: manwonToWon(purchasePrice),
    brokerFee: manwonToWon(brokerFee),
  };
  const prepTotal = purchasePrepTotal(prepCosts);
  const grandTotal = purchaseGrandTotal(nums.purchasePrice, prepTotal);

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
      prepCosts,
      // 비워두면 매입+상품화총비용을 그대로 정산금액으로 잡는다
      settlementAmount: settlementAmount === '' ? grandTotal : manwonToWon(settlementAmount),
      newCarName: newCarName.trim(),
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
        <p className="mt-1 text-xs text-slate-400">금액 단위는 만원입니다. 천원 단위는 소수로 적습니다 — <b>3.5 = 35,000원</b></p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DateField label="일자" value={date} onChange={setDate} />
          <TextField label="차량명" value={vehicleName} onChange={setVehicleName} placeholder="그랜저 GN7" required />
          <TextField label="차량번호" value={vehicleNumber} onChange={setVehicleNumber} placeholder="12가3456" required />
          <EmployeeField label="담당자" value={employeeId} onChange={setEmployeeId} employees={state.employees} />

          <MoneyField label="이전비 + 추가이전비" value={transferFee} onChange={setTransferFee} decimal className="col-span-2 sm:col-span-1" />
          <MoneyField label="매입가" value={purchasePrice} onChange={setPurchasePrice} decimal required />
          <MoneyField label="구전" value={brokerFee} onChange={setBrokerFee} decimal />
        </div>

        <div className="mt-4">
          <PrepCostEditor rows={prepRows} onChange={setPrepRows} vendors={vendors} />
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          <CalcRow label="상품화총비용" formula="광택·세차 + 판금·덴트 + 성능비 + 탁송비 + 수리비 + 진단비 (이전비·구전 제외)" value={prepTotal} won />
          <CalcRow label="매입 + 상품화총비용" formula="매입가 + 상품화총비용" value={grandTotal} won strong />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyField label="정산금액" value={settlementAmount} onChange={setSettlementAmount} decimal />
          <TextField label="신차이름" value={newCarName} onChange={setNewCarName} placeholder="교체 신차 (없으면 비움)" />
          <StatusField value={status} onChange={v => setStatus(v as SettlementStatus)} />
          <TextField label="메모" value={memo} onChange={setMemo} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">정산금액을 비워두면 위의 매입+상품화총비용({wonToManwon(grandTotal)}만원)이 자동으로 들어갑니다.</p>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
