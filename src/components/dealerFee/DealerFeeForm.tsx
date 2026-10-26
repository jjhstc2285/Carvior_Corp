import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useEscClose } from '../../lib/useEscClose';
import { digitsOnly, withCommas } from '../../lib/money';
import ContractPhotos from '../settlement/ContractPhotos';
import {
  DEALER_BRAND_LABEL,
  DEALER_FEE_METHOD_LABEL,
  type DealerFeeAccount,
  type DealerFeeMethod,
} from '../../types';

/**
 * 영업소 한 곳을 고치는 창 — 가로로 편다.
 *
 * 칸이 스무 개라 표에서 바로 고치면 옆으로 끝까지 밀어야 끝 칸이 나온다. 밀고 나면
 * 어느 줄을 고치고 있었는지 놓친다 — 한 곳을 통째로 펴 놓고 고친다.
 *
 * 저장은 한 번에 한다. 표에서는 칸을 벗어날 때마다 보냈는데, 그러면 한 곳을 손보는
 * 동안 열 번이 넘게 날아가고 중간에 끊기면 반만 들어간다.
 *
 * 제조사는 안 받는다 — 업체명에서 뽑는 값이라 적게 하면 업체명과 어긋난다.
 * 판매 누적·매입·최근 판매도 안 받는다. 장부가 아니라 센 값이다.
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

export default function DealerFeeForm({
  row,
  onSave,
  onDelete,
  onClose,
}: {
  row: DealerFeeAccount;
  onSave: (body: Partial<DealerFeeAccount>) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEscClose(onClose);

  const [form, setForm] = useState({
    dealerName: row.dealerName ?? '',
    managerName: row.managerName ?? '',
    managerPhone: row.managerPhone ?? '',
    startedOn: row.startedOn ?? '',
    bank: row.bank ?? '',
    accountHolder: row.accountHolder ?? '',
    accountNumber: row.accountNumber ?? '',
    transferDay: row.transferDay ?? '',
    transferDayOfMonth: row.transferDayOfMonth ?? 0,
    monthlyFee: row.monthlyFee ?? 0,
    feeNote: row.feeNote ?? '',
    method: row.method,
    autoTransferUntil: row.autoTransferUntil ?? '',
    note: row.note ?? '',
    memo: row.memo ?? '',
    photo: row.photo ?? '',
    active: row.active,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  /*
    보내고 기다렸다 닫는다.

    기다리지 않고 닫으면 서버가 거절해도(업체명이 비었다든지) 아무 말이 없다 —
    누른 사람은 들어간 줄 알고 나간다.
  */
  const submit = async () => {
    if (!form.dealerName.trim()) {
      setError('업체명을 적어 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...form, dealerName: form.dealerName.trim(), startedOn: form.startedOn || null });
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
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
            {form.dealerName || '영업소'}
            {/* 업체명에서 뽑는 값이라 못 고친다 — 업체명을 고치면 따라 바뀐다 */}
            {row.brand && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                {DEALER_BRAND_LABEL[row.brand] ?? row.brand}
              </span>
            )}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {/* 넓은 화면에서는 세 줄로 — 스무 칸을 한 줄로 세우면 창이 화면을 넘긴다 */}
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="업체명 *">
              <input value={form.dealerName} onChange={e => set('dealerName', e.target.value)} className={INPUT} />
            </Field>
            <Field label="담당자">
              <input value={form.managerName} onChange={e => set('managerName', e.target.value)} className={INPUT} />
            </Field>
            <Field label="담당연락처">
              <input
                value={form.managerPhone}
                onChange={e => set('managerPhone', e.target.value)}
                placeholder="010-"
                inputMode="tel"
                className={INPUT}
              />
            </Field>

            <Field label="거래시작일">
              <input
                type="date"
                value={form.startedOn ?? ''}
                onChange={e => set('startedOn', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="은행">
              <input
                value={form.bank}
                onChange={e => set('bank', e.target.value)}
                placeholder="카카오뱅크"
                className={INPUT}
              />
            </Field>
            <Field label="예금주">
              <input value={form.accountHolder} onChange={e => set('accountHolder', e.target.value)} className={INPUT} />
            </Field>

            <Field label="자동이체계좌">
              <input
                value={form.accountNumber}
                onChange={e => set('accountNumber', e.target.value)}
                className={INPUT}
              />
            </Field>
            {/* 꼴이 제각각이라(매달5일 / 10-01 / 매달1일고정) 적힌 그대로 받는다 */}
            <Field label="자동이체날짜" hint="적힌 그대로 둡니다 — 알림은 옆의 이체일 숫자로 돕니다">
              <input
                value={form.transferDay}
                onChange={e => set('transferDay', e.target.value)}
                placeholder="매달5일"
                className={INPUT}
              />
            </Field>
            {/* 이 숫자로 그날 아침 알림이 돈다 — 못 채우면 노랗게 알린다 */}
            <Field label="이체일 (1~31)" hint="이 날 아침에 알림이 갑니다. 비우면 안 갑니다">
              <input
                value={form.transferDayOfMonth || ''}
                onChange={e => set('transferDayOfMonth', Math.min(31, Number(digitsOnly(e.target.value)) || 0))}
                inputMode="numeric"
                placeholder="5"
                className={`${INPUT} ${form.transferDayOfMonth ? '' : 'border-amber-300 bg-amber-50/60'}`}
              />
            </Field>

            <Field label="매달 회비 (원)">
              <input
                value={form.monthlyFee ? withCommas(form.monthlyFee) : ''}
                onChange={e => set('monthlyFee', Number(digitsOnly(e.target.value)) || 0)}
                inputMode="numeric"
                placeholder="100,000"
                className={`${INPUT} text-right`}
              />
            </Field>
            {/* 금액으로 안 떨어지는 조건은 적힌 그대로 남긴다 — 사람이 보고 판단할 일이다 */}
            <Field label="회비 조건" hint="금액으로 안 떨어지는 조건을 적는 자리입니다">
              <input value={form.feeNote} onChange={e => set('feeNote', e.target.value)} className={INPUT} />
            </Field>
            <Field label="자동이체여부">
              <select
                value={form.method}
                onChange={e => set('method', e.target.value as DealerFeeMethod)}
                className={`${INPUT} ${form.method === 'CANCELED' ? 'border-red-300 bg-red-50 text-red-700' : ''}`}
              >
                {(Object.entries(DEALER_FEE_METHOD_LABEL) as [DealerFeeMethod, string][]).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="자동이체기한">
              <input
                value={form.autoTransferUntil}
                onChange={e => set('autoTransferUntil', e.target.value)}
                placeholder="2026년12월"
                className={INPUT}
              />
            </Field>
            <Field label="비고">
              <input value={form.note} onChange={e => set('note', e.target.value)} className={INPUT} />
            </Field>
            <Field label="메모">
              <input value={form.memo} onChange={e => set('memo', e.target.value)} className={INPUT} />
            </Field>
          </div>

          {/*
            사진 한 장 — 명함·간판·약정서처럼 글로 못 적는 것.

            올리는 즉시 서버에 올라가고 경로만 들고 있다가 저장할 때 붙는다. 창을 닫고
            저장을 안 하면 올린 파일은 남지만 줄에는 안 붙는다 — 사진은 되돌릴 거리가
            아니라서 그 편이 낫다(잘못 올리면 지우고 다시 올린다).
          */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">사진</label>
            <ContractPhotos
              value={form.photo}
              onChange={next => set('photo', next)}
              max={1}
              title="상조회 사진"
              hint="명함·간판·약정서처럼 글로 못 적는 것 — 한 장만 들어갑니다"
              endpoint="/dealer-fees/photos"
              watermark={false}
            />
          </div>

          {/* 거래가 끝난 곳은 지우지 말고 여기를 푼다 — 지난 내용이 남는다 */}
          <label className="mt-4 flex w-fit items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => set('active', e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            거래중
            <span className="text-[11px] text-slate-400">끝난 곳은 지우지 말고 여기를 푸세요 — 지난 내용이 남습니다</span>
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            onClick={onDelete}
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 hover:bg-red-50"
          >
            <Trash2 size={13} /> 목록에서 지우기
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
