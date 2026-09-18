import { Controller, Get, Injectable, Logger, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly } from '../common/date.util';
import { matchSlots, missingFromBoard, type BoardSlot, type StockVehicle } from './parkboard.rules';

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

const CACHE_MS = 60 * 1000;
const TIMEOUT_MS = 8000;

function boardUrl(): string {
  return (process.env.PARKBOARD_URL ?? 'https://anyone-4e3c6-default-rtdb.firebaseio.com').replace(/\/+$/, '');
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
}

@Module({
  controllers: [ParkBoardController],
  providers: [ParkBoardService],
  exports: [ParkBoardService],
})
export class ParkBoardModule {}
