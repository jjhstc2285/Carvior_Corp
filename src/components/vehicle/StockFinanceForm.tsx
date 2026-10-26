import { useState } from 'react';
import dayjs from 'dayjs';
import { FileText, X } from 'lucide-react';
import { useEscClose } from '../../lib/useEscClose';
import { digitsOnly, withCommas } from '../../lib/money';
import { CAPITAL_COMPANIES, offerEligibility, suggestRepayDate } from '../../lib/stockFinance';
import VehiclePhotoStrip from './VehiclePhotoStrip';
import type { ManagedVehicle } from '../../types';

/**
 * 차 한 대의 제시·재고를 고치는 창 — 가로로 편다.
 *
 * 칸이 열셋이라 표에서 바로 고치면 옆으로 끝까지 밀어야 끝 칸이 나오고, 밀고 나면
 * 어느 줄을 고치고 있었는지 놓친다. 한 대를 통째로 펴 놓고 고친다.
 *
 * 저장은 한 번에 한다. 표에서는 칸을 벗어날 때마다 보냈는데, 한 대를 손보는 동안
 * 예닐곱 번이 날아가고 중간에 끊기면 반만 들어갔다.
 *
 * 매입가·차명은 매입 관리가 들고 있는 값이라 여기서 안 고친다 — 고칠 일이면 그쪽으로
 * 넘어간다(아래 [매입 정보 고치기]).
 */

