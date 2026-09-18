import { Controller, Get, Injectable, Logger, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly } from '../common/date.util';
import { matchSlots, missingFromBoard, tailOf, type BoardSlot, type StockVehicle } from './parkboard.rules';

/**
 * 주차위치 현황판 읽어오기.
 *
 * 현장에서는 따로 만든 현황판 앱(anyone-key.netlify.app)에 차를 세운 자리와 키번호를
 * 적는다. 같은 차를 두 군데 적고 있어서 — 재검 날짜도, 엔카 사진 찍은 것도 — 그쪽을
 * 읽어다 우리 재고와 맞춰 보여준다.
 *
 * 읽기만 한다. 저쪽 Firebase 는 잠금이 없어서 주소만 알면 누구나 고치고 지울 수 있다.
 * 우리가 쓸 수 있다는 건 우리 실수로 저쪽을 날릴 수도 있다는 뜻이라, 쓰기는 하지 않는다.
 *
 * 저장도 하지 않는다 — 우리 DB에 받아 두면 어느 쪽이 맞는지 다투게 된다. 볼 때마다
 * 읽어서 맞춰본다. 1분은 같은 걸 다시 안 읽는다(현황판은 몇 분 단위로 바뀐다).
 */

/** 키 불출은 몇 분 단위로 생긴다 — 너무 자주 읽어도 의미가 없다 */
const CACHE_MS = 60 * 1000;
const TIMEOUT_MS = 8000;

/*
  어느 Firebase 를 보는가.

  현장 앱이 2026-09 에 anyone-4e3c6 에서 kp-system-8e4eb 으로 옮겨갔다(주소도 netlify 에서
  github.io 로 바뀌었다). 옛 쪽은 8/12 에서 기록이 멈춰 있다. 또 옮길 수 있으니 .env 로
  바꿀 수 있게 두고, 기본값만 지금 쓰는 곳으로 맞춘다.
*/
function boardUrl(): string {
  return (process.env.PARKBOARD_URL ?? 'https://kp-system-8e4eb-default-rtdb.firebaseio.com').replace(/\/+$/, '');
}

function boardCode(): string {
  return (process.env.PARKBOARD_CODE ?? 'hangyul2024').trim();
}

@Injectable()
export class ParkBoardService {
  private readonly logger = new Logger(ParkBoardService.name);
  private cache: { at: number; slots: Record<string, BoardSlot> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 현황판 칸 전부. 못 읽으면 예외 대신 빈 값을 주고 화면에서 '못 읽음'으로 보여준다. */
  private async fetchSlots(): Promise<{ slots: Record<string, BoardSlot>; error: string }> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return { slots: this.cache.slots, error: '' };
    }

