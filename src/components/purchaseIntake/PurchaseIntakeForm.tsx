import { useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, ClipboardPaste, LineChart, X } from 'lucide-react';
import { isValidPlate, normalizePlate, PLATE_MESSAGE } from '../../lib/vehicle';
import {
  BROKER_FEE_TYPE_LABEL,
  BROKER_FEE_TYPE_RATE,
  type BrokerFeeType,
  type PurchaseIntake,
} from '../../types';

/** 이만큼 벌어지면 저장할 때 관리자에게 알림이 간다 — 서버 기준과 같아야 한다. */
const MILEAGE_GAP_ALERT_KM = 1000;
import { digitsOnly, moneyToNumber, toMoneyValue, withCommas } from '../../lib/money';
import { needsRegistrationCheck, stockDeadline } from '../../lib/stockFinance';
import { parseIntakeText } from './parseIntake';
import {
  CHECK_ITEMS,
  PREP_VENDORS,
  DENT_PRICE,
  FUEL_LEVELS,
  WHEEL_PRICE,
  estimateCost,
  panelUnit,
  parseChecked,
  serializeChecked,
} from '../../lib/inspectionCheck';
import PriceCheckModal from '../price/PriceCheckModal';
import type { PurchaseIntakeInput } from './usePurchaseIntake';

interface Props {
  editing: PurchaseIntake | null;
  onSave: (input: PurchaseIntakeInput) => Promise<string | null>;
  onClose: () => void;
}

const FUEL_OPTIONS = ['가솔린', '디젤', 'LPG', '하이브리드', '전기', '가솔린+LPG'];

