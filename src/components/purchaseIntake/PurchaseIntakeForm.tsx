import { useState } from 'react';
import dayjs from 'dayjs';
import { ClipboardPaste, X } from 'lucide-react';
import { isValidPlate, normalizePlate, PLATE_MESSAGE } from '../../lib/vehicle';
import type { PurchaseIntake } from '../../types';
import { moneyToNumber, toMoneyValue, withCommas } from '../../lib/money';
import { parseIntakeText } from './parseIntake';
import type { PurchaseIntakeInput } from './usePurchaseIntake';

interface Props {
  editing: PurchaseIntake | null;
  /**
   * 새로 등록할 때 미리 채워둘 값 — 수출 상담(카비오)에서 넘어올 때 쓴다.
   * 채워도 그대로 저장되진 않는다. 연식·연료처럼 저쪽에 없는 칸은 사람이 마저 채운다.
   */
  preset?: Partial<PurchaseIntakeInput>;
  /** 미리 채워 들어왔을 때 위에 띄울 안내 — 어디서 왔고 뭐가 비어 있는지 알려준다. */
  presetHint?: string;
  onSave: (input: PurchaseIntakeInput) => Promise<string | null>;
  onClose: () => void;
}

const FUEL_OPTIONS = ['가솔린', '디젤', 'LPG', '하이브리드', '전기', '가솔린+LPG'];