    const url = `${boardUrl()}/kd_rooms/${encodeURIComponent(boardCode())}/pb_slots.json`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`현황판이 ${res.status} 로 답했습니다`);
      const json = (await res.json()) as Record<string, BoardSlot> | null;
      const slots = json && typeof json === 'object' ? json : {};
      this.cache = { at: Date.now(), slots };
      return { slots, error: '' };
    } catch (e) {
      const message = (e as Error).name === 'AbortError' ? '현황판이 응답하지 않습니다' : (e as Error).message;
      this.logger.warn(`현황판 읽기 실패: ${message}`);
      // 앞서 읽어둔 게 있으면 그거라도 보여준다 — 아무것도 안 보이는 것보다 낫다
      return { slots: this.cache?.slots ?? {}, error: message };
    }
  }

  /** 방 안의 아무 가지나 하나 읽는다 — 없으면 null */
  private async fetchNode<T>(node: string): Promise<T | null> {
    const url = `${boardUrl()}/kd_rooms/${encodeURIComponent(boardCode())}/${node}.json`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`현황판이 ${res.status} 로 답했습니다`);
      return (await res.json()) as T | null;
    } catch (e) {
      this.logger.warn(`${node} 읽기 실패: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async stock(): Promise<StockVehicle[]> {
    const rows = await this.prisma.managedVehicle.findMany({
      select: {
        id: true,
        vehicleNumber: true,
        plateTail: true,
        vehicleModel: true,
        soldDate: true,
        transferDate: true,
        lastInspectedOn: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      soldDate: r.soldDate ? formatDateOnly(r.soldDate) : null,
      transferDate: r.transferDate ? formatDateOnly(r.transferDate) : null,
      lastInspectedOn: r.lastInspectedOn ? formatDateOnly(r.lastInspectedOn) : null,
    }));
  }

  /** 현황판 + 우리 재고를 맞춰본 결과 */
  async view() {
    const [{ slots, error }, stock] = await Promise.all([this.fetchSlots(), this.stock()]);
    const matched = matchSlots(slots, stock);
    const missing = missingFromBoard(matched, stock);

    return {
      connected: !error,
      error,
      readAt: new Date().toISOString(),
      /* 어느 방을 보고 있는지 — 코드가 바뀌면 빈 화면이 나오니 화면에 적어 둔다 */
      room: boardCode(),
      slots: matched,
      missing,
      summary: {
        onBoard: matched.length,
        matched: matched.filter((s) => s.match === 'matched').length,
        ambiguous: matched.filter((s) => s.match === 'ambiguous').length,
        unknown: matched.filter((s) => s.match === 'unknown').length,
        soldButParked: matched.filter((s) => s.soldButParked).length,
        missing: missing.length,
      },
    };
  }

  /**
   * 현황판에 '사진 완료'로 찍힌 차.
   *
   * 광고 관리에서 엔카 진단 대수를 손으로 넣고 있는데, 찍은 날짜까지 현황판에 이미 적혀
   * 있다. 그걸 그대로 넣지는 않는다 — 4자리만 보고 붙이면 엉뚱한 차가 들어간다.
   * 후보만 뽑아 주고 넣는 건 사람이 한다.
   */
  async encarDone(month: string) {
    const { slots, error } = await this.fetchSlots();
    const stock = await this.stock();
    const matched = matchSlots(slots, stock);

    const rows = matched
      .filter((s) => s.encarDone && s.encarDoneDate)
      .filter((s) => !month || s.encarDoneDate.startsWith(month))
      .sort((a, b) => b.encarDoneDate.localeCompare(a.encarDoneDate));

    return {
      connected: !error,
      error,
      month,
      rows: rows.map((s) => ({
        car: s.car,
        keyNo: s.keyNo,
        memo: s.memo,
        doneDate: s.encarDoneDate,
        match: s.match,
        vehicleNumber: s.vehicleNumber,
        vehicleModel: s.vehicleModel,
        candidates: s.candidates,
      })),
    };
  }
  /**
   * 키 불출 이력.
   *
   * 딜러가 QR 로 키를 달라고 하면 그 앱에 한 줄이 쌓인다 — 누가(이름·번호·소속 상사),
   * 어느 차를, 언제, 어디서(실내·외부) 가져갔는지. 돌려주면 반납으로 찍힌다.
   *
   * 그 앱은 마지막 50건만 들고 있다. 그 앞은 지워져서 우리가 읽을 수 없다 —
   * 오래 남겨야 하면 그 앱 쪽을 고쳐야 한다.
   *
   * 차량번호는 여기서도 뒤 4자리뿐이라 재고와 하나로 안 붙을 수 있다. 붙은 것만
   * 전체 번호를 같이 내려주고, 아니면 4자리 그대로 둔다.
   */
  async keys(limit: number) {
    const [hist, returned, returnLoc, memos, stock] = await Promise.all([
      this.fetchNode<Record<string, KeyEntry> | KeyEntry[]>('hist'),
      this.fetchNode<string[] | Record<string, string>>('returned'),
      this.fetchNode<Record<string, string>>('returnLocMap'),
      this.fetchNode<Record<string, string>>('memos'),
      this.stock(),
    ]);

    if (!hist) return { connected: false, error: '키 불출 이력을 읽지 못했습니다', rows: [], summary: null };

    const entries = (Array.isArray(hist) ? hist : Object.values(hist)).filter(
      (e): e is KeyEntry => !!e && typeof e === 'object' && !!e.car,
    );

    const back = new Set(
      (Array.isArray(returned) ? returned : Object.values(returned ?? {})).map((v) => String(v)),
    );

    // 4자리로 재고를 찾는다 — 둘 이상 걸리면 어느 차인지 모르니 붙이지 않는다
    const byTail = new Map<string, StockVehicle[]>();
    for (const v of stock) {
      const t = v.plateTail || tailOf(v.vehicleNumber);
      if (!t) continue;
      byTail.set(t, [...(byTail.get(t) ?? []), v]);
    }

    const rows = entries
      .map((e) => {
        const id = String(e.id ?? '');
        const tail = tailOf(e.car ?? '');
        const hit = (byTail.get(tail) ?? []).filter((v) => !v.soldDate);
        const one = hit.length === 1 ? hit[0] : null;
        return {
          id,
          /* id 가 곧 시각이다(epoch ms). 앱이 적어둔 글자 시각은 '2026. 8. 12. 오후 1:56:50'
             꼴이라 그대로는 못 쓴다. */
          at: Number(id) > 0 ? new Date(Number(id)).toISOString() : '',
          car: e.car ?? '',
          dealer: e.name ?? '',
          phone: e.phone ?? '',
          company: e.pr ?? '',
          /** 조합 가입 여부 — 그 앱이 카모두에서 확인해 적어둔 문구 */
          dealerStatus: e.dealerStatus ?? '',
          union: (e.dealerStatus ?? '').includes('미가입') ? '미가입' : (e.dealerStatus ?? '').includes('가입') ? '가입' : '',
          loc: e.dispatchLoc ?? '',
          returned: back.has(id),
          returnLoc: returnLoc?.[id] ?? '',
          memo: memos?.[id] ?? '',
          vehicleNumber: one?.vehicleNumber ?? '',
          vehicleModel: one?.vehicleModel ?? '',
        };
      })
      // 늦은 것부터 — 방금 나간 키가 맨 위여야 한다
      .sort((a, b) => Number(b.id) - Number(a.id));

    const out = rows.filter((r) => !r.returned);
    return {
      connected: true,
      error: '',
      readAt: new Date().toISOString(),
      room: boardCode(),
      rows: limit > 0 ? rows.slice(0, limit) : rows,
      summary: {
        total: rows.length,
        out: out.length,
        /** 아직 안 돌려준 차 — 이게 지금 나가 있는 키다 */
        outCars: out.slice(0, 8).map((r) => r.vehicleNumber || r.car),
      },
    };
  }
}

/** 그 앱이 한 줄에 적어두는 것 */
interface KeyEntry {
  id?: number | string;
  car?: string;
  name?: string;
  phone?: string;
  pr?: string;
  timestamp?: string;
  dispatchLoc?: string;
  dealerStatus?: string;
}

/** 현황판은 현장 사람이 다 같이 본다 — 우리 쪽도 막을 이유가 없다. */
@Controller('parkboard')
export class ParkBoardController {
  constructor(private readonly board: ParkBoardService) {}

  @Get()
  view() {
    return this.board.view();
  }

  @Get('encar')
  encarDone(@Query('month') month = '') {
    return this.board.encarDone(month.trim());
  }

  /** 키 불출 이력 — 기본 30건. 0 을 주면 그 앱이 들고 있는 것 전부(50건) */
  @Get('keys')
  keys(@Query('limit') limit = '30') {
    return this.board.keys(Number(limit) || 0);
  }
}

@Module({
  controllers: [ParkBoardController],
  providers: [ParkBoardService],
  exports: [ParkBoardService],
})
export class ParkBoardModule {}
