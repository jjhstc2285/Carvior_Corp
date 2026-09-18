/**
 * 주차위치 현황판 맞춰보기 규칙.
 *
 * 현황판(anyone-key.netlify.app)은 따로 돌아가는 앱이다. 차량번호를 뒤 4자리만 적어서
 * '6678' 한 줄이 QM6일 수도 르노마스터일 수도 있다. 그래서 4자리가 같다고 바로 붙이지
 * 않는다 — 두 대 이상 걸리면 사람이 보라고 '확인 필요'로 빼 둔다.
 *
 * 읽기만 한다. 현황판에 아무것도 쓰지 않는다 — 저쪽은 잠금이 없어서, 우리가 쓸 수 있다는
 * 건 우리가 지울 수도 있다는 뜻이다. 맞춰보고 알려주는 데까지만 한다.
 */

/** 현황판 칸 하나 — Firebase 에 있는 그대로 */
export interface BoardSlot {
  car?: string;
  num?: string; // 키번호
  owner?: string; // 담당 딜러 — 자유 입력이라 우리 직원과 안 맞을 수 있다
  memo?: string;
  status?: string; // none / contract / product / sale
  disabled?: boolean;
  encar?: { date?: string; time?: string; done?: boolean; doneDate?: string };
  inspect?: { date?: string; done?: boolean };
}

/** 우리 재고 쪽에서 맞춰보는 데 쓰는 값만 */
export interface StockVehicle {
  id: string;
  vehicleNumber: string;
  plateTail: string;
  vehicleModel: string;
  soldDate: string | null;
  transferDate: string | null;
  lastInspectedOn: string | null;
}

export type MatchKind = 'matched' | 'ambiguous' | 'unknown' | 'empty';

export const MATCH_LABEL: Record<MatchKind, string> = {
  matched: '재고와 맞음',
  ambiguous: '확인 필요',
  unknown: '재고에 없음',
  empty: '빈 칸',
};

export const BOARD_STATUS_LABEL: Record<string, string> = {
  none: '',
  contract: '계약중',
  product: '상품화중',
  sale: '판매완료',
};

