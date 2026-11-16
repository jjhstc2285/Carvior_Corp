import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertSuccess } from '../../lib/alert';
import { useEscClose } from '../../lib/useEscClose';
import { digitsOnly } from '../../lib/money';
import type { PurchaseIntake } from '../../types';

/**
 * 카비어 평가사에게 검차를 맡긴다.
 *
 * 지금까지는 직원이 후레시 들고 직접 차를 보러 갔다(옆의 검차 체크바가 그걸 적는 자리다).
 * 멀거나 바쁘면 평가사가 대신 간다 — 같은 항목을 보고 리포트를 올려 준다.
 *
 * 누르면 **진단비가 상사 청구액에 올라간다.** 그래서 관리자만 열 수 있고(서버도 같은
 * 기준으로 다시 본다), 창을 열 때 이미 맡긴 차인지 먼저 확인한다.
 *
 * 시간은 아무 때나 적어 보내지 않는다 — 그 주소·그 날에 실제로 갈 수 있는 평가사가 있는
 * 시간만 고르게 한다. 아무 때나 보내면 접수는 되지만 배정이 안 돼서 하루를 버린다.
 */

interface Slot {
  time: string;
  available: boolean;
}

interface SlotsResponse {
  /** false면 그 주소를 담당하는 평가사가 아예 없다 — 시간 문제가 아니다 */
  regionCovered: boolean;
  slots: Slot[];
}

interface OrderResult {
  id: number;
  carNumber: string;
  statusLabel: string;
  assignedDriverName: string | null;
  needsPartnerSetup: boolean;
}

interface Props {
  item: PurchaseIntake;
  onClose: () => void;
  /** 맡기고 나서 목록을 다시 받게 — 리포트 링크가 나중에 여기로 들어온다 */
  onOrdered: () => void;
}

const FIELD =
  'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';
const LABEL = 'text-[11px] font-semibold text-slate-500';

