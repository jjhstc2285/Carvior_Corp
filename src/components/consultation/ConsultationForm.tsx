import { useState } from 'react';
import dayjs from 'dayjs';
import { LineChart, X } from 'lucide-react';
import { useStore } from '../../store';
import PriceCheckModal from '../price/PriceCheckModal';
import {
  CONSULTATION_KIND_LABEL,
  CONSULTATION_PLATFORMS_BY_KIND,
  CONSULTATION_STATUS_LABEL,
  PAY_METHOD_LABEL,
  type ConsultationKind,
  type ConsultationRecord,
  type ConsultationStatus,
  type PayMethod,
} from '../../types';
import { CAPITAL_COMPANIES } from '../../lib/stockFinance';

interface Props {
  /** 알선인지 수출인지 — 열린 탭이 정한다 */
  kind: ConsultationKind;
  editing: ConsultationRecord | null;
  defaultEmployeeId: string;
  /** 차량관리에서 고른 차로 열 때 — 차량번호·차명을 미리 채운다 */
  /**
   * 미리 채워 둘 값.
   *
   * 차를 눌러서 열면 차량번호·차명이, 채널톡 통화를 옮기면 통화 내용과 손님번호가 실려 온다.
   */
  preset?: { vehicleNumber?: string; vehicleName?: string; content?: string; customerPhone?: string };
  onClose: () => void;
}