export default function PurchaseIntakeForm({ editing, preset, presetHint, onSave, onClose }: Props) {
  const [paste, setPaste] = useState('');
  // 미리 채워 들어왔으면 붙여넣기 칸은 접어둔다 — 채울 게 없다.
  const [pasteOpen, setPasteOpen] = useState(!editing && !preset);
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  const [date, setDate] = useState(editing?.date ?? preset?.date ?? dayjs().format('YYYY-MM-DD'));
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? preset?.customerPhone ?? '');
  const [customerName, setCustomerName] = useState(editing?.customerName ?? preset?.customerName ?? '');
  const [source, setSource] = useState(editing?.source ?? preset?.source ?? '');
  const [inspector, setInspector] = useState(editing?.inspector ?? preset?.inspector ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? preset?.vehicleName ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? preset?.vehicleNumber ?? '');
  const [modelYear, setModelYear] = useState(editing?.modelYear ?? preset?.modelYear ?? '');
  const [fuel, setFuel] = useState(editing?.fuel ?? preset?.fuel ?? '');
  const [keyCount, setKeyCount] = useState(editing ? String(editing.keyCount) : preset?.keyCount ? String(preset.keyCount) : '');
  const [mileage, setMileage] = useState(withCommas(editing?.mileage ?? preset?.mileage ?? 0));
  const [note, setNote] = useState(editing?.note ?? '');
  const [purchaseAmount, setPurchaseAmount] = useState(withCommas(editing?.purchaseAmount ?? preset?.purchaseAmount ?? 0));
  const [brokerFee, setBrokerFee] = useState(withCommas(editing?.brokerFee ?? preset?.brokerFee ?? 0));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = moneyToNumber(purchaseAmount) + moneyToNumber(brokerFee);

  /** 붙여넣은 카톡 양식에서 알아본 칸만 채운다 — 못 알아본 칸은 건드리지 않는다. */
  const applyPaste = () => {
    const parsed = parseIntakeText(paste);
    const filled: string[] = [];

    const put = (value: string | number | undefined, set: (v: string) => void, label: string) => {
      if (value === undefined || value === '') return;
      set(String(value));
      filled.push(label);
    };

    put(parsed.date, setDate, '날짜');
    put(parsed.customerPhone, setCustomerPhone, '고객번호');
    put(parsed.customerName, setCustomerName, '고객이름');
    put(parsed.source, setSource, '매입처');
    put(parsed.inspector, setInspector, '실차 확인자');
    put(parsed.vehicleName, setVehicleName, '차명');
    put(parsed.vehicleNumber, setVehicleNumber, '차량번호');
    put(parsed.modelYear, setModelYear, '연식');
    put(parsed.fuel, setFuel, '연료');
    put(parsed.keyCount, setKeyCount, '차키갯수');
    put(parsed.note, setNote, '특이사항');
    if (parsed.mileage) {
      setMileage(withCommas(parsed.mileage));
      filled.push('주행거리');
    }
    if (parsed.purchaseAmount) {
      setPurchaseAmount(withCommas(parsed.purchaseAmount));
      filled.push('실매입금액');
    }
    if (parsed.brokerFee) {
      setBrokerFee(withCommas(parsed.brokerFee));
      filled.push('구전');
    }

    setPasteResult(filled.length ? `${filled.length}개 칸을 채웠습니다 — ${filled.join(', ')}` : '알아본 칸이 없습니다. 양식을 확인해 주세요.');
    if (filled.length) setPasteOpen(false);
  };

  const handleSubmit = async () => {
    const plate = normalizePlate(vehicleNumber);
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('고객이름과 고객번호는 필수 입력입니다.');
      return;
    }
    if (!vehicleName.trim() || !plate) {
      setError('차명과 차량번호는 필수 입력입니다.');
      return;
    }
    // 차량관리에 자동으로 올리려면 번호 형식이 맞아야 한다 — 여기서 미리 막는다.
    if (!isValidPlate(plate)) {
      setError(PLATE_MESSAGE.format);
      return;
    }

    setSaving(true);
    setError(null);
    const failed = await onSave({
      date,
      customerPhone: customerPhone.trim(),
      customerName: customerName.trim(),
      source: source.trim(),
      inspector: inspector.trim(),
      vehicleName: vehicleName.trim(),
      vehicleNumber: plate,
      modelYear: modelYear.trim(),
      fuel: fuel.trim(),
      keyCount: moneyToNumber(keyCount),
      mileage: moneyToNumber(mileage),
      note: note.trim(),
      purchaseAmount: moneyToNumber(purchaseAmount),
      brokerFee: moneyToNumber(brokerFee),
    });
    setSaving(false);

    if (failed) setError(failed);
    else onClose();
  };

  const field = (label: string, node: React.ReactNode, span = '') => (
    <div className={span}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
    </div>
  );

  const text = (value: string, set: (v: string) => void, placeholder = '') => (
    <input
      value={value}
      onChange={e => set(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
    />
  );

  const money = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      value={withCommas(value)}
      onChange={e => set(toMoneyValue(e.target.value))}
      inputMode="numeric"
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '매입 내역 수정' : '매입 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {presetHint && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            {presetHint}
          </p>
        )}

        {/* 카톡으로 받은 양식을 그대로 붙여넣으면 아래 칸이 채워진다 */}
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <button
            onClick={() => setPasteOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-700"
          >
            <ClipboardPaste size={14} />
            받은 양식 붙여넣기로 채우기 {pasteOpen ? '▲' : '▼'}
          </button>
          {pasteOpen && (
            <>
              <textarea
                value={paste}
                onChange={e => setPaste(e.target.value)}
                rows={6}
                placeholder={'▶고객번호 : 010-0000-0000\n▶고객이름 : 홍길동\n매입 - 아우디 평촌 ○○○\n▶날짜 : 26년 8월 25일\n…'}
                className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-indigo-400"
              />
              <button
                onClick={applyPaste}
                disabled={!paste.trim()}
                className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                칸 채우기
              </button>
            </>
          )}
          {pasteResult && <p className="mt-2 text-[11px] text-indigo-600">{pasteResult}</p>}
        </div>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">고객 · 매입처</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('날짜', <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />)}
          {field('고객번호 *', text(customerPhone, setCustomerPhone, '010-0000-0000'))}
          {field('고객이름 *', text(customerName, setCustomerName, '이동훈'))}
          {field('실차 확인자', text(inspector, setInspector, '검차업체(예나)'))}
          {field('매입처', text(source, setSource, '아우디 평촌 류호성상조회장'), 'col-span-2 sm:col-span-4')}
        </div>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">차량</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('차명 *', text(vehicleName, setVehicleName, '아우디 A5(2세대) 40TDI quattro'), 'col-span-2 sm:col-span-4')}
          {field('차량번호 *', text(vehicleNumber, setVehicleNumber, '154오8037'))}
          {field('연식', text(modelYear, setModelYear, '2020'))}
          {field(
            '연료',
            <input
              value={fuel}
              onChange={e => setFuel(e.target.value)}
              list="purchase-intake-fuels"
              placeholder="디젤"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />,
          )}
          {field('차키갯수', text(keyCount, v => setKeyCount(v.replace(/[^\d]/g, '')), '2'))}
          {field('주행거리(km)', money(mileage, setMileage, '37,900'))}
          {field('특이사항', text(note, setNote, '금일 전액 이체 및 차량인도'), 'col-span-2 sm:col-span-3')}
        </div>

        <datalist id="purchase-intake-fuels">
          {FUEL_OPTIONS.map(f => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">매입금액</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field('실매입금액(원)', money(purchaseAmount, setPurchaseAmount, '27,500,000'))}
          {field('구전(원)', money(brokerFee, setBrokerFee, '500,000'))}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">총 매입금액</label>
            <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-right text-sm font-bold text-slate-800">
              {total ? total.toLocaleString() : 0}
              <span className="ml-1 text-xs font-medium text-slate-400">원</span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">
          등록하면 이 차량번호가 <b>차량 관리</b> 탭에 자동으로 올라갑니다. 이미 있는 번호면 차량명만 맞춥니다.
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