/** 오늘 말고 내일을 기본값으로 — 오늘 가 달라는 건 전화로 할 일이다 */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function InspectionOrderModal({ item, onClose, onOrdered }: Props) {
  useEscClose(onClose);

  const [address, setAddress] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState('');
  const [contact, setContact] = useState('');
  const [carOwner, setCarOwner] = useState(item.customerName ?? '');
  const [customerContact, setCustomerContact] = useState(item.customerPhone ?? '');
  const [memo, setMemo] = useState('');

  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carNumber = (item.vehicleNumber ?? '').trim();

  // 창을 열 때 한 번 — 이미 맡긴 차를 또 맡기면 평가사가 두 명 가고 진단비도 두 번 나간다.
  useEffect(() => {
    if (!carNumber) return;
    let alive = true;
    void api<{ isDuplicate: boolean }>(`/carvior/check-duplicate?carNumber=${encodeURIComponent(carNumber)}`)
      .then(r => alive && setDuplicate(r.isDuplicate))
      // 확인을 못 한 것과 "중복 아님"은 다르다. 막지는 않고 저쪽에서 한 번 더 걸러낸다.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [carNumber]);

  /*
    주소·날짜가 정해지면 갈 수 있는 시간을 받아 온다.

    주소는 타이핑하는 중에도 바뀌어서, 글자를 칠 때마다 치면 요청이 수십 번 나간다.
    마지막으로 멈춘 뒤 600ms만 기다린다. 요청 순서가 뒤바뀌어 옛 응답이 나중에
    도착하는 일도 있어서 요청 번호로 마지막 것만 받는다.
  */
  const reqId = useRef(0);
  const loadSlots = useCallback(async (addr: string, day: string) => {
    const my = ++reqId.current;
    setSlotsLoading(true);
    try {
      const r = await api<SlotsResponse>(
        `/carvior/available-slots?address=${encodeURIComponent(addr)}&date=${encodeURIComponent(day)}`,
      );
      if (my === reqId.current) setSlots(r);
    } catch {
      if (my === reqId.current) setSlots(null);
    } finally {
      if (my === reqId.current) setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    const addr = address.trim();
    if (addr.length < 4 || !date) {
      setSlots(null);
      return;
    }
    const t = setTimeout(() => void loadSlots(addr, date), 600);
    return () => clearTimeout(t);
  }, [address, date, loadSlots]);

  // 주소나 날짜가 바뀌면 고른 시간은 더 이상 유효하지 않다 — 비워서 다시 고르게 한다
  useEffect(() => setTime(''), [address, date]);

  const submit = async () => {
    const missing = [
      !carNumber && '차량번호',
      !address.trim() && '차량 위치',
      !date && '날짜',
      !time && '시간',
      !contact.trim() && '신청자 연락처',
    ].filter(Boolean) as string[];
    if (missing.length) {
      setError(`${missing.join(', ')}을 채워 주세요.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api<OrderResult>('/carvior/inspection-request', {
        method: 'POST',
        body: {
          carNumber,
          carModel: item.vehicleName || undefined,
          address: address.trim(),
          detailAddress: detailAddress.trim() || undefined,
          // 저쪽이 쓰는 형식 그대로 — "2026-11-20 14:00"
          preferredDateTime: `${date} ${time}`,
          contact: contact.trim(),
          dealerContact: contact.trim(),
          carOwner: carOwner.trim() || undefined,
          customerContact: customerContact.trim() || undefined,
          additionalMemo: memo.trim() || undefined,
        },
      });

      await alertSuccess(
        `${res.carNumber} 검차를 맡겼습니다`,
        res.needsPartnerSetup
          ? '다만 카비어에 우리 발주사 계정이 없어서 평가사 배정이 보류됐습니다. 카비어 담당자에게 계정 등록을 요청해 주세요.'
          : res.assignedDriverName
            ? `${res.assignedDriverName} 평가사가 배정됐습니다. 리포트가 올라오면 알림톡이 옵니다.`
            : `${res.statusLabel} — 평가사가 배정되면 알림톡이 옵니다.`,
      );
      onOrdered();
      onClose();
    } catch (e) {
      // 저쪽이 보낸 이유를 그대로 보여준다("이미 진단이 진행 중입니다" 같은 것) —
      // 적어 넣은 내용은 그대로 두고 고칠 수 있게 창을 닫지 않는다.
      setError(e instanceof ApiError ? e.message : '맡기지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const openSlots = slots?.slots.filter(s => s.available) ?? [];

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800">
            <Search size={16} className="text-indigo-600" /> 평가사에게 검차 맡기기
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span className="font-mono text-sm font-bold text-slate-800">{carNumber || '차량번호 없음'}</span>
          <span className="text-xs text-slate-500">{item.vehicleName || '차명 없음'}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          직접 보러 가는 대신 카비어 평가사가 가서 진단 리포트를 올려 줍니다. <b>진단비가 청구에 올라갑니다.</b>
        </p>

        {duplicate && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            이 차량은 이미 카비어에 진단이 접수돼 있습니다. 또 맡기면 평가사가 두 번 가고 진단비도 두 번 나갑니다.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className={LABEL}>차량 위치 (주소) *</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="평가사가 찾아갈 주소 — 차주 위치 또는 단지 주소"
              className={`${FIELD} mt-1`}
            />
            <input
              value={detailAddress}
              onChange={e => setDetailAddress(e.target.value)}
              placeholder="상세 주소 (동·호수, 주차 위치 등)"
              className={`${FIELD} mt-1.5`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>날짜 *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${FIELD} mt-1`} />
            </div>
            <div>
              <label className={LABEL}>신청자 연락처 *</label>
              <input
                value={contact}
                onChange={e => setContact(digitsOnly(e.target.value).slice(0, 11))}
                placeholder="01012345678"
                inputMode="numeric"
                className={`${FIELD} mt-1`}
              />
            </div>
          </div>

          {/* 시간 — 그 주소·그 날에 갈 수 있는 평가사가 있는 칸만 누를 수 있다 */}
          <div>
            <label className={LABEL}>시간 *</label>
            {address.trim().length < 4 ? (
              <p className="mt-1 text-[11px] text-slate-400">주소를 먼저 적어 주세요.</p>
            ) : slotsLoading ? (
              <p className="mt-1 text-[11px] text-slate-400">갈 수 있는 시간을 확인하는 중…</p>
            ) : !slots ? (
              <p className="mt-1 text-[11px] text-slate-400">시간을 확인하지 못했습니다. 주소를 다시 확인해 주세요.</p>
            ) : !slots.regionCovered ? (
              <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-600">
                <AlertTriangle size={13} className="mt-px shrink-0" />
                이 지역을 담당하는 평가사가 없습니다. 카비어 담당자에게 문의해 주세요.
              </p>
            ) : openSlots.length === 0 ? (
              <p className="mt-1 text-[11px] font-medium text-amber-700">
                그 날은 갈 수 있는 평가사가 없습니다. 다른 날짜를 골라 주세요.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {slots.slots.map(s => (
                  <button
                    key={s.time}
                    disabled={!s.available}
                    onClick={() => setTime(s.time)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      time === s.time
                        ? 'border-indigo-500 bg-indigo-600 font-bold text-white'
                        : s.available
                          ? 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                          : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                    }`}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>차주 이름</label>
              <input value={carOwner} onChange={e => setCarOwner(e.target.value)} className={`${FIELD} mt-1`} />
            </div>
            <div>
              <label className={LABEL}>차주 연락처</label>
              <input
                value={customerContact}
                onChange={e => setCustomerContact(digitsOnly(e.target.value).slice(0, 11))}
                inputMode="numeric"
                className={`${FIELD} mt-1`}
              />
            </div>
          </div>
          <p className="-mt-1.5 text-[10px] text-slate-400">
            차주 번호는 평가사가 방문 약속을 잡을 때 씁니다. 리포트는 차주가 아니라 <b>우리에게</b> 옵니다.
          </p>

          <div>
            <label className={LABEL}>평가사에게 전할 말</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={2}
              placeholder="예) 지하 2층 B구역 주차, 블랙박스 선 빼 둠, 판금 자리 꼼꼼히 봐 주세요"
              className={`${FIELD} mt-1 resize-none`}
            />
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? '맡기는 중…' : '검차 맡기기'}
          </button>
        </div>
      </div>
    </div>
  );
}
