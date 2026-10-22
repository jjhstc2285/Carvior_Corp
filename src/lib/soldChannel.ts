import type { BrokerageSettlement, ConsultationRecord } from '../types';
import { effectiveKind } from './consultationStats';

/**
 * 그 차가 어떻게 팔렸나.
 *
 * 매입 정산에는 얼마에 샀고 얼마에 팔았는지만 있고, 어느 길로 나갔는지는 없었다. 그런데
 * 그게 돈이 어디로 갔는지를 가른다 — 수출로 나간 차, 남의 딜러가 팔아 준 차, 우리 딜러가
 * 판 차는 수익도 다음 할 일도 다르다.
 *
 * 따로 적는 칸을 만들지 않는다. 이미 적힌 것으로 알 수 있다 — 정산이 있으면 그 종류가,
 * 없으면 상담 종류가 말해 준다. 칸을 하나 더 만들면 적는 사람이 또 생기고, 두 값이
 * 어긋나면 어느 쪽이 맞는지 알 수 없게 된다.
 */

export type SoldChannel = 'EXPORT' | 'BROKERAGE' | 'OUTSIDE' | 'OWN' | 'UNKNOWN';

export const SOLD_CHANNEL_LABEL: Record<SoldChannel, string> = {
  EXPORT: '수출',
  BROKERAGE: '알선',
  OUTSIDE: '타 딜러',
  OWN: '우리 딜러',
  UNKNOWN: '모름',
};

export const SOLD_CHANNEL_TONE: Record<SoldChannel, string> = {
  EXPORT: 'bg-sky-50 text-sky-700',
  BROKERAGE: 'bg-emerald-50 text-emerald-700',
  OUTSIDE: 'bg-amber-50 text-amber-800',
  OWN: 'bg-indigo-50 text-indigo-700',
  UNKNOWN: 'bg-slate-100 text-slate-400',
};

export const SOLD_CHANNEL_HINT: Record<SoldChannel, string> = {
  EXPORT: '수출 정산이 있습니다 — 수출로 나간 차입니다',
  BROKERAGE: '알선 정산이 있습니다 — 차주 차를 우리가 중개해 판 건입니다',
  OUTSIDE: '남의 딜러가 우리 상사 차를 팔아 준 건입니다 — 우리 딜러는 정산을 받지 않습니다',
  OWN: '우리 딜러가 우리 상사 차를 판 건입니다',
  UNKNOWN: '정산도 상담도 없어서 어떻게 팔렸는지 알 수 없습니다',
};

const plate = (v?: string | null) => (v ?? '').replace(/\s+/g, '').trim();

/**
 * 차량번호로 판매 경로를 찾아 주는 함수를 만든다.
 *
 * 줄마다 정산과 상담을 통째로 뒤지면 백 줄 × 수천 건이 된다 — 한 번 묶어 두고 집어 쓴다.
 *
 * 정산이 상담보다 먼저다. 돈이 오간 자리에 적힌 종류가 더 믿을 만하고, 상담은 등록할 때
 * 고른 값이라 나중에 수출로 돌아선 건이 알선으로 남아 있기도 하다.
 *
 * 상담이 여럿이면 최근 것을 본다 — 처음 문의가 아니라 실제로 판 건이 궁금한 값이다.
 */
export function soldChannelLookup(
  settlements: Pick<BrokerageSettlement, 'vehicleNumber' | 'kind'>[],
  consultations: ConsultationRecord[],
): (vehicleNumber: string) => SoldChannel {
  const fromSettlement = new Map<string, SoldChannel>();
  for (const s of settlements) {
    const key = plate(s.vehicleNumber);
    if (!key) continue;
    // 한 차에 수출과 알선이 둘 다 있으면 수출이 이긴다 — 나라 밖으로 나간 건 되돌지 않는다
    if (s.kind === 'EXPORT') fromSettlement.set(key, 'EXPORT');
    else if (!fromSettlement.has(key)) fromSettlement.set(key, 'BROKERAGE');
  }

  const fromConsultation = new Map<string, SoldChannel>();
  for (const c of [...consultations].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = plate(c.vehicleNumber);
    if (!key) continue;
    const kind = effectiveKind(c);
    fromConsultation.set(
      key,
      kind === 'EXPORT'
        ? 'EXPORT'
        : kind === 'BROKERAGE'
          ? 'BROKERAGE'
          : // 기타·타사는 우리 차가 아니다 — 남의 딜러·상사가 파는 건이다
            kind === 'OTHER' || kind === 'PARTNER'
            ? 'OUTSIDE'
            : 'OWN',
    );
  }

  return (vehicleNumber: string) => {
    const key = plate(vehicleNumber);
    return fromSettlement.get(key) ?? fromConsultation.get(key) ?? 'UNKNOWN';
  };
}
