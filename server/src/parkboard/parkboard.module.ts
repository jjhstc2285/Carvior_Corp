import {
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Query,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly } from '../common/date.util';
import { matchSlots, missingFromBoard, plateKey, tailOf, type BoardSlot, type StockVehicle } from './parkboard.rules';
import { TelegramService } from '../telegram/telegram.module';

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
  어느 방을 보는가.

  그 앱은 한 Firebase 안에 상사마다 '방'을 두고 나눠 쓴다. 우리 방은 anyone9569 이고,
  hangyul2024 는 한결모터스 방이다 — 앱을 만든 쪽 기본값이라 그대로 두면 남의 재고를
  보게 된다. 방 코드는 키불출 화면 메모에 적히는 약도 주소(view-v6...?c=)에 들어 있다.

  옮길 수 있으니 .env(PARKBOARD_URL·PARKBOARD_CODE)로 바꿀 수 있게 둔다.
*/
function boardUrl(): string {
  return (process.env.PARKBOARD_URL ?? 'https://anyone-4e3c6-default-rtdb.firebaseio.com').replace(/\/+$/, '');
}

function boardCode(): string {
  return (process.env.PARKBOARD_CODE ?? 'anyone9569').trim();
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
  /** 지켜보는 쪽이 다른 칸도 읽을 수 있게 연다 — 읽기 전용이다 */
  async rawNode<T>(node: string): Promise<T | null> {
    return this.fetchNode<T>(node);
  }

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
    const [hist, returned, returnLoc, memos, scans, stock] = await Promise.all([
      this.fetchNode<Record<string, KeyEntry> | KeyEntry[]>('hist'),
      this.fetchNode<string[] | Record<string, string>>('returned'),
      this.fetchNode<Record<string, string>>('returnLocMap'),
      this.fetchNode<Record<string, string>>('memos'),
      /* 딜러가 약도 QR 을 열어본 시각 — 위치를 봤는지 안 봤는지가 여기 남는다 */
      this.fetchNode<Record<string, { at?: number; car?: string }>>('dispatch_scan'),
      this.stock(),
    ]);

    if (!hist) return { connected: false, error: '키 불출 이력을 읽지 못했습니다', rows: [], summary: null };

    const entries = (Array.isArray(hist) ? hist : Object.values(hist)).filter(
      (e): e is KeyEntry => !!e && typeof e === 'object' && !!e.car,
    );

    const back = new Set(
      (Array.isArray(returned) ? returned : Object.values(returned ?? {})).map((v) => String(v)),
    );

    // 전체 번호가 적혀 있으면 그걸로, 아니면 4자리로 찾는다. 둘 이상 걸리면 안 붙인다
    const byPlate = new Map<string, StockVehicle>();
    const byTail = new Map<string, StockVehicle[]>();
    for (const v of stock) {
      byPlate.set(plateKey(v.vehicleNumber), v);
      const t = v.plateTail || tailOf(v.vehicleNumber);
      if (!t) continue;
      byTail.set(t, [...(byTail.get(t) ?? []), v]);
    }

    const rows = entries
      .map((e) => {
        const id = String(e.id ?? '');
        const tail = tailOf(e.car ?? '');
        const exact = byPlate.get(plateKey(e.car ?? ''));
        const hit = exact ? [exact] : (byTail.get(tail) ?? []).filter((v) => !v.soldDate);
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
          /**
           * 딜러가 약도(QR)를 열어본 때.
           *
           * 키를 내주면서 차 세워둔 자리를 알려주는 링크를 QR·문자로 보낸다. 딜러가 그걸
           * 열면 그 시각이 남는다 — 안 열렸으면 아직 차를 못 찾고 있을 수 있다.
           */
          scannedAt: scans?.[id]?.at ? new Date(scans[id].at as number).toISOString() : '',
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


/* ── 키 불출 지켜보기 ──────────────────────────
   저쪽은 웹훅을 안 준다. 이쪽에서 몇 분마다 물어본다. */

/** 몇 분마다 물어볼지 — 키는 하루에 몇 번 오가는 일이라 촘촘할 까닭이 없다 */
const POLL_MINUTES = 3;

interface KeyRow {
  id: string;
  at: string;
  car: string;
  dealer: string;
  phone: string;
  company: string;
  dealerStatus: string;
  loc: string;
  returned: boolean;
  vehicleNumber: string;
  vehicleModel: string;
}

@Injectable()
export class KeyWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeyWatcher.name);
  private timer?: NodeJS.Timeout;

  /** 이미 본 키 — 새로 나간 것을 가리는 데 쓴다 */
  private seen = new Set<string>();
  /** 이미 들어왔다고 알린 키 */
  private returned = new Set<string>();
  /** 늦었다고 이미 알린 키 — 세 시간째마다 다시 보내지 않는다 */
  /** 이미 알린 불출 요청 */
  private requested = new Set<string>();
  /** 첫 바퀴인가 — 그때는 읽기만 한다 */
  private primed = false;

  constructor(
    private readonly board: ParkBoardService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.telegram.configured) {
      this.logger.log('텔레그램이 설정되지 않아 키 불출 알림을 보내지 않습니다.');
      return;
    }
    if (this.config.get<string>('TELEGRAM_KEY_ALERT', '1') === '0') {
      this.logger.log('TELEGRAM_KEY_ALERT=0 이라 키 불출 알림을 보내지 않습니다.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_MINUTES * 60 * 1000);
    this.timer.unref?.();
    // 뜨자마자 한 번 읽어서 지금 상태를 기억해 둔다(알리지는 않는다)
    void this.tick();
    this.logger.log(`키 불출 알림 ${POLL_MINUTES}분마다`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    let rows: KeyRow[];
    try {
      const res = (await this.board.keys(50)) as { rows?: KeyRow[] };
      rows = res.rows ?? [];
    } catch (e) {
      this.logger.warn(`키 불출 이력을 못 읽었습니다: ${(e as Error).message}`);
      return;
    }
    if (rows.length === 0) return;

    // 첫 바퀴는 기억만 한다 — 다시 띄울 때마다 지난 이력이 쏟아지면 아무도 안 본다
    if (!this.primed) {
      for (const r of rows) {
        this.seen.add(r.id);
        if (r.returned) this.returned.add(r.id);
      }
      for (const id of await this.pendingRequestIds()) this.requested.add(id);
      this.primed = true;
      return;
    }

    await this.checkRequests();

    const now = Date.now();
    for (const r of rows) {
      const car = this.carLabel(r);

      if (!this.seen.has(r.id)) {
        this.seen.add(r.id);
        if (r.returned) this.returned.add(r.id);
        else {
          this.telegram.notify(
            `🔑 <b>키 불출</b>\n${car}\n` +
              `가져간 사람: ${r.dealer || '(이름 없음)'}${r.company ? ` · ${r.company}` : ''}` +
              (r.loc ? `\n세워둔 곳: ${r.loc}` : ''),
          );
        }
        continue;
      }

      if (r.returned && !this.returned.has(r.id)) {
        this.returned.add(r.id);
        this.telegram.notify(`✅ <b>키 반납</b>\n${car}${r.dealer ? `\n${r.dealer}` : ''}`);
        continue;
      }

      /*
        키가 안 들어왔다고 공지방에 알리지 않는다.

        시승이 길어지거나 하루 맡기는 일이 흔해서 두 시간만 지나도 울린다. 그러면 정작
        봐야 하는 알림까지 같이 안 보게 된다 — 공지방은 '누가 봐도 지금 움직여야 하는 것'만
        띄운다. 안 들어온 키는 키불출판에 그대로 남아 있고, 챙길 사람은 그 화면을 본다.
      */
    }
  }

  /**
   * 사람이 풀어 줘야 하는 불출 요청.
   *
   * 딜러가 적은 번호가 우리 목록과 안 맞으면 앱이 바로 안 내주고 대기로 걸어 둔다.
   * 그러면 딜러는 주차장에 서서 기다리는데, 사무실에서는 그 앱을 안 보고 있으면 모른다.
   */
  private async pendingRequestIds(): Promise<string[]> {
    const node = await this.board.rawNode<Record<string, { status?: string }>>('dispatch_req');
    return Object.entries(node ?? {})
      .filter(([, v]) => (v?.status ?? '') === 'pending')
      .map(([k]) => k);
  }

  private async checkRequests(): Promise<void> {
    let node: Record<string, { car?: string; name?: string; phone?: string; status?: string }> | null;
    try {
      node = await this.board.rawNode('dispatch_req');
    } catch {
      return;
    }

    for (const [id, v] of Object.entries(node ?? {})) {
      if ((v?.status ?? '') !== 'pending' || this.requested.has(id)) continue;
      this.requested.add(id);
      this.telegram.notify(
        `🙋 <b>키 불출 요청 — 확인 필요</b>
` +
          `${v.name ?? '(이름 없음)'}${v.phone ? ` · ${v.phone}` : ''}
` +
          `${v.car ?? ''}

` +
          '번호가 우리 목록과 안 맞아 대기 중입니다. 딜러가 기다리고 있습니다.',
      );
    }
  }

  /** 우리가 아는 차면 차명까지 붙인다 — 번호만으로는 어느 차인지 바로 안 떠오른다 */
  private carLabel(r: KeyRow): string {
    const plate = r.vehicleNumber || r.car;
    return r.vehicleModel ? `<b>${plate}</b> ${r.vehicleModel}` : `<b>${plate}</b>`;
  }
}

@Module({
  controllers: [ParkBoardController],
  // 키 불출을 지켜보다 공지방에 알린다 — 저쪽은 웹훅을 안 주므로 이쪽에서 물어본다
  providers: [ParkBoardService, KeyWatcher],
  exports: [ParkBoardService],
})
export class ParkBoardModule {}