const INPUT =
  'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function StockFinanceForm({
  vehicle,
  onSave,
  onOpenIntake,
  onClose,
}: {
  vehicle: ManagedVehicle;
  onSave: (body: Partial<ManagedVehicle>) => Promise<void> | void;
  /** 매입 관리 쪽 값(매입가·연식·주행거리)을 고치러 넘어간다 */
  onOpenIntake: () => void;
  onClose: () => void;
}) {
  useEscClose(onClose);

  const [form, setForm] = useState({
    offerDate: vehicle.offerDate ?? '',
    transferDate: vehicle.transferDate ?? '',
    soldDate: vehicle.soldDate ?? '',
    stockCapital: vehicle.stockCapital ?? '',
    stockAmount: vehicle.stockAmount ?? 0,
    repayDate: vehicle.repayDate ?? '',
    cashVehicle: vehicle.cashVehicle,
    salePrice: vehicle.salePrice ?? 0,
    modelYear: vehicle.modelYear ?? '',
    mileage: vehicle.mileage ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  /*
    재고금액을 적으면 갚는 날을 채워 둔다.

    갚는 날은 할부사가 정해 놓은 규칙이라 사람이 셀 일이 아니다 — 우리금융이면 다섯 달
    뒤 8일 하는 식이다. 이미 적어 둔 날은 안 건드린다(규칙과 다르게 잡은 건이 있다).
  */
  const setStockAmount = (next: number) => {
    setForm(prev => {
      const repay =
        prev.repayDate || !prev.stockCapital || next <= 0
          ? prev.repayDate
          : (suggestRepayDate(prev.stockCapital, prev.offerDate || dayjs().format('YYYY-MM-DD')) ?? '');
      return { ...prev, stockAmount: next, repayDate: repay };
    });
  };

  /** 제시할 수 있는 차인가 — 연식·주행거리로 가린다. 고치는 대로 따라 바뀐다 */
  const eligible = offerEligibility({ ...vehicle, modelYear: form.modelYear, mileage: form.mileage });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        // 빈 날짜는 null 로 보낸다 — 빈 글자를 넣으면 서버가 날짜로 못 읽는다
        offerDate: form.offerDate || null,
        transferDate: form.transferDate || null,
        soldDate: form.soldDate || null,
        repayDate: form.repayDate || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-800">
            <span className="font-mono">{vehicle.vehicleNumber}</span>
            <span className="text-sm font-medium text-slate-500">{vehicle.vehicleModel}</span>
            {/* 알선차 — 우리가 사온 차가 아니다. 매도 대수에서 뺀 줄이라고 적어 둔다 */}
            {vehicle.brokered && (
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                알선
              </span>
            )}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="제시일자" hint="캐피탈에 제시한 날">
              <input
                type="date"
                value={form.offerDate}
                onChange={e => set('offerDate', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="이전일자" hint="명의를 이전한 날 — 재검은 이 날부터 넉 달">
              <input
                type="date"
                value={form.transferDate}
                onChange={e => set('transferDate', e.target.value)}
                className={INPUT}
              />
            </Field>
            {/* 매도일자가 들어가면 끝난 차다 — 상환 예정·상품화 목록에서 빠진다 */}
            <Field label="매도일자" hint="적으면 끝난 차가 됩니다 — 상환 예정에서도 빠집니다">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={form.soldDate}
                  onChange={e => set('soldDate', e.target.value)}
                  className={INPUT}
                />
                {!form.soldDate && (
                  <button
                    type="button"
                    onClick={() => set('soldDate', dayjs().format('YYYY-MM-DD'))}
                    className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    오늘
                  </button>
                )}
              </div>
            </Field>

            <Field label="할부사">
              <input
                value={form.stockCapital}
                onChange={e => set('stockCapital', e.target.value)}
                list="capital-companies"
                placeholder="할부사"
                className={INPUT}
              />
              <datalist id="capital-companies">
                {CAPITAL_COMPANIES.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="재고금액 (원)" hint="적으면 갚는 날이 할부사 규칙대로 채워집니다">
              <input
                value={form.stockAmount ? withCommas(form.stockAmount) : ''}
                onChange={e => setStockAmount(Number(digitsOnly(e.target.value)) || 0)}
                inputMode="numeric"
                placeholder="원"
                className={`${INPUT} text-right`}
              />
            </Field>
            <Field label="상환일자">
              <input
                type="date"
                value={form.repayDate}
                onChange={e => set('repayDate', e.target.value)}
                className={INPUT}
              />
            </Field>

            {/* 같은 값이 네 곳에 적힌다 — 여기서 적으면 상담·알선 정산·매입 정산도 같이 바뀐다 */}
            <Field label="매도금액 (원)" hint="상담 등록 · 알선 정산 · 매입 정산의 판매가와 같은 값입니다">
              <input
                value={form.salePrice ? withCommas(form.salePrice) : ''}
                onChange={e => set('salePrice', Number(digitsOnly(e.target.value)) || 0)}
                inputMode="numeric"
                placeholder="원"
                className={`${INPUT} border-emerald-200 bg-emerald-50/40 text-right`}
              />
            </Field>
            <Field label="연식">
              <input
                value={form.modelYear}
                onChange={e => set('modelYear', e.target.value)}
                placeholder="2019"
                className={INPUT}
              />
            </Field>
            <Field label="주행거리 (km)">
              <input
                value={form.mileage ? withCommas(form.mileage) : ''}
                onChange={e => set('mileage', Number(digitsOnly(e.target.value)) || 0)}
                inputMode="numeric"
                className={`${INPUT} text-right`}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* 재고를 안 쓰는 차는 제시 대상에서 빠진다 */}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.cashVehicle}
                onChange={e => set('cashVehicle', e.target.checked)}
                className="size-4 accent-indigo-600"
              />
              현금차량
              <span className="text-[11px] text-slate-400">재고 금융을 안 씁니다 — 제시 대상에서 빠집니다</span>
            </label>
          </div>

          {/* 제시할 수 있는 차인지 — 연식·주행거리를 고치는 대로 따라 바뀐다 */}
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              eligible.ok === true ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {eligible.ok === true ? `제시 가능 — ${eligible.age}년차` : `제시 어려움 — ${eligible.reason}`}
          </p>

          {/* 그 차 상품화 사진 — 팔린 차는 안 뜬다 */}
          <VehiclePhotoStrip vehicleNumber={vehicle.vehicleNumber} />
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {/* 매입가·차명은 매입 관리가 들고 있는 값이라 그쪽에서 고친다 */}
          <button
            onClick={onOpenIntake}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <FileText size={13} /> 매입 정보 고치기
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
              취소
            </button>
            <button
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