export default function PurchaseIntakeForm({ editing, onSave, onClose }: Props) {
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(!editing);
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? '');
  const [customerName, setCustomerName] = useState(editing?.customerName ?? '');
  const [source, setSource] = useState(editing?.source ?? '');
  const [inspector, setInspector] = useState(editing?.inspector ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? '');
  const [detailModel, setDetailModel] = useState(editing?.detailModel ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? '');
  const [modelYear, setModelYear] = useState(editing?.modelYear ?? '');
  const [firstRegisteredOn, setFirstRegisteredOn] = useState(editing?.firstRegisteredOn ?? '');
  const [fuel, setFuel] = useState(editing?.fuel ?? '');
  const [keyCount, setKeyCount] = useState(editing ? String(editing.keyCount) : '');
  const [mileage, setMileage] = useState(withCommas(editing?.mileage ?? 0));
  const [note, setNote] = useState(editing?.note ?? '');
  const [purchaseAmount, setPurchaseAmount] = useState(withCommas(editing?.purchaseAmount ?? 0));
  const [brokerFee, setBrokerFee] = useState(withCommas(editing?.brokerFee ?? 0));
  const [brokerFeeType, setBrokerFeeType] = useState<BrokerFeeType>(editing?.brokerFeeType ?? 'CASH');
  const [checkedMileage, setCheckedMileage] = useState(withCommas(editing?.checkedMileage ?? 0));
  /*
    상품화 — 실차를 보고 상품으로 낼 수 있게 손봤는가.

    차량 관리에 목록을 따로 두고 거기서 켰는데, 켜는 사람은 실차를 본 사람이고 그 사람이
    보고 있는 건 이 화면이다. 본 자리에서 켠다. 저장하면 차량 관리로 넘어간다.
  */
  const [prepared, setPrepared] = useState(editing?.prepared ?? false);

  /*
    실차 검차.

    차를 보러 가서 확인하는 것들을 카톡으로 주고받다 보니, 갈 때마다 빠뜨리는 게 달랐다 —
    후레시를 안 들고 가서 지하에서 판을 못 보고 오기도 했다. 목록으로 박아 두고 거기서
    센 개수로 상품화 비용까지 미리 잡아 본다.
  */
  const [checked, setChecked] = useState<Set<string>>(() => parseChecked(editing?.checkedItems ?? ''));
  const [panelCount, setPanelCount] = useState(String(editing?.panelCount ?? 0));
  const [dentCount, setDentCount] = useState(String(editing?.dentCount ?? 0));
  const [dentLargeCount, setDentLargeCount] = useState(String(editing?.dentLargeCount ?? 0));
  const [wheelCount, setWheelCount] = useState(String(editing?.wheelCount ?? 0));
  const [fuelLevel, setFuelLevel] = useState(editing?.fuelLevel ?? '');
  const [prepVendor, setPrepVendor] = useState(editing?.prepVendor ?? '');
  const [imported, setImported] = useState(editing?.imported ?? false);
  /** 대산이 그 달 100대를 채웠는가 — 채우면 단가가 내려간다. 그 달 사정이라 저장하지 않는다 */
  const [bulk, setBulk] = useState(false);

  const counts = {
    panelCount: Number(digitsOnly(panelCount)) || 0,
    dentCount: Number(digitsOnly(dentCount)) || 0,
    dentLargeCount: Number(digitsOnly(dentLargeCount)) || 0,
    wheelCount: Number(digitsOnly(wheelCount)) || 0,
    vendor: prepVendor,
    imported,
    bulk,
  };
  const cost = estimateCost(counts);

  const toggleCheck = (key: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const total = moneyToNumber(purchaseAmount) + moneyToNumber(brokerFee);

  // 실차 확인 전(0)에는 차이를 따지지 않는다 — 0km 인 차는 없다.
  const mileageGap = moneyToNumber(checkedMileage) > 0
    ? Math.abs(moneyToNumber(checkedMileage) - moneyToNumber(mileage))
    : 0;

  // 원천징수는 구전에서 떼고 나머지를 준다. 저장은 안 하고 보여주기만 한다 —
  // 세율이 바뀌어도 지난 기록이 안 꼬이게(정산 파생값과 같은 방침).
  const withheld = Math.round(moneyToNumber(brokerFee) * BROKER_FEE_TYPE_RATE[brokerFeeType]);

  // 10년차 차만 등록증을 묻는다. 이미 적어둔 게 있으면 연식과 무관하게 계속 보여준다.
  const registrationCheck = needsRegistrationCheck(modelYear) || Boolean(firstRegisteredOn);
  const deadline = firstRegisteredOn ? stockDeadline(firstRegisteredOn) : null;

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
      detailModel: detailModel.trim(),
      vehicleNumber: plate,
      modelYear: modelYear.trim(),
      firstRegisteredOn: firstRegisteredOn || null,
      fuel: fuel.trim(),
      keyCount: moneyToNumber(keyCount),
      mileage: moneyToNumber(mileage),
      checkedMileage: moneyToNumber(checkedMileage),
      prepared,
      checkedItems: serializeChecked(checked),
      panelCount: counts.panelCount,
      dentCount: counts.dentCount,
      dentLargeCount: counts.dentLargeCount,
      wheelCount: counts.wheelCount,
      fuelLevel,
      prepVendor,
      imported,
      note: note.trim(),
      purchaseAmount: moneyToNumber(purchaseAmount),
      brokerFee: moneyToNumber(brokerFee),
      brokerFeeType,
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

  /** 개수 칸 — 몇 곳인지 세는 자리라 콤마를 안 붙인다 */
  const count = (value: string, set: (v: string) => void) => (
    <input
      value={value}
      onChange={e => set(digitsOnly(e.target.value).slice(0, 3))}
      inputMode="numeric"
      placeholder="0"
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '매입 내역 수정' : '매입 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

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
          {field('고객번호', text(customerPhone, setCustomerPhone, '010-0000-0000 (없으면 비움)'))}
          {field('고객이름', text(customerName, setCustomerName, '이동훈 (없으면 비움)'))}
          {field('실차 확인자', text(inspector, setInspector, '이름을 적으면 그 사람 앞으로 정산이 갑니다'))}
          {field('매입처', text(source, setSource, '아우디 평촌 류호성상조회장'), 'col-span-2 sm:col-span-4')}
        </div>

        <p className="mt-5 mb-2 text-xs font-bold text-slate-600">차량</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('차명 *', text(vehicleName, setVehicleName, '아우디 A5(2세대) 40TDI quattro'), 'col-span-2 sm:col-span-4')}
          {/* 카비어에서 받아온 건 등급이 없어 비어 있다. 시세 조회에서 등급을 고르면 여기가 채워진다. */}
          {field('세부모델', text(detailModel, setDetailModel, '2.4 GDI 프레스티지'), 'col-span-2 sm:col-span-4')}
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
          {/*
            실차 확인자가 차를 직접 보고 다시 적는다. 처음 적은 것과 1,000km 넘게
            벌어지면 저장할 때 관리자에게 알림이 간다 — 적어 온 값과 실제가 다르면
            매입가를 다시 봐야 한다.
          */}
          {field(
            '실차 확인 주행거리(km)',
            <>
              {money(checkedMileage, setCheckedMileage, '아직 확인 전')}
              {mileageGap >= MILEAGE_GAP_ALERT_KM && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle size={11} /> 매입 시보다 {mileageGap.toLocaleString()}km 차이 — 저장하면 관리자에게 알림이 갑니다
                </p>
              )}
            </>,
          )}
          {/* 실차를 본 김에 여기서 켠다 — 차량 관리까지 들어가서 다시 찾지 않게 */}
          {field(
            '상품화',
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                prepared ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={prepared}
                onChange={e => setPrepared(e.target.checked)}
                className="size-4 accent-emerald-600"
              />
              실차 검차 완료
            </label>,
          )}
          {/*
            10년차 차만 묻는다. 그 밖의 차는 등록 월이 언제든 결론이 같아서 물을 이유가 없다 —
            물을 게 늘면 아무것도 안 적게 된다.
            적는 순간 기한이 보여야 한다. "16.3월"을 넣으면 2026년 3월이 기한이고 오늘이
            9월이면 이미 반년이 지난 것인데, 그건 적고 나서 알 게 아니라 적으면서 알 일이다.
          */}
          {registrationCheck &&
            field(
              '등록증 최초등록일',
              <>
                <input
                  type="date"
                  value={firstRegisteredOn}
                  onChange={e => setFirstRegisteredOn(e.target.value)}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 ${
                    firstRegisteredOn ? 'border-slate-200' : 'border-amber-400 bg-amber-50'
                  }`}
                />
                {!firstRegisteredOn && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle size={11} /> {modelYear}년식 — 재고금융 10년차입니다. 등록증을 보고 넣어 주세요
                  </p>
                )}
                {deadline &&
                  (deadline.passed ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-600">
                      <AlertTriangle size={11} /> 재고 불가 — {deadline.date} 에 10년이 지났습니다 ({deadline.days}일 경과)
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                      재고 가능 — {deadline.date} 까지 (D-{deadline.days})
                    </p>
                  ))}
              </>,
              'col-span-2 sm:col-span-2',
            )}
          {field('특이사항', text(note, setNote, '금일 전액 이체 및 차량인도'), 'col-span-2 sm:col-span-3')}
        </div>

        {/* ── 실차 검차 ── */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-slate-600">실차 검차</p>
            <span className="text-[11px] text-slate-400">차 보러 가서 확인한 것 — 누르면 체크됩니다</span>
            <span className="ml-auto text-[11px] font-semibold text-slate-500">
              {checked.size}/{CHECK_ITEMS.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {CHECK_ITEMS.map(item => {
              const on = checked.has(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleCheck(item.key)}
                  title={item.hint}
                  className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                    on
                      ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* 센 개수 — 여기서 센 대로 상품화 비용이 잡힌다 */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {field('판 (곳)', count(panelCount, setPanelCount))}
            {field('덴트 (곳)', count(dentCount, setDentCount))}
            {field(`큰 덴트 (${(DENT_PRICE.large / 10000).toLocaleString()}만)`, count(dentLargeCount, setDentLargeCount))}
            {field(`휠 복원 (${(WHEEL_PRICE.mid / 10000).toLocaleString()}만)`, count(wheelCount, setWheelCount))}
            {field(
              '판금 업체',
              <select
                value={prepVendor}
                onChange={e => setPrepVendor(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              >
                <option value="">선택</option>
                {PREP_VENDORS.map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>,
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* 기름은 있다/없다가 아니라 얼마나 있는지를 본다 */}
            <span className="flex items-center gap-1 text-xs text-slate-600">
              기름
              {FUEL_LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFuelLevel(fuelLevel === level ? '' : level)}
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                    fuelLevel === level
                      ? level === '없음'
                        ? 'border-red-300 bg-red-50 font-bold text-red-700'
                        : 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {level}
                </button>
              ))}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={imported}
                onChange={e => setImported(e.target.checked)}
                className="size-4 accent-indigo-600"
              />
              수입차
            </label>
            {/* 그 달 사정이라 저장하지 않는다 — 볼 때마다 고른다 */}
            {prepVendor === '대산' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={bulk}
                  onChange={e => setBulk(e.target.checked)}
                  className="size-4 accent-indigo-600"
                />
                대산 100대 채움
              </label>
            )}

            {cost.total > 0 && (
              <span className="ml-auto text-xs text-slate-600">
                예상 상품화 비용{' '}
                <b className="text-sm text-indigo-700">{cost.total.toLocaleString()}</b>원
                <span className="ml-1 text-[11px] text-slate-400">
                  (판 {cost.panel.toLocaleString()} · 덴트 {cost.dent.toLocaleString()} · 휠{' '}
                  {cost.wheel.toLocaleString()})
                </span>
              </span>
            )}
          </div>

          {prepVendor && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              판 한 곳 {panelUnit(counts).toLocaleString()}원 ({prepVendor} · {imported ? '수입' : '국산'}
              {bulk ? ' · 100대' : ''}) · 덴트 작은 것 {DENT_PRICE.small.toLocaleString()}원 · 큰 것{' '}
              {DENT_PRICE.large.toLocaleString()}원 — 실제로 나간 돈은 매입 정산의 상품화 비용에 적습니다.
            </p>
          )}
        </div>

        <datalist id="purchase-intake-fuels">
          {FUEL_OPTIONS.map(f => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <div className="mt-5 mb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-600">매입금액</p>
          {/* 매입가를 정할 때 다른 창을 열어 찾아보던 걸 여기서 끝낸다 */}
          <button
            type="button"
            onClick={() => setPriceOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            title="카비어에 올라온 같은 등급 매물로 시세를 봅니다"
          >
            <LineChart size={13} /> 시세 조회
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field('실매입금액(원)', money(purchaseAmount, setPurchaseAmount, '27,500,000'))}
          {field('구전(원)', money(brokerFee, setBrokerFee, '500,000'))}
          {field(
            '구전 지급 방식',
            <>
              <select
                value={brokerFeeType}
                onChange={e => setBrokerFeeType(e.target.value as BrokerFeeType)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              >
                {(Object.entries(BROKER_FEE_TYPE_LABEL) as [BrokerFeeType, string][]).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              {withheld > 0 && (
                <p className="mt-1 text-[11px] text-slate-400">
                  원천징수 {withheld.toLocaleString()}원 · 실지급 {(moneyToNumber(brokerFee) - withheld).toLocaleString()}원
                </p>
              )}
            </>,
          )}
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

        {priceOpen && (
          <PriceCheckModal
            defaultQuery={vehicleName}
            mileage={moneyToNumber(mileage) || null}
            modelYear={modelYear}
            fuel={fuel}
            /*
             * 등급을 고르면 차명과 세부모델이 카비어 표기로 맞춰진다.
             * 우리가 적어둔 차명은 표기가 제각각이라("르노(삼성) SM6") 다음에 또 못 찾는다.
             * 적어둔 내용이 사라지는 게 아니라 트림 부분이 세부모델로 옮겨가는 것이다.
             */
            onPickSpec={spec => {
              setVehicleName(`${spec.manufacturer} ${spec.model}`);
              setDetailModel(spec.badge);
            }}
            onPick={won => setPurchaseAmount(withCommas(won))}
            onClose={() => setPriceOpen(false)}
          />
        )}

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