/** 숫자만 남긴 뒤 4자리 — 현황판은 '8429', 우리는 '12가8429' 로 적는다 */
export function tailOf(plate: string): string {
  const digits = (plate ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

/**
 * 현황판 메모에서 차종을 짐작한다.
 *
 * 메모는 '이서찬 /캡쳐', '트레일블레이저/이름KANVLADIMIR' 처럼 사람마다 적는 모양이 다르다.
 * 같은 4자리가 둘 이상일 때 차종이 겹치는 쪽을 고르는 데만 쓴다 — 이걸로 단정하지 않는다.
 */
export function looksLikeSameModel(memo: string, vehicleModel: string): boolean {
  const clean = (v: string) => (v ?? '').replace(/[\s/·]/g, '').toLowerCase();
  const m = clean(memo);
  const v = clean(vehicleModel);
  if (m.length < 2 || v.length < 2) return false;
  if (m.includes(v) || v.includes(m)) return true;
  // 차명이 길면 앞 두 글자만이라도 겹치는지 — '더뉴그랜저' 와 '그랜저'
  return v.length >= 3 && m.includes(v.slice(0, 3));
}

export interface MatchedSlot {
  key: string;
  car: string;
  tail: string;
  keyNo: string;
  owner: string;
  memo: string;
  status: string;
  statusLabel: string;
  disabled: boolean;
  /** 현황판이 적어둔 엔카 사진 */
  encarDone: boolean;
  encarDoneDate: string;
  encarReservedAt: string;
  /** 현황판이 적어둔 재검 예정일 */
  boardInspectOn: string;
  match: MatchKind;
  /** 붙은 차 — 확인 필요면 후보가 여럿이다 */
  vehicleId: string | null;
  vehicleNumber: string;
  vehicleModel: string;
  candidates: { id: string; vehicleNumber: string; vehicleModel: string }[];
  /** 우리는 매도로 끝냈는데 현황판엔 아직 서 있는 차 */
  soldButParked: boolean;
}

/**
 * 현황판 칸과 우리 재고를 맞춰본다.
 *
 * 4자리가 하나만 걸리면 붙이고, 둘 이상 걸리면 차종으로 한 번 더 걸러본다. 그래도
 * 하나로 안 좁혀지면 '확인 필요'다 — 엉뚱한 차에 붙는 것보다 사람이 보는 편이 낫다.
 */
export function matchSlots(board: Record<string, BoardSlot>, stock: StockVehicle[]): MatchedSlot[] {
  const byTail = new Map<string, StockVehicle[]>();
  for (const v of stock) {
    const t = v.plateTail || tailOf(v.vehicleNumber);
    if (!t) continue;
    const list = byTail.get(t) ?? [];
    list.push(v);
    byTail.set(t, list);
  }

  const out: MatchedSlot[] = [];
  for (const [key, slot] of Object.entries(board ?? {})) {
    if (!slot || typeof slot !== 'object') continue;
    const car = (slot.car ?? '').trim();
    if (!car || slot.disabled) continue; // 빈 칸과 사용안함 칸은 맞춰볼 게 없다

    const tail = tailOf(car);
    const all = tail ? (byTail.get(tail) ?? []) : [];
    // 매도로 끝난 차부터 걷어낸다 — 현황판에 남아 있으면 그건 그것대로 알려준다
    const live = all.filter((v) => !v.soldDate);
    let picked: StockVehicle[] = live.length > 0 ? live : all;

    if (picked.length > 1) {
      const byModel = picked.filter((v) => looksLikeSameModel(slot.memo ?? '', v.vehicleModel));
      if (byModel.length === 1) picked = byModel;
    }

    const match: MatchKind = picked.length === 1 ? 'matched' : picked.length > 1 ? 'ambiguous' : 'unknown';
    const one = picked.length === 1 ? picked[0] : null;

    out.push({
      key,
      car,
      tail,
      keyNo: (slot.num ?? '').trim(),
      owner: (slot.owner ?? '').trim(),
      memo: (slot.memo ?? '').trim(),
      status: slot.status ?? 'none',
      statusLabel: BOARD_STATUS_LABEL[slot.status ?? 'none'] ?? '',
      disabled: !!slot.disabled,
      encarDone: !!slot.encar?.done,
      encarDoneDate: slot.encar?.doneDate ?? '',
      encarReservedAt: slot.encar?.date ? `${slot.encar.date} ${slot.encar.time ?? ''}`.trim() : (slot.encar?.time ?? ''),
      boardInspectOn: slot.inspect?.date ?? '',
      match,
      vehicleId: one?.id ?? null,
      vehicleNumber: one?.vehicleNumber ?? '',
      vehicleModel: one?.vehicleModel ?? '',
      candidates: picked.map((v) => ({ id: v.id, vehicleNumber: v.vehicleNumber, vehicleModel: v.vehicleModel })),
      soldButParked: !!one?.soldDate,
    });
  }

  // 키번호 순 — 현장에서 키번호로 찾는다
  return out.sort((a, b) => (Number(a.keyNo) || 9999) - (Number(b.keyNo) || 9999));
}

/**
 * 우리 재고에는 있는데 현황판에 안 보이는 차.
 *
 * 현황판에 없으면 그 차가 어디 서 있는지 아무도 모른다는 뜻이다 — 외부 주차장에 있거나,
 * 현황판에 적는 걸 빠뜨린 것이다.
 */
export function missingFromBoard(slots: MatchedSlot[], stock: StockVehicle[]) {
  const onBoard = new Set(slots.map((s) => s.tail).filter(Boolean));
  return stock
    .filter((v) => !v.soldDate)
    .filter((v) => !onBoard.has(v.plateTail || tailOf(v.vehicleNumber)))
    .map((v) => ({ id: v.id, vehicleNumber: v.vehicleNumber, vehicleModel: v.vehicleModel }));
}
