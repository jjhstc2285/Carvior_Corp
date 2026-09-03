import { useState } from 'react';
import { X } from 'lucide-react';
import { CAPITAL_LIMIT_COLUMNS, type PurchaseListItem } from '../../types';
import { moneyToNumber, toMoneyValue, withCommas } from '../../lib/money';
import type { PurchaseListInput } from './usePurchaseList';

interface Props {
  editing: PurchaseListItem | null;
  /** 담당자 선택박스에 채울 이름들 — 직원 명단에서 온다 */
  managerNames: string[];
  onSave: (input: PurchaseListInput) => Promise<string | null>;
  onClose: () => void;
}

/** 캐피탈사 이름은 자주 쓰는 것만 골라 쓰고, 그 외에는 직접 입력한다. */

const LOAN_STATUS_OPTIONS = ['', '입금완료', '신청중', '심사중', '거절', '상환완료'];

export default function PurchaseListForm({ editing, managerNames, onSave, onClose }: Props) {
  const [seq, setSeq] = useState(editing ? String(editing.seq) : '');
  const [date, setDate] = useState(editing?.date ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? '');
  const [managerName, setManagerName] = useState(editing?.managerName ?? '');
  const [askingPrice, setAskingPrice] = useState(withCommas(editing?.askingPrice ?? 0));
  const [modelYear, setModelYear] = useState(editing?.modelYear ?? '');
  const [mileage, setMileage] = useState(withCommas(editing?.mileage ?? 0));


  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAPITAL_LIMIT_COLUMNS.map(c => [c.key, withCommas(editing?.[c.key] ?? 0)])),
  );

  const [note, setNote] = useState(editing?.note ?? '');
  const [loanDate, setLoanDate] = useState(editing?.loanDate ?? '');
  const [interestRate, setInterestRate] = useState(editing?.interestRate != null ? String(editing.interestRate) : '');
  const [loanStatus, setLoanStatus] = useState(editing?.loanStatus ?? '');
  const [repaidDate, setRepaidDate] = useState(editing?.repaidDate ?? '');
  const [repaymentAmount, setRepaymentAmount] = useState(withCommas(editing?.repaymentAmount ?? 0));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleNumber.trim() || !vehicleName.trim()) {
      setError('차량번호와 차량명은 필수 입력입니다.');
      return;
    }

    setSaving(true);
    setError(null);
    const failed = await onSave({
      ...(seq.trim() ? { seq: Number(seq.replace(/[^\d]/g, '')) } : {}),
      date,
      vehicleNumber: vehicleNumber.trim(),
      vehicleName: vehicleName.trim(),
      managerName: managerName.trim(),
      askingPrice: moneyToNumber(askingPrice),
      modelYear: modelYear.trim(),
      mileage: moneyToNumber(mileage),
      // 차량 관리로 옮겼지만 예전에 적어둔 값은 건드리지 않는다.
      stockCapital: editing?.stockCapital ?? '',
      stockAmount: editing?.stockAmount ?? 0,
      ...Object.fromEntries(CAPITAL_LIMIT_COLUMNS.map(c => [c.key, moneyToNumber(limits[c.key] ?? '')])),
      note: note.trim(),
      loanDate,
      // 이율은 소수라 콤마 처리를 하지 않는다. 빈 칸은 아예 안 보낸다.
      ...(interestRate.trim() ? { interestRate: Number(interestRate) } : {}),
      repayDate: editing?.repayDate ?? '',
      loanStatus,
      repaidDate,
      repaymentAmount: moneyToNumber(repaymentAmount),
    });
    setSaving(false);

    if (failed) setError(failed);
    else onClose();
  };

  const money = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      value={withCommas(value)}
      onChange={e => set(toMoneyValue(e.target.value))}
      inputMode="numeric"
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
    />
  );

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
    </div>
  );

  const textInput = (value: string, set: (v: string) => void, placeholder = '') => (
    <input
      value={value}
      onChange={e => set(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
    />
  );

  const dateInput = (value: string, set: (v: string) => void) => (
    <input
      type="date"
      value={value}
      onChange={e => set(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '매입리스트 수정' : '매입리스트 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('순번', textInput(seq, setSeq, '비우면 자동'))}
          {field('날짜', dateInput(date, setDate))}
          {field('차량번호 *', textInput(vehicleNumber, setVehicleNumber, '06마0556'))}
          {field('차량명 *', textInput(vehicleName, setVehicleName, '스포티지'))}

          {field(
            '담당자',
            <input
              value={managerName}
              onChange={e => setManagerName(e.target.value)}
              list="purchase-list-managers"
              placeholder="예나"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />,
          )}
          {field('제시가(원)', money(askingPrice, setAskingPrice, '7,000,000'))}
          {field('년식', textInput(modelYear, setModelYear, '2016'))}
          {field('주행거리(km)', money(mileage, setMileage, '122,525'))}
        </div>

        <datalist id="purchase-list-managers">
          {managerNames.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {/*
          재고(할부사·금액)와 상환일자는 여기서 적지 않는다.
          같은 값을 두 곳에서 적으면 한쪽만 채워둔 차가 다른 쪽 월별 현황에서 빠진다.
          차 한 대씩 처리하는 화면인 차량 관리 → 재고금융으로 모았다.
          이 화면에 이미 적혀 있던 값은 그대로 남아 목록·엑셀에서 보인다.
        */}
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <b className="text-slate-700">재고(할부사·금액)와 상환일자는 차량 관리 → 재고금융 (제시)</b> 에서 넣습니다.
          한 곳에서만 적어야 월별 상환 현황에서 빠지는 차가 없습니다.
        </p>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">재고가능금액</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {CAPITAL_LIMIT_COLUMNS.map(c => (
            <div key={c.key}>
              <label className={`mb-1 block rounded px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-700 ${c.head}`}>
                {c.label}
                <span className="ml-1 font-normal text-slate-500">{c.quota}</span>
              </label>
              {money(limits[c.key] ?? '', v => setLimits(prev => ({ ...prev, [c.key]: v })), '0')}
            </div>
          ))}
        </div>

        <div className="mt-5">
          {field('비고 (특이사항)', textInput(note, setNote, '10년경과'))}
        </div>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">대출 · 상환</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field('대출일자', dateInput(loanDate, setLoanDate))}
          {field(
            '이율(%)',
            <input
              value={interestRate}
              onChange={e => setInterestRate(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              placeholder="5.9"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
            />,
          )}
          {field(
            '대출상황',
            <select
              value={loanStatus}
              onChange={e => setLoanStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            >
              {LOAN_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s || '-'}</option>
              ))}
            </select>,
          )}
          {field('상환날짜', dateInput(repaidDate, setRepaidDate))}
          {field('상환금액(원)', money(repaymentAmount, setRepaymentAmount, '8,000,000'))}
        </div>

        <p className="mt-2 text-[11px] text-slate-400">
          월별 현황은 <b>상환일자</b>가 그 달인 차들을 모아 상환금액을 더합니다.
        </p>

        {error && <p className="mt-3 text-xs font-medium text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
