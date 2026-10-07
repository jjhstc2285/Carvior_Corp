import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import {
  ACQUISITION_TAX_RATE,
  BROKER_FEE_PAYOUTS,
  BROKER_FEE_PAYOUT_LABEL,
  EXTRA_FEE_RATE,
  acquisitionTax,
  dealerTransferFee,
  extraTransferFee,
  purchaseGrandTotal,
  purchasePrepTotal,
  saleProfit,
  transferFeeOf,
  type BrokerFeePayout,
  type PurchaseSettlement,
  type SettlementStatus,
  type Vendor,
} from '../../types';
import { api } from '../../lib/api';
import { estimateCost } from '../../lib/inspectionCheck';
import { moneyToNumber, percentLabel, withCommas } from '../../lib/money';
import PrepCostEditor, { type PrepCostRow } from './PrepCostEditor';
import ContractPhotos from './ContractPhotos';
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
  const [purchasePrice, setPurchasePrice] = useState(editing ? String(editing.purchasePrice) : '');

  /**
   * 이전비는 매입가로 정해진다 — 상사 이전비(매입가의 1%) + 추가이전비(취득세의 15%).
   *
   * 적는 칸이 아니라 계산 결과다. 예전에는 손으로 적었고 알선 정산에서 가져다 넣기도
   * 했는데, 값이 두 군데서 오니 어느 쪽이 맞는지 알 수 없었다.
   */
  const transferFee = transferFeeOf(moneyToNumber(purchasePrice));
  const [brokerFee, setBrokerFee] = useState(editing ? String(editing.brokerFee) : '0');
  /** 헤이딜러·엔카 경매장에서 사왔으면 그쪽에 낸 수수료 — 직접 사온 차는 0이다 */
  const [platformFee, setPlatformFee] = useState(editing ? String(editing.platformFee ?? 0) : '0');
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
  /* 거래처 대장 — 늘 쓰는 업체를 눌러 넣고 번호를 바로 본다 */
  const [contacts, setContacts] = useState<Vendor[]>([]);
  /*
    정산금액은 총비용을 따라간다.

    새로 만들 때는 비워 두면 총비용이 들어갔는데, 고칠 때는 저장된 숫자가 칸에 박혀 있었다.
    매입팀이 올린 건을 계약팀이 열어 상품화 비용을 적으면 총비용만 오르고 정산금액은 옛날
    숫자 그대로 남는다 — 적었는데 반영이 안 된다는 말이 여기서 나왔다.

    그래서 '따라가는 중'을 기본으로 둔다. 칸에 직접 숫자를 넣으면 그때부터 손으로 잡은
    값으로 보고 건드리지 않는다(청구서가 다르게 온 건은 그게 맞다). 예전에 손으로 잡아 둔
    건은 열었을 때도 손으로 잡은 값으로 본다 — 저장된 값이 그때의 총비용과 다르면 그렇다.
  */
  const [settlementAmount, setSettlementAmount] = useState(editing ? String(editing.settlementAmount) : '');
  const [amountManual, setAmountManual] = useState(
    !!editing && editing.settlementAmount !== (editing.grandTotal ?? editing.settlementAmount),
  );
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);

  /** 계약팀 — 지금 적힌 담당자가 계약팀이 아니어도 그 사람은 남긴다 */
  const contractTeam = useMemo(
    () => state.employees.filter(e => e.department === '계약팀' || e.id === employeeId),
    [state.employees, employeeId],
  );
  const [status, setStatus] = useState<SettlementStatus>(editing?.status ?? 'IN_PROGRESS');
  /** 계약서 사진 — 줄바꿈으로 이어 담은 경로 */
  const [contractPhotos, setContractPhotos] = useState(editing?.contractPhotos ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Vendor[]>('/vendors')
      .then(setContacts)
      // 대장을 못 불러와도 비용은 적어야 한다 — 추천만 안 뜬다
      .catch(() => {});
    void api<Record<string, string[]>>('/settlements/purchase/vendors')
      .then(setVendors)
      .catch(() => {
        // 자동완성은 부가 기능이라 실패해도 조용히 넘긴다 — 직접 치면 된다.
      });
  }, []);

  // 0원짜리 줄은 아직 안 적은 칸이라 합계에서 뺀다(서버도 같은 규칙으로 버린다).
  /*
    그 차를 매입할 때 센 판·덴트 개수.

    차 앞에서 센 값이 매입 관리에 적혀 있는데, 정산에서 판금집 이름을 적을 때 금액을
    또 손으로 계산해 넣고 있었다. 이름만 적으면 개수 × 단가로 채워 준다 —
    채우기만 하고, 실제로 청구된 금액이 다르면 그 위에 덮어 적으면 된다.
  */
  const [check, setCheck] = useState<{
    panelCount: number;
    dentCount: number;
    dentLargeCount: number;
    wheelCount: number;
    prepVendor: string;
    imported: boolean;
  } | null>(null);
  useEffect(() => {
    const plate = vehicleNumber.trim();
    if (!plate) {
      setCheck(null);
      return;
    }
    let alive = true;
    void api<typeof check>(`/purchase-intake/check?plate=${encodeURIComponent(plate)}`)
      .then(r => alive && setCheck(r))
      // 못 읽어도 손으로 적으면 된다
      .catch(() => alive && setCheck(null));
    return () => {
      alive = false;
    };
  }, [vehicleNumber]);

  /*
    검차에서 센 판·덴트·휠이 있으면 판금·덴트 줄을 미리 깔아 준다.

    이름을 적어야 채워지게 두었더니 아무도 안 적어서 값이 안 올라왔다 — 정산을 열면
    이미 채워져 있어야 쓴다. 사람이 적어둔 줄이 있으면 건드리지 않는다.
  */
  useEffect(() => {
    if (!check) return;
    const cost = estimateCost({
      panelCount: check.panelCount ?? 0,
      dentCount: check.dentCount ?? 0,
      dentLargeCount: check.dentLargeCount ?? 0,
      wheelCount: check.wheelCount ?? 0,
      vendor: check.prepVendor ?? '',
      imported: check.imported ?? false,
      bulk: false,
    });
    if (cost.total <= 0) return;

    setPrepRows(prev => {
      const has = prev.some(r => r.kind === 'DENT' && (r.vendor.trim() || moneyToNumber(r.amount) > 0));
      if (has) return prev;
      const vendor = check.prepVendor ? `${check.prepVendor}판집` : '';
      const memo = [
        (check.panelCount ?? 0) > 0 ? `판 ${check.panelCount}곳` : '',
        (check.dentCount ?? 0) > 0 ? `덴트 ${check.dentCount}곳` : '',
        (check.wheelCount ?? 0) > 0 ? `휠 ${check.wheelCount}짝` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const blank = prev.findIndex(r => r.kind === 'DENT' && !r.vendor.trim() && !r.amount.trim());
      const row = { kind: 'DENT' as const, vendor, amount: String(cost.total), memo: `검차 ${memo}` };
      return blank >= 0 ? prev.map((r, i) => (i === blank ? row : r)) : [...prev, row];
    });
  }, [check]);

  const prepCosts = prepRows
    .map(r => ({ kind: r.kind, vendor: r.vendor.trim(), amount: moneyToNumber(r.amount), memo: r.memo.trim() }))
    .filter(r => r.amount > 0);

  const nums = {
    transferFee,
    purchasePrice: moneyToNumber(purchasePrice),
    brokerFee: moneyToNumber(brokerFee),
    platformFee: moneyToNumber(platformFee),
    salePrice: moneyToNumber(salePrice),
    cashCommission: moneyToNumber(cashCommission),
    installmentFee: moneyToNumber(installmentFee),
    insuranceFee: moneyToNumber(insuranceFee),
    dealerLoanFee: moneyToNumber(dealerLoanFee),
  };
  const prepTotal = purchasePrepTotal(prepCosts);
  const grandTotal = purchaseGrandTotal(nums.purchasePrice, prepTotal, nums.transferFee, nums.brokerFee, nums.platformFee);
  // 폼에서는 차량비용(주유·배터리)을 모른다 — 표에서는 그것까지 더한 총합계로 낸다.
  const profit = saleProfit(nums.salePrice, grandTotal);

  /* 보내고 나서 닫는다 — 안 기다리고 닫으면 실패해도 저장된 것처럼 보인다 */
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleName.trim() || !vehicleNumber.trim() || !purchasePrice) {
      setError('차량명, 차량번호, 매입가는 필수 입력입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertPurchaseSettlement({
        id: editing?.id,
        date,
        vehicleName: vehicleName.trim(),
        vehicleNumber: vehicleNumber.trim(),
        ...nums,
        brokerFeePayout,
        platformFee: nums.platformFee,
        contractPhotos,
        prepCosts,
          // 손으로 잡지 않았으면 총비용이 그대로 정산금액이다
        settlementAmount: amountManual && settlementAmount !== '' ? moneyToNumber(settlementAmount) : grandTotal,
        employeeId,
        status,
        memo: memo.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '매입 정산을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
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
          {/*
            담당자는 계약팀에서 고른다.

            매입 정산을 적는 건 계약팀이다. 전 직원을 늘어놓으면 스무 명 넘는 목록에서
            네 명을 찾아야 하고, 엉뚱한 사람 앞으로 정산이 가도 바로 안 보인다.

            이미 적힌 사람이 계약팀이 아니면(팀을 옮겼거나 예전 건) 그 사람은 남겨 둔다 —
            목록에서 사라지면 저장할 때 담당자가 바뀐다.
          */}
          <EmployeeField label="담당자" value={employeeId} onChange={setEmployeeId} employees={contractTeam} />

          <MoneyField label="매입가" value={purchasePrice} onChange={setPurchasePrice} required />
          <MoneyField label="구전" value={brokerFee} onChange={setBrokerFee} />
          {/* 헤이딜러·엔카 경매장에서 사오면 그쪽에 수수료를 낸다 — 직접 사온 차는 비워둔다 */}
          <MoneyField label="플랫폼 수수료" value={platformFee} onChange={setPlatformFee} />
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
          <PrepCostEditor rows={prepRows} onChange={setPrepRows} vendors={vendors} contacts={contacts} check={check} />
        </div>

        <div className="mt-4">
          <ContractPhotos value={contractPhotos} onChange={setContractPhotos} />
        </div>

        {/* 판 값. 산 값과 한 화면에 있어야 그 차에서 얼마가 남았는지가 보인다. */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">판매 (판매완료된 뒤에 적습니다)</p>
          <p className="mb-2 text-[11px] text-slate-400">
            차량판매가는 알선 정산에 <b>실차주입금</b>을 적으면 그때 따라옵니다(안 적혀 있으면
            <b>총 진행 판매금액</b>을 씁니다) — 여기서 고쳐도
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
          {/* 이전비는 적는 칸이 아니라 계산 결과다 — 무엇이 더해졌는지 펼쳐 보여준다 */}
          <CalcRow
            label="이전비 + 추가이전비"
            formula="상사 이전비 + 추가이전비 — 매입가로 정해집니다"
            value={transferFee}
          />
          <CalcRow
            label="└ 상사 이전비"
            formula="매입가의 1% (500만원 이하 5만원 · 3000만원 이상 30만원)"
            value={dealerTransferFee(nums.purchasePrice)}
          />
          <CalcRow
            label="└ 추가이전비"
            formula={`취득세(매입가의 ${percentLabel(ACQUISITION_TAX_RATE)}%)가 200만원을 넘으면 그 ${percentLabel(EXTRA_FEE_RATE)}% — 취득세 ${withCommas(acquisitionTax(nums.purchasePrice))}원`}
            value={extraTransferFee(nums.purchasePrice)}
          />
          <CalcRow label="상품화총비용" formula="광택·세차 + 판금·덴트 + 성능비 + 탁송비 + 수리비 + 진단비 (이전비·구전 제외)" value={prepTotal} />
          <CalcRow label="총비용" formula="매입가 + 이전비 + 구전 + 상품화총비용" value={grandTotal} strong />
          <CalcRow
            label="판매수익"
            formula="차량판매가 − 총비용 (주유·배터리 같은 차량비용은 표에서 더합니다 · 세금은 상사 정산에서 이미 떼고 들어옵니다)"
            value={profit}
            strong
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyField
            label="정산금액"
            value={amountManual ? settlementAmount : String(grandTotal)}
            onChange={v => {
              setAmountManual(true);
              setSettlementAmount(v);
            }}
          />
          <StatusField value={status} onChange={v => setStatus(v as SettlementStatus)} />
          <TextField label="메모" value={memo} onChange={setMemo} />
        </div>
        {amountManual ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            정산금액을 직접 넣었습니다. 총비용은 {withCommas(grandTotal)}원입니다.
            <button
              onClick={() => setAmountManual(false)}
              className="rounded border border-slate-200 px-1.5 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50"
            >
              총비용으로 되돌리기
            </button>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate-400">
            <span className="mr-1 rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">자동</span>
            위의 총비용을 그대로 따라갑니다 — 상품화 비용을 적으면 함께 올라갑니다. 칸에 숫자를 넣으면 그 값으로 고정됩니다.
          </p>
        )}

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
