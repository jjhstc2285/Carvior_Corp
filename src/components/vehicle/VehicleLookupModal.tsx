import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { MapPin, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { withCommas } from '../../lib/money';
import {
  offerEligibility,
  SALE_STAGE_CLASS,
  SALE_STAGE_LABEL,
  saleStage,
  stockDeadline,
} from '../../lib/stockFinance';
import { CONSULTATION_STATUS_LABEL, PARKING_STATUS_LABEL, type ManagedVehicle } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 차량번호 하나로 그 차가 어디 있는지 찾는다.
 *
 * 지금은 차를 찾으려면 주차장 구역도, 재고금융, 상담, 매입을 한 화면씩 열어봐야 한다.
 * 마당에서 전화를 받으면서 그걸 다 열 수는 없다.
 *
 * 뒤 4자리만 쳐도 찾는다 — 무전으로 부를 때 앞자리까지 부르는 사람은 없다.
 */

/** 띄어쓰기가 섞여 들어오므로 지우고 견준다. */
const clean = (s: string) => s.replace(/\s+/g, '');

export default function VehicleLookupModal({ onClose }: { onClose: () => void }) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const { state } = useStore();
  const [query, setQuery] = useState('');
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);

  const load = useCallback(async () => {
    try {
      setVehicles(await api<ManagedVehicle[]>('/vehicles'));
    } catch {
      // 차량 관리에 없어도 주차·상담·매입 쪽은 보여줄 수 있다 — 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 두 글자부터 찾는다. 한 글자로는 온 목록이 다 걸려 아무 도움이 안 된다.
  const q = clean(query);
  const hits = useMemo(() => {
    if (q.length < 2) return [];

    const plates = new Set<string>();
    const add = (n: string) => {
      if (clean(n).includes(q)) plates.add(clean(n));
    };
    vehicles.forEach(v => add(v.vehicleNumber));
    state.parkingVehicles.forEach(p => add(p.vehicleNumber));
    state.consultations.forEach(c => add(c.vehicleNumber));
    state.purchaseSettlements.forEach(s => add(s.vehicleNumber));

    return [...plates].slice(0, 20).map(plate => ({
      plate,
      vehicle: vehicles.find(v => clean(v.vehicleNumber) === plate) ?? null,
      parked: state.parkingVehicles.find(p => clean(p.vehicleNumber) === plate) ?? null,
      // 그 차로 온 상담 중 가장 최근 것 — 지금 어느 단계인지가 궁금한 거다.
      consultation:
        state.consultations
          .filter(c => clean(c.vehicleNumber) === plate)
          .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null,
      settlement: state.purchaseSettlements.find(s => clean(s.vehicleNumber) === plate) ?? null,
    }));
  }, [q, vehicles, state.parkingVehicles, state.consultations, state.purchaseSettlements]);

  /** 재고금융 흐름에서 지금 어디쯤인지 — 재고금융 화면의 보기와 같은 기준이다. */
  const stockStep = (v: ManagedVehicle): string => {
    if (v.soldDate) return `매도 완료 · ${dayjs(v.soldDate).format('M월 D일')}`;
    if (v.cashVehicle) return '현금차량';
    if (v.stockCapital && v.stockAmount > 0 && v.repayDate) {
      return `재고차량 · ${v.stockCapital} ${withCommas(v.stockAmount)}원 · ${dayjs(v.repayDate).format('M/D')} 상환`;
    }
    if (v.offerDate && v.transferDate) return '제시함 — 재고 내용을 채워야 합니다';
    if (v.offerDate) return '제시함 진행 중 — 이전일자를 적어야 합니다';
    const e = offerEligibility(v);
    if (e.ok === false) return `제시 불가 · ${e.reason}`;
    if (e.ok === 'check') return `제시 대상 · ${e.reason}`;
    return e.ok === true ? `제시 대상 · ${e.age}년차` : `제시 대상 · ${e.reason}`;
  };

  /*
   * body 에 붙여 그린다.
   *
   * 상단바가 backdrop-blur 를 쓰는데, 흐림 효과가 걸린 요소 안에서는 fixed 가
   * 화면이 아니라 그 요소를 기준으로 잡힌다. 그래서 헤더 안에 갇혀 찌그러졌다.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">차량 조회</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">차량번호로 그 차가 지금 어디 있는지 봅니다. 뒤 4자리만 쳐도 됩니다.</p>

        <div className="relative mt-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="7356"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {q.length < 2 ? (
          <p className="py-10 text-center text-sm text-slate-400">차량번호를 두 자리 이상 입력해 주세요.</p>
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            찾는 차가 없습니다. 주차장 · 차량 관리 · 상담 · 매입 정산 어디에도 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {hits.map(hit => {
              const stage = hit.vehicle ? saleStage(hit.vehicle) : null;
              const deadline = hit.vehicle?.firstRegisteredOn ? stockDeadline(hit.vehicle.firstRegisteredOn) : null;
              return (
                <div key={hit.plate} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {hit.vehicle?.vehicleNumber ?? hit.plate}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {hit.vehicle?.vehicleModel || hit.parked?.vehicleModel || hit.consultation?.vehicleName || ''}
                    </span>
                    {stage && (
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${SALE_STAGE_CLASS[stage]}`}>
                        {SALE_STAGE_LABEL[stage]}
                      </span>
                    )}
                  </div>

                  {/* 제일 궁금한 건 마당 어디에 있느냐다 — 맨 위에 크게 둔다 */}
                  <div className="mt-2.5 flex items-start gap-1.5">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-indigo-600" />
                    {hit.parked ? (
                      <p className="text-sm">
                        <b className="text-indigo-700">
                          {hit.parked.lot} {hit.parked.zone} {hit.parked.slot}
                        </b>
                        <span className="ml-1.5 text-xs text-slate-500">
                          {PARKING_STATUS_LABEL[hit.parked.status]}
                          {hit.parked.memo && ` · ${hit.parked.memo}`}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">
                        주차 구역도에 없습니다
                        {hit.vehicle?.soldDate && ' — 출고된 차입니다'}
                      </p>
                    )}
                  </div>

                  <dl className="mt-2.5 grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-2.5 text-xs sm:grid-cols-2">
                    {hit.vehicle && (
                      <div className="sm:col-span-2">
                        <dt className="text-slate-400">재고금융</dt>
                        <dd className="text-slate-700">
                          {stockStep(hit.vehicle)}
                          {deadline && (
                            <span className={`ml-1.5 font-semibold ${deadline.passed ? 'text-red-600' : 'text-emerald-700'}`}>
                              {deadline.passed ? `${deadline.date} 만료` : `${deadline.date}까지`}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                    {hit.consultation && (
                      <div>
                        <dt className="text-slate-400">최근 상담</dt>
                        <dd className="text-slate-700">
                          {dayjs(hit.consultation.date).format('M월 D일')} ·{' '}
                          {CONSULTATION_STATUS_LABEL[hit.consultation.status]}
                        </dd>
                      </div>
                    )}
                    {hit.settlement && (
                      <div>
                        <dt className="text-slate-400">매입 정산</dt>
                        <dd className="text-slate-700">
                          매입 {withCommas(hit.settlement.purchasePrice)}원
                          {hit.settlement.salePrice > 0 && ` · 판매 ${withCommas(hit.settlement.salePrice)}원`}
                        </dd>
                      </div>
                    )}
                    {!hit.vehicle && (
                      <div className="sm:col-span-2">
                        <dt className="text-slate-400">차량 관리</dt>
                        <dd className="text-amber-700">
                          등록돼 있지 않습니다 — 재고금융 제시 대상에도 안 뜹니다
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