export default function ConsultationForm({ kind, editing, defaultEmployeeId, preset, onClose }: Props) {
  const { state, upsertConsultation } = useStore();
  const [platform, setPlatform] = useState(editing?.platform ?? '');
  const [vehicleNumber, setVehicleNumber] = useState(editing?.vehicleNumber ?? preset?.vehicleNumber ?? '');
  const [vehicleName, setVehicleName] = useState(editing?.vehicleName ?? preset?.vehicleName ?? '');
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? preset?.customerPhone ?? '');
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? defaultEmployeeId);
  /*
    기타 상담은 남의 딜러가 우리 물건을 판 건이다 — 담당자가 우리 직원이 아니라서
    목록에서 고를 수가 없다. 이름만 받아 둔다(그 사람 계정을 만들 일은 없다).
  */
  const [outsideDealer, setOutsideDealer] = useState(editing?.outsideDealer ?? '');
  const [status, setStatus] = useState<ConsultationStatus>(editing?.status ?? 'IN_PROGRESS');
  const [date, setDate] = useState(editing?.date ?? dayjs().format('YYYY-MM-DD'));
  const [time, setTime] = useState(editing?.time ?? dayjs().format('HH:mm'));
  const [content, setContent] = useState(editing?.content ?? preset?.content ?? '');
  const [depositAmount, setDepositAmount] = useState(editing ? String(editing.depositAmount || '') : '');
  /* 재고금융을 쓴 캐피탈에 할부를 얼마나 깔았는지 — 약정을 채웠는지 세는 값이다 */
  const [payMethod, setPayMethod] = useState<PayMethod>(editing?.payMethod ?? 'UNKNOWN');
  const [installmentCapital, setInstallmentCapital] = useState(editing?.installmentCapital ?? '');
  const [installmentAmount, setInstallmentAmount] = useState(
    editing?.installmentAmount ? String(editing.installmentAmount) : '',
  );
  const [visitDate, setVisitDate] = useState(editing?.visitDate ?? '');
  const [visitTime, setVisitTime] = useState(editing?.visitTime ?? '');
  const [nextContactDate, setNextContactDate] = useState(editing?.nextContactDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);

  const handleSubmit = () => {
    if (!vehicleNumber.trim() || !customerPhone.trim() || !content.trim()) {
      setError('차량번호, 손님번호, 내용은 필수 입력입니다.');
      return;
    }
    upsertConsultation({
      id: editing?.id,
      kind: editing?.kind ?? kind,
      platform: platform.trim(),
      vehicleNumber: vehicleNumber.trim(),
      vehicleName: vehicleName.trim(),
      customerPhone: customerPhone.trim(),
      // 예전 양식으로 적힌 고객명은 건드리지 않고 그대로 넘긴다.
      customerName: editing?.customerName ?? '',
      employeeId,
      outsideDealer: outsideDealer.trim(),
      status,
      date,
      time,
      content: content.trim(),
      depositAmount: Number(depositAmount.replace(/[^\d]/g, '')) || 0,
      visitDate: visitDate || null,
      visitTime: visitTime.trim(),
      nextContactDate: nextContactDate || null,
      payMethod,
      // 현금이면 할부 칸은 안 보낸다 — 서버도 같은 기준으로 비운다
      installmentCapital: payMethod === 'INSTALLMENT' ? installmentCapital : '',
      installmentAmount: payMethod === 'INSTALLMENT' ? Number(installmentAmount.replace(/[^\d]/g, '')) || 0 : 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">
            {CONSULTATION_KIND_LABEL[editing?.kind ?? kind]} 상담 {editing ? '수정' : '등록'}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* 카톡으로 주고받던 양식 순서 그대로 — 플랫폼 / 차량번호 / 차명 / 손님번호 / 내용 */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-slate-500">플랫폼</label>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {CONSULTATION_PLATFORMS_BY_KIND[editing?.kind ?? kind].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  platform === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="위에서 고르거나 직접 입력"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">차량번호 *</label>
            <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="42더8955"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">차명</label>
              {/* 손님과 통화하면서 값을 물어보는 일이 많다 — 창을 따로 열지 않게 여기서 본다 */}
              <button
                type="button"
                onClick={() => setPriceOpen(true)}
                className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                title="카비어에 올라온 같은 등급 매물로 시세를 봅니다"
              >
                <LineChart size={11} /> 시세
              </button>
            </div>
            <input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="QM5"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">손님번호 *</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="010-0000-0000"
              inputMode="tel"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              {kind === 'OTHER' ? '판 딜러 · 상사' : '담당자'}
            </label>
            {kind === 'OTHER' ? (
              <>
                <input
                  value={outsideDealer}
                  onChange={e => setOutsideDealer(e.target.value)}
                  placeholder="김딜러 / 대성모터스"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">우리 물건을 판 남의 딜러나 그 상사 이름</p>
              </>
            ) : (
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담 상태</label>
            <select value={status} onChange={e => setStatus(e.target.value as ConsultationStatus)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              {(Object.entries(CONSULTATION_STATUS_LABEL) as [ConsultationStatus, string][]).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담일</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">상담시각</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          {/* 출고 카톡("입금1000만원")에 들어가는 금액. 판매완료로 바꿀 때만 묻는다. */}
          {status === 'SOLD' && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">입금액 (만원)</label>
              <input
                value={depositAmount ? Number(depositAmount).toLocaleString() : ''}
                onChange={e => setDepositAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="1000"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
              />
            </div>
          )}

          {/*
            현금인지 할부인지.

            재고금융을 쓴 캐피탈에는 그 회사 할부를 얼마 이상 깔아 줘야 하는 약정이 있다.
            여기 적어야 상담 화면 위 [재고금융 할부 의무] 에 실적으로 잡힌다.
          */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">결제 구분</label>
            <select
              value={payMethod}
              onChange={e => setPayMethod(e.target.value as PayMethod)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            >
              {(Object.entries(PAY_METHOD_LABEL) as [PayMethod, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {payMethod === 'INSTALLMENT' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">할부사</label>
                <select
                  value={installmentCapital}
                  onChange={e => setInstallmentCapital(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">선택</option>
                  {CAPITAL_COMPANIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-500">할부 금액 (원)</label>
                <input
                  value={installmentAmount ? Number(installmentAmount).toLocaleString() : ''}
                  onChange={e => setInstallmentAmount(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  placeholder="30000000"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  이 금액이 그 캐피탈 약정에 채워집니다 — 상담 화면 맨 위에서 남은 금액을 봅니다.
                </p>
              </div>
            </>
          ) : (
            <div />
          )}

          {/* 카톡 양식에 "오후 3시~4시 방문"처럼 적혀 온다. 시각은 적힌 그대로 받는다. */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">방문 예정일</label>
            <input type="date" value={visitDate ?? ''} onChange={e => setVisitDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">방문 시각</label>
            <input value={visitTime} onChange={e => setVisitTime(e.target.value)} placeholder="오후 3시~4시"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">다음 연락 예정일</label>
            <input type="date" value={nextContactDate ?? ''} onChange={e => setNextContactDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">내용 *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
              placeholder="예) 다른 차량도 있으면 보고 싶음 / 예산 300-400 / 오후 3시~4시 방문"
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        {/* 상담 중엔 값을 어디에 적지 않고 보기만 한다 — 그래서 넣기 버튼 없이 띄운다 */}
        {priceOpen && <PriceCheckModal defaultQuery={vehicleName} onClose={() => setPriceOpen(false)} />}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">취소</button>
          <button onClick={handleSubmit} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}
