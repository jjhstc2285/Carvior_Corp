import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useStore } from '../store';
import { soldChannelLookup, type SoldChannel } from './soldChannel';
import type { ConsultationKind } from '../types';

/**
 * 그 차가 어떻게 팔렸나 — 화면 여럿이 같이 쓴다.
 *
 * 알선·수출 정산 목록은 본인 것만 내려온다(서버 ownScope). 그래서 그 목록으로 가려내면
 * 남이 적은 수출 건이 안 보이고, 같은 줄이 사무장 화면에는 '수출', 다른 사람 화면에는
 * '모름'으로 뜬다 — 한 줄이 사람마다 다르게 뜨면 아무도 그 칸을 안 믿는다.
 *
 * 차량번호와 종류만 따로 받아 온다. 금액은 안 받는다 — 어디로 나갔는지만 알면 되는
 * 칸이라 수수료·입금액까지 열 까닭이 없다.
 *
 * 못 받아 오면 들고 있는 목록으로 돈다. 정산이 없는 차는 상담 종류가 말해 준다.
 */
export function useSoldChannels(): (vehicleNumber: string) => SoldChannel {
  const { state } = useStore();
  const [channels, setChannels] = useState<{ vehicleNumber: string; kind: ConsultationKind }[] | null>(null);

  useEffect(() => {
    void api<{ vehicleNumber: string; kind: ConsultationKind }[]>('/settlements/brokerage/channels')
      .then(setChannels)
      .catch(() => setChannels(null));
  }, []);

  /* 줄마다 뒤지면 백 줄 × 수천 건이라 한 번 묶어 둔다 */
  return useMemo(
    () => soldChannelLookup(channels ?? state.brokerageSettlements, state.consultations),
    [channels, state.brokerageSettlements, state.consultations],
  );
}

/**
 * 그 차를 누가 팔았나.
 *
 * 상담에서 찾는다 — 차를 판 사람이 상담을 받은 사람이다. 계약·판매완료로 찍힌 건이
 * 먼저고, 없으면 가장 최근 상담의 담당자를 쓴다(아직 진행 중이면 그 사람이 들고 있다).
 *
 * 타사·기타는 우리 직원이 아니다. 담당자 자리에 남의 딜러·상사 이름이 적혀 있어서
 * 그걸 그대로 쓴다 — 직원 목록에서 찾으면 아무것도 안 나온다.
 */
export function useSoldDealer(): (vehicleNumber: string) => string {
  const { state } = useStore();

  return useMemo(() => {
    const plate = (v?: string | null) => (v ?? '').replace(/\s+/g, '').trim();
    const byPlate = new Map<string, string>();

    /* 늦은 것부터 본다 — 먼저 넣은 값을 안 덮게 해서 '가장 최근'이 남는다 */
    const sorted = [...state.consultations].sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.time ?? '').localeCompare(a.time ?? ''),
    );

    const put = (c: (typeof sorted)[number]) => {
      const key = plate(c.vehicleNumber);
      if (!key || byPlate.has(key)) return;
      const outside = (c.outsideDealer ?? '').trim();
      const name = outside || state.employees.find(e => e.id === c.employeeId)?.name || '';
      if (name) byPlate.set(key, name);
    };

    // 판 건이 먼저다 — 문의만 하고 만 상담의 담당자를 '판 사람'으로 적으면 안 된다
    for (const c of sorted) if (c.status === 'SOLD' || c.status === 'CONTRACTED') put(c);
    for (const c of sorted) put(c);

    return (vehicleNumber: string) => byPlate.get(plate(vehicleNumber)) ?? '';
  }, [state.consultations, state.employees]);
}
