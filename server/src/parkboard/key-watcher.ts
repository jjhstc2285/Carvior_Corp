import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParkBoardService } from './parkboard.module';
import { TelegramService } from '../telegram/telegram.module';

/**
 * 키 불출을 지켜보다 공지방에 알린다.
 *
 * 키는 현장 앱(anyone9569)에서 내주고 받는다. 그 앱을 안 보고 있으면 누가 무슨 차 키를
 * 들고 나갔는지 모르고, 안 들어온 키는 저녁에야 알게 된다 — 그때는 딜러가 이미 퇴근했다.
 *
 * 저쪽은 웹훅을 주지 않으니 이쪽에서 몇 분마다 물어본다. 새로 나간 키, 들어온 키,
 * 두 시간이 지나도 안 들어온 키 셋을 알린다.
 *
 * 무엇을 이미 알렸는지는 이 프로세스가 들고 있는다. 서버를 다시 띄우면 알린 기억이
 * 없어지므로, 처음 한 번은 읽기만 하고 아무것도 안 보낸다 — 안 그러면 다시 띄울 때마다
 * 지난 이력이 통째로 쏟아진다.
 */

/** 몇 분마다 물어볼지 — 키는 하루에 몇 번 오가는 일이라 촘촘할 까닭이 없다 */
const POLL_MINUTES = 3;

/** 이 시간이 지나도 안 들어오면 알린다 — 화면의 빨간 칸과 같은 기준이다 */
const OVERDUE_HOURS = 2;

interface KeyRow {
  id: string;
  at: string;
  car: string;
  dealer: string;
  company: string;
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
  private warned = new Set<string>();
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
    this.logger.log(`키 불출 알림 ${POLL_MINUTES}분마다 · 미반납 ${OVERDUE_HOURS}시간`);
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
        this.warned.delete(r.id);
        this.telegram.notify(`✅ <b>키 반납</b>\n${car}${r.dealer ? `\n${r.dealer}` : ''}`);
        continue;
      }

      // 아직 안 들어온 키. 두 시간이 지났으면 한 번만 알린다
      if (!r.returned && !this.warned.has(r.id)) {
        const out = Date.parse(r.at);
        if (!Number.isFinite(out)) continue;
        const hours = (now - out) / 3_600_000;
        if (hours < OVERDUE_HOURS) continue;

        this.warned.add(r.id);
        this.telegram.notify(
          `⚠️ <b>키 미반납 ${Math.floor(hours)}시간 경과</b>\n${car}\n` +
            `가져간 사람: ${r.dealer || '(이름 없음)'}${r.company ? ` · ${r.company}` : ''}\n\n` +
            '연락해 보세요.',
        );
      }
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
