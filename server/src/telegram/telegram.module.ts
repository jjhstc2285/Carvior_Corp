import { request as httpsRequest } from 'node:https';
import { resolve4 } from 'node:dns/promises';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Delete,
  NotFoundException,
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { TelegramRoom } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { SaleCardDto, saleCardHtml, saleCardText, type SaleCardMark } from './sale-card';
import { normalizePlate } from '../vehicles/vehicle.rules';
import { Role } from '@prisma/client';

/**
 * 텔레그램 공지방.
 *
 * 차가 팔렸는지, 상품화가 끝났는지, 어느 주차장에 새로 들어왔는지 — 지금은 이런 걸
 * 화면에 들어가 봐야 안다. 매입팀이 상품화를 끝내도 상담 받는 사람은 모르고, 차가
 * 팔려도 주차 옮기는 사람은 모른다. 그래서 같은 걸 카톡으로 다시 묻는다.
 *
 * 일이 벌어질 때 방에 한 줄 띄운다. 알림이 흔해지면 안 보게 되므로 '누가 봐도 알아야
 * 하는 것'만 보낸다 — 금액·정산·인건비·결재처럼 자리에 따라 가려야 하는 것은 보내지
 * 않는다. 이 방은 전 직원이 본다.
 *
 * 보내다 실패해도 하던 일은 그대로 간다. 차를 파는 일이 알림 때문에 막히면 안 된다.
 */

const HOST = 'api.telegram.org';

/**
 * 이름을 못 찾을 때 두드려 볼 주소.
 *
 * 텔레그램이 공개한 대역의 대표 주소들이다. 이름 풀이가 막히는 상자가 있어 마지막 수단으로
 * 둔다 — 주소는 바뀔 수 있으니 이름이 풀리면 그쪽이 먼저다.
 */
const FALLBACK_IPS = ['149.154.167.220', '149.154.175.50', '149.154.165.120'];

/*
  방 이름 — 로그와 화면이 같은 말을 쓴다.

  입금확인방으로는 이제 안 보낸다(판매가 알림을 뗐다). 이름은 남겨 둔다 — 그때까지
  나간 기록이 그 이름으로 쌓여 있어서, 지우면 지난 줄이 이름 없는 방이 된다.
*/
export const ROOM_LABEL: Record<TelegramRoom, string> = {
  [TelegramRoom.BROADCAST]: '공지방',
  [TelegramRoom.SALE]: '입금확인방',
  [TelegramRoom.PURCHASE]: '매입방',
};

/** 차량번호로 불러온 쪽지 칸 — 금액은 만원이다 */
export interface SaleCardFill {
  vehicleNumber: string;
  vehicleName: string;
  dealer: string;
  purchasePrice: number;
  brokerFee: number;
  adPrice: number;
  platform: string;
}

export interface TelegramLogRow {
  id: string;
  room: TelegramRoom;
  text: string;
  ok: boolean;
  reason: string;
  vehicleNumber: string;
  /** 손으로 올린 쪽지면 올린 사람 */
  sentBy: string;
  createdAt: string;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  /** 지난번에 통한 주소 — 다음부터 먼저 두드린다 */
  private lastGoodIp: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get token() {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  private get chatId() {
    return this.config.get<string>('TELEGRAM_CHAT_ID', '');
  }

  /**
   * 입금확인방 — 손으로 올리는 쪽지가 간다.
   *
   * 공지방은 전 직원이 본다. 매입가·판매가가 거기 뜨면 차 한 대에 얼마가 남는지가
   * 온 회사에 공개된다 — 그래서 공지방에는 금액을 안 보낸다.
   *
   * 이 방이 안 적혀 있으면 아무 데도 안 보낸다. 공지방으로 흘려보내지 않는다 —
   * 설정을 빠뜨린 게 금액이 새는 쪽으로 기울면 안 된다.
   */
  private get saleChatId() {
    return this.config.get<string>('TELEGRAM_SALE_CHAT_ID', '');
  }

  /**
   * 매입방 — 차를 사오면 쪽지가 간다.
   *
   * 여기도 금액이 든다(실매입금액·구전). 공지방과 다른 방이고, 안 적혀 있으면 안 보낸다.
   */
  private get purchaseChatId() {
    return this.config.get<string>('TELEGRAM_PURCHASE_CHAT_ID', '');
  }

  get configured() {
    return !!this.token && !!this.chatId;
  }

  /**
   * 뜰 때 한 줄 남긴다.
   *
   * 설정이 비어 있으면 공지는 아무 말 없이 안 나간다 — 일하다 멈추면 안 되니 그렇게 짰다.
   * 그런데 그래서 방이 끊긴 건지, 열쇠가 빠진 건지, 보낼 일이 없었던 건지 구분할 길이
   * 없었다. 뜰 때 어느 쪽인지 적어두면 로그 한 줄로 갈린다.
   *
   * 토큰은 안 적는다 — 로그는 여럿이 본다. 방 번호는 어느 방인지 가리는 값이라 적는다.
   */
  onModuleInit(): void {
    if (this.configured) {
      this.logger.log(`공지방 연결됨 — 방 ${this.chatId}`);
    } else {
      this.logger.warn('공지방이 설정되지 않았습니다(.env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). 공지는 나가지 않습니다.');
    }
    if (this.token && this.saleChatId) {
      this.logger.log(`입금확인방 연결됨 — 방 ${this.saleChatId}`);
    } else {
      this.logger.warn('입금확인방이 없습니다(.env TELEGRAM_SALE_CHAT_ID). 입금방에 손으로 올릴 수 없습니다.');
    }
    if (this.token && this.purchaseChatId) {
      this.logger.log(`매입방 연결됨 — 방 ${this.purchaseChatId}`);
    } else {
      this.logger.warn('매입방이 없습니다(.env TELEGRAM_PURCHASE_CHAT_ID). 매입 알림은 나가지 않습니다.');
    }
  }

  /**
   * 방에 한 줄 띄운다.
   *
   * 기다리지 않는다 — 부르는 쪽은 차를 고치거나 파는 중이고, 텔레그램이 느리다고 그
   * 일이 멈추면 안 된다. 실패는 로그에만 남긴다.
   */
  notify(text: string): void {
    this.deliver(TelegramRoom.BROADCAST, this.chatId, text);
  }

  /** 차를 사오면 — 매입방으로만 간다. 여기도 금액이 든다 */
  notifyPurchase(text: string, vehicleNumber = ''): void {
    this.deliver(TelegramRoom.PURCHASE, this.purchaseChatId, text, vehicleNumber);
  }

  /**
   * 한 방에 띄우고, 보낸 것을 남긴다.
   *
   * 기다리지 않는다 — 부르는 쪽은 차를 고치거나 파는 중이고, 텔레그램이 느리다고 그
   * 일이 멈추면 안 된다.
   *
   * 갔든 못 갔든 남긴다. 지금까지는 서버 로그에만 남아서, PM2 안에 있는 걸 사람이 못
   * 보고 며칠 지나면 밀려 사라졌다 — "그 차 올라갔나?"를 방을 뒤져서 확인해야 했다.
   */
  private deliver(room: TelegramRoom, chatId: string, text: string, vehicleNumber = ''): void {
    if (!this.token || !chatId || !text.trim()) return;
    void this.send(text, chatId)
      .then(() => this.record(room, chatId, text, vehicleNumber, true, ''))
      .catch((e: Error) => {
        /*
          'fetch failed' 만 적으면 왜 못 갔는지 알 수 없다.

          노드는 진짜 이유를 cause 에 숨겨 둔다 — 주소를 못 찾았는지(ENOTFOUND), 길이
          없는지(EHOSTUNREACH), 막혔는지(ECONNREFUSED)가 거기 있다. 그게 있어야
          네트워크를 볼지 열쇠를 볼지 갈린다.
        */
        const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
        const why = cause?.code ?? cause?.message ?? '';
        const reason = `${e.message}${why ? ` — ${why}` : ''}`;
        this.logger.warn(`${ROOM_LABEL[room]}에 못 보냈습니다(방 ${chatId}): ${reason}`);
        this.record(room, chatId, text, vehicleNumber, false, reason);
      });
  }

  /**
   * 입금방에 올린다.
   *
   * 고칠 때도 여덟 줄을 통째로 다시 올린다. 방에 뜬 줄을 조용히 고치는 길도 있었는데,
   * 그러면 알림이 안 울려서 그새 읽고 간 사람은 옛 숫자를 들고 있게 된다 — 그 방을
   * 보고 입금을 넣는 자리라 바뀐 걸 모르는 쪽이 더 나쁘다.
   *
   * 기다린다. 다른 알림은 일하다 곁가지로 나가는 거라 늦어도 그만이지만, 이건 사람이
   * 단추를 누르고 보고 있는 중이다 — 조용히 실패하면 "단추가 안 된다"로 돌아온다.
   *
   * 못 가도 남긴다. 안 간 줄이 빨갛게 떠야 다시 올릴 수 있다.
   */
  async postSale(card: SaleCardDto, sentBy: string): Promise<TelegramLogRow> {
    const chatId = this.saleChatId;
    if (!this.token || !chatId) {
      throw new BadRequestException('입금확인방이 서버에 설정되지 않았습니다(.env TELEGRAM_SALE_CHAT_ID).');
    }
    const plate = card.vehicleNumber.trim();
    const mark = await this.markOf(card, plate, sentBy);
    const text = saleCardText(card, mark);
    try {
      const messageId = await this.send(saleCardHtml(card, mark), chatId);
      return this.toRow(
        await this.prisma.telegramLog.create({
          data: { room: TelegramRoom.SALE, chatId, text, vehicleNumber: plate, ok: true, messageId, sentBy },
        }),
      );
    } catch (e) {
      const reason = this.why(e as Error);
      this.logger.warn(`입금방에 못 올렸습니다(방 ${chatId}): ${reason}`);
      await this.prisma.telegramLog
        .create({
          data: {
            room: TelegramRoom.SALE,
            chatId,
            text,
            vehicleNumber: plate,
            ok: false,
            reason: reason.slice(0, 300),
            sentBy,
          },
        })
        .catch(() => undefined);
      throw new BadRequestException(`입금방에 못 올렸습니다 — ${reason}`);
    }
  }

  /**
   * 고쳐 올리는 것인가 — 그러면 지난 쪽지와 몇 번째인지를 들고 온다.
   *
   * 몇 번째인지는 그 차로 나간 쪽지를 세서 낸다. 못 간 것도 센다 — 올리려 한 횟수가
   * 값이 흔들린 횟수다.
   */
  private async markOf(card: SaleCardDto, plate: string, sentBy: string): Promise<SaleCardMark | undefined> {
    if (!card.basedOn) return undefined;
    const before = await this.prisma.telegramLog.findUnique({ where: { id: card.basedOn } });
    if (!before || before.room !== TelegramRoom.SALE) throw new NotFoundException('고칠 쪽지를 찾을 수 없습니다.');
    const sent = await this.prisma.telegramLog.count({
      where: { room: TelegramRoom.SALE, vehicleNumber: plate },
    });
    return { before: before.text, by: sentBy, seq: sent + 1 };
  }

  /**
   * 차량번호로 쪽지 칸을 채워 온다.
   *
   * 여덟 줄 중 여섯 줄은 이미 어딘가에 적혀 있다. 차명은 차량 관리에, 매입가와 구전은
   * 매입 정산에, 담당자와 유입경로는 상담에 있다 — 그걸 다시 손으로 치게 하면 한 자씩
   * 틀리고, 틀린 채로 방에 올라가면 그 숫자로 입금이 들어간다.
   *
   * 차량번호 몇 자만 치면 맞는 차를 몇 대 보여 주고, 고르면 칸이 다 찬다. 사람이 보고
   * 적을 것은 광고가뿐이다.
   *
   * 만원으로 돌려준다 — 방에 뜨는 꼴이 만원이고, 적는 사람이 보는 숫자도 만원이다.
   */
  async saleCards(q: string): Promise<SaleCardFill[]> {
    const key = normalizePlate(q ?? '').trim();
    if (key.length < 2) return [];

    const vehicles = await this.prisma.managedVehicle.findMany({
      where: { vehicleNumber: { contains: key } },
      orderBy: [{ offerDate: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: { vehicleNumber: true, vehicleModel: true, salePrice: true },
    });

    /*
      차량 관리에 없으면 매입 정산에서 찾는다.

      타사·수출 차는 우리 차고에 안 들어와서 차량 관리에 줄이 없는 건이 있다 — 그래도
      매입 정산에는 적혀 있다. 없다고 돌려보내면 그 차는 손으로 다 쳐야 한다.
    */
    const plates =
      vehicles.length > 0
        ? vehicles.map((v) => v.vehicleNumber)
        : (
            await this.prisma.purchaseSettlement.findMany({
              where: { vehicleNumber: { contains: key } },
              orderBy: { date: 'desc' },
              take: 8,
              select: { vehicleNumber: true },
              distinct: ['vehicleNumber'],
            })
          ).map((r) => r.vehicleNumber);
    if (plates.length === 0) return [];

    const [purchases, consultations] = await Promise.all([
      this.prisma.purchaseSettlement.findMany({
        where: { vehicleNumber: { in: plates } },
        orderBy: { date: 'desc' },
        select: {
          vehicleNumber: true,
          vehicleName: true,
          purchasePrice: true,
          brokerFee: true,
          salePrice: true,
          employee: { select: { name: true } },
        },
      }),
      this.prisma.consultation.findMany({
        where: { vehicleNumber: { in: plates } },
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        select: {
          vehicleNumber: true,
          vehicleName: true,
          platform: true,
          status: true,
          salePrice: true,
          outsideDealer: true,
          employee: { select: { name: true } },
        },
      }),
    ]);

    const man = (won: number) => Math.round((won || 0) / 10_000);
    return plates.map((plate) => {
      const vehicle = vehicles.find((v) => v.vehicleNumber === plate);
      const purchase = purchases.find((r) => r.vehicleNumber === plate);
      const rows = consultations.filter((c) => c.vehicleNumber === plate);
      /*
        판 건이 먼저다.

        문의만 하고 만 상담의 담당자를 '판 사람'으로 적으면 안 된다 — 그 방은 누가 판
        차인지 보고 입금을 넣는 자리다.
      */
      const lead = rows.find((c) => c.status === 'SOLD' || c.status === 'CONTRACTED') ?? rows[0] ?? null;
      // 타사·기타는 우리 직원이 아니다 — 담당자 자리에 남의 딜러·상사 이름이 적혀 있다
      const dealer = (lead?.outsideDealer ?? '').trim() || lead?.employee?.name || purchase?.employee?.name || '';
      const ad = vehicle?.salePrice || purchase?.salePrice || lead?.salePrice || 0;
      return {
        vehicleNumber: plate,
        vehicleName: vehicle?.vehicleModel || purchase?.vehicleName || lead?.vehicleName || '',
        dealer,
        purchasePrice: man(purchase?.purchasePrice ?? 0),
        brokerFee: man(purchase?.brokerFee ?? 0),
        adPrice: man(ad),
        platform: (lead?.platform ?? '').trim(),
      };
    });
  }

  /**
   * 올린 쪽지를 지운다 — 방에서도 지운다.
   *
   * 목록에서만 지우면 방에는 그 쪽지가 그대로 남는다. 지우는 까닭이 그 방을 보는
   * 사람이 틀린 숫자로 입금을 넣지 않게 하려는 거라, 방에 남으면 아무 소용이 없다.
   *
   * 못 지울 때가 있다. 텔레그램은 봇이 올린 쪽지도 이틀이 지나면 못 지우게 한다 —
   * 그때는 목록에서는 지우되 "방에서는 직접 지워 주세요"라고 말해 준다. 말없이
   * 목록만 지우면 방에 틀린 숫자가 남은 줄도 모르고 넘어간다.
   */
  async dropSale(id: string): Promise<{ inRoom: boolean; reason: string }> {
    const row = await this.prisma.telegramLog.findUnique({ where: { id } });
    if (!row || row.room !== TelegramRoom.SALE) throw new NotFoundException('그 쪽지를 찾을 수 없습니다.');

    let inRoom = true;
    let reason = '';
    // 못 간 줄은 방에 없다 — 지울 것도 없이 목록에서만 내린다
    if (row.ok && row.messageId && this.token && row.chatId) {
      try {
        await this.call('deleteMessage', { chat_id: row.chatId, message_id: Number(row.messageId) });
      } catch (e) {
        inRoom = false;
        reason = this.why(e as Error);
        this.logger.warn(`입금방에서 쪽지를 못 지웠습니다(방 ${row.chatId}): ${reason}`);
      }
    } else if (row.ok && !row.messageId) {
      inRoom = false;
      reason = '올릴 때 쪽지 번호를 못 받아 뒀습니다.';
    }

    await this.prisma.telegramLog.delete({ where: { id } });
    return { inRoom, reason };
  }

  /** 왜 못 갔나 — 텔레그램이 돌려준 말까지 붙인다. 'fetch failed' 만으로는 아무도 못 고친다 */
  private why(e: Error): string {
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message ?? '';
    return `${e.message}${detail ? ` — ${detail}` : ''}`;
  }

  /** 남기다 실패해도 보내기는 이미 끝났다 — 여기서 더 시끄러울 일이 아니다 */
  private record(
    room: TelegramRoom,
    chatId: string,
    text: string,
    vehicleNumber: string,
    ok: boolean,
    reason: string,
  ): void {
    void this.prisma.telegramLog
      .create({ data: { room, chatId, text, vehicleNumber, ok, reason: reason.slice(0, 300) } })
      .catch((e: Error) => this.logger.warn(`보낸 것을 남기지 못했습니다: ${e.message}`));
  }

  /**
   * 방마다 내보낸 것 — 화면에서 본다.
   *
   * 최근 것부터. 다 내려주면 글이 길어 몇 메가가 되므로 끊어서 준다.
   */
  async logs(room: TelegramRoom, limit = 100): Promise<TelegramLogRow[]> {
    const rows = await this.prisma.telegramLog.findMany({
      where: { room },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    });
    return rows.map((r) => this.toRow(r));
  }

  /** 화면이 받는 꼴 — 방 번호와 쪽지 번호는 안 준다. 보는 데 쓸 값이 아니다 */
  private toRow(r: {
    id: string;
    room: TelegramRoom;
    text: string;
    ok: boolean;
    reason: string;
    vehicleNumber: string;
    sentBy: string;
    createdAt: Date;
  }): TelegramLogRow {
    return {
      id: r.id,
      room: r.room,
      text: r.text,
      ok: r.ok,
      reason: r.reason,
      vehicleNumber: r.vehicleNumber,
      sentBy: r.sentBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * 방에 보낸다.
   *
   * fetch 를 안 쓴다. 같은 상자에서 curl 로는 붙는데(302) fetch 만 ETIMEDOUT 으로 죽었다 —
   * 프록시도 없고 IPv4 우선도 걸어 뒀는데도 그랬다. 무엇이 다른지 더 파기보다, 오래
   * 검증된 https 모듈로 직접 말한다.
   *
   * 주소도 우리가 찾는다. 텔레그램은 IP 를 여럿 두는데 그중 하나가 막혀 있으면 그 하나만
   * 잡고 죽을 이유가 없다 — 찾아둔 주소를 차례로 두드려 되는 곳으로 보낸다. 되는 주소는
   * 기억해 두고 다음부터 먼저 쓴다(매번 다 두드리면 공지가 느려진다).
   */
  private send(text: string, chatId: string): Promise<string> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      // 링크 미리보기가 뜨면 짧은 알림이 화면 반을 차지한다
      disable_web_page_preview: true,
    });
  }

  /**
   * 텔레그램에 한 번 말하고, 쪽지 번호를 받아 온다.
   *
   * 주소도 우리가 찾는다. 텔레그램은 IP 를 여럿 두는데 그중 하나가 막혀 있으면 그 하나만
   * 잡고 죽을 이유가 없다 — 찾아둔 주소를 차례로 두드려 되는 곳으로 보낸다. 되는 주소는
   * 기억해 두고 다음부터 먼저 쓴다(매번 다 두드리면 공지가 느려진다).
   *
   * 저쪽이 대답을 했으면 거기서 멈춘다. 'chat not found' 같은 건 주소 탓이 아니라서,
   * 다음 주소로 넘어가 봐야 같은 말을 듣는다 — 그러다 한 번 간 쪽지가 두 번 갈 수 있다.
   */
  private async call(method: string, payload: Record<string, unknown>): Promise<string> {
    const body = JSON.stringify(payload);
    const ips = await this.addresses();
    let last: Error | null = null;
    for (const ip of ips) {
      try {
        const id = await this.post(ip, body, method);
        this.lastGoodIp = ip;
        return id;
      } catch (e) {
        last = e as Error;
        if ((e as Error & { answered?: boolean }).answered) break;
      }
    }
    throw last ?? new Error('보낼 주소를 찾지 못했습니다');
  }

  /** 되는 주소를 앞에 두고 나머지를 뒤에 붙인다 */
  private async addresses(): Promise<string[]> {
    const found = await resolve4(HOST).catch(() => [] as string[]);
    const all = found.length > 0 ? found : FALLBACK_IPS;
    if (!this.lastGoodIp) return all;
    return [this.lastGoodIp, ...all.filter((ip) => ip !== this.lastGoodIp)];
  }

  /**
   * 주소 하나로 보낸다.
   *
   * 주소로 붙되 이름은 텔레그램 것으로 말한다(Host 와 TLS 이름). 안 그러면 저쪽이 어느
   * 집을 찾는지 몰라 끊는다.
   */
  private post(ip: string, body: string, method: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          host: ip,
          port: 443,
          // TLS 가 볼 이름 — 주소로 붙었으니 이름은 따로 알려줘야 한다
          servername: HOST,
          path: `/bot${this.token}/${method}`,
          method: 'POST',
          headers: {
            host: HOST,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
          /* 공지는 늦으면 쓸모가 없다 — 8초를 넘기면 다음 주소로 넘어간다 */
          timeout: 8000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            const raw = Buffer.concat(chunks).toString('utf8');
            if (status >= 200 && status < 300) {
              resolve(messageIdOf(raw));
              return;
            }
            /*
              저쪽이 대답은 했다.

              주소가 막힌 것과 다르다 — 'chat not found' 는 다음 주소로 넘어가 봐야 같은
              말을 듣는다. 넘어가지 말라고 표를 달아 둔다.
            */
            const err = new Error(`${status} ${raw.slice(0, 200)}`) as Error & { answered?: boolean };
            err.answered = true;
            reject(err);
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`${ip} 응답 없음(8초)`)));
      req.on('error', (e: Error) => reject(new Error(`${ip} ${e.message}`)));
      req.end(body);
    });
  }

  /**
   * 봇이 들어가 있는 방을 찾아 준다.
   *
   * 방 번호는 초대 링크(t.me/+...)가 아니다. 그 링크는 사람을 부르는 열쇠일 뿐이고,
   * 보낼 때 쓰는 건 '-1001234567890' 같은 음수다. 어디에도 안 적혀 있어서, 지금까지는
   * 주소창에 토큰을 넣고 getUpdates 를 쳐서 눈으로 찾아야 했다 — 토큰이 브라우저
   * 기록에 남는다.
   *
   * 봇이 본 것만 나온다. 텔레그램은 봇을 부르기 전 이야기를 안 준다 — 방에 봇을
   * 넣고 아무 말이나 한 줄 치면 그때부터 보인다.
   */
  async chats(): Promise<{ rooms: { id: string; title: string; type: string }[]; reason?: string }> {
    if (!this.token) return { rooms: [], reason: '서버에 봇 토큰이 없습니다(.env TELEGRAM_BOT_TOKEN).' };
    try {
      const raw = await this.getUpdates();
      const seen = new Map<string, { id: string; title: string; type: string }>();
      for (const u of raw) {
        // 글·채널글·봇을 넣고 뺀 기록 — 어느 쪽에나 방이 붙어 있다
        const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
        if (!chat?.id) continue;
        seen.set(String(chat.id), {
          id: String(chat.id),
          title: chat.title ?? chat.username ?? chat.first_name ?? '(이름 없음)',
          type: chat.type ?? '',
        });
      }
      const rooms = [...seen.values()];
      return {
        rooms,
        reason: rooms.length === 0 ? '봇이 본 방이 없습니다 — 방에 봇을 넣고 아무 말이나 한 줄 쳐 주세요.' : undefined,
      };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const why = err.cause?.code ?? err.cause?.message ?? '';
      return { rooms: [], reason: `${err.message}${why ? ` — ${why}` : ''}` };
    }
  }

  /**
   * 최근 소식을 읽어 온다.
   *
   * offset 을 안 보낸다 — 보내면 읽은 것으로 쳐서 지워진다. 여기서는 보기만 한다.
   */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    const ips = await this.addresses();
    let last: Error | null = null;
    for (const ip of ips) {
      try {
        const body = await this.get(ip, `/bot${this.token}/getUpdates?limit=100`);
        const parsed = JSON.parse(body) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
        if (!parsed.ok) throw new Error(parsed.description ?? '텔레그램이 거절했습니다');
        this.lastGoodIp = ip;
        return parsed.result ?? [];
      } catch (e) {
        last = e as Error;
      }
    }
    throw last ?? new Error('읽을 주소를 찾지 못했습니다');
  }

  /** 주소 하나로 읽어 온다 — post 와 같은 방식이다(주소로 붙고 이름은 따로 말한다) */
  private get(ip: string, path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        { host: ip, port: 443, servername: HOST, path, method: 'GET', headers: { host: HOST }, timeout: 8000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            const text = Buffer.concat(chunks).toString('utf8');
            if (status >= 200 && status < 300) resolve(text);
            else reject(new Error(`${status} ${text.slice(0, 200)}`));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`${ip} 응답 없음(8초)`)));
      req.on('error', (e: Error) => reject(new Error(`${ip} ${e.message}`)));
      req.end();
    });
  }

  /**
   * 잘 붙었는지 한 번 보내 본다.
   *
   * 실패를 던지지 않는다 — 던지면 화면에는 '서버 오류'만 뜨고 정작 왜 못 갔는지가 묻힌다.
   * 이 단추를 누르는 까닭이 그 이유를 보려는 것이라, 이유를 담아 돌려준다.
   */
  async test(): Promise<{ sent: boolean; reason?: string }> {
    if (!this.configured) {
      return { sent: false, reason: '서버에 봇 토큰이나 방 번호가 없습니다(.env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).' };
    }
    try {
      await this.send('🔔 애니원모터스 통합관리 — 공지방이 연결되었습니다.', this.chatId);
      return { sent: true };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const why = err.cause?.code ?? err.cause?.message ?? '';
      return { sent: false, reason: `${err.message}${why ? ` — ${why}` : ''}` };
    }
  }
}

/**
 * 올린 쪽지 번호를 집는다.
 *
 * 못 집어도 보낸 건 보낸 거다 — 번호가 없으면 다음에 고칠 때 새로 올린다. 여기서
 * 던지면 간 쪽지를 '못 갔다'로 남기게 된다.
 */
function messageIdOf(raw: string): string {
  try {
    const body = JSON.parse(raw) as { result?: { message_id?: number | string } };
    const id = body.result?.message_id;
    return id === undefined || id === null ? '' : String(id);
  } catch {
    return '';
  }
}

/** 텔레그램이 돌려주는 소식 — 우리가 보는 건 방이 붙은 세 가지뿐이다 */
interface TelegramChat {
  id: number | string;
  title?: string;
  username?: string;
  first_name?: string;
  type?: string;
}

interface TelegramUpdate {
  message?: { chat?: TelegramChat };
  channel_post?: { chat?: TelegramChat };
  my_chat_member?: { chat?: TelegramChat };
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** 연결 확인 — 관리자만 */
  @Roles(Role.ADMIN)
  @Post('test')
  test() {
    return this.telegram.test();
  }

  /**
   * 봇이 들어가 있는 방 목록 — 관리자만.
   *
   * .env 에 적을 방 번호를 여기서 찾는다. 토큰은 안 돌려준다 — 번호와 방 이름만이다.
   */
  @Roles(Role.ADMIN)
  @Get('chats')
  chats() {
    return this.telegram.chats();
  }

  /**
   * 방에 내보낸 것.
   *
   * 입금방은 전 직원이 본다 — 어느 차가 얼마로 올라갔는지는 상담·광고·계약이 다
   * 같이 보고 움직이는 값이라, 아는 사람만 아는 자리에 둘 값이 아니다.
   *
   * 나머지 방은 관리자만이다. 매입방에는 실매입금액과 구전이 든다 — 차 한 대에
   * 얼마가 남는지가 그대로 드러난다.
   */
  @Get('logs/:room')
  logs(@CurrentUser() user: AuthUser, @Param('room') room: string, @Query('limit') limit?: string) {
    const asked = room.toUpperCase() as TelegramRoom;
    const key = Object.values(TelegramRoom).includes(asked) ? asked : TelegramRoom.BROADCAST;
    if (key !== TelegramRoom.SALE && user.role !== Role.ADMIN) {
      throw new ForbiddenException('관리자만 볼 수 있습니다.');
    }
    return this.telegram.logs(key, Number(limit) || 100);
  }

  /**
   * 입금방에 손으로 올린다.
   *
   * 고치는 것도 여기로 온다 — basedOn 에 지난 쪽지를 적어 보내면 바뀐 줄을 굵게 적어
   * 통째로 다시 올린다.
   *
   * 로그인한 직원이면 올린다. 올린 사람 이름이 줄에 남는다 — 숫자가 틀렸을 때 누구에게
   * 물어볼지가 거기서 갈린다.
   */
  @Post('sale')
  postSale(@CurrentUser() user: AuthUser, @Body() dto: SaleCardDto) {
    return this.telegram.postSale(dto, user.name);
  }

  /**
   * 차량번호로 쪽지 칸을 채워 온다 — 광고가 말고는 다 어딘가에 적혀 있다.
   *
   * ':id' 보다 먼저 둔다. 뒤에 두면 'cards' 를 쪽지 번호로 읽는다.
   */
  @Get('sale/cards')
  saleCards(@Query('q') q?: string) {
    return this.telegram.saleCards(q ?? '');
  }

  /** 올린 쪽지를 지운다 — 방에서도 지운다 */
  @Delete('sale/:id')
  dropSale(@Param('id') id: string) {
    return this.telegram.dropSale(id);
  }
}

/**
 * 어디서든 부를 수 있게 전역으로 둔다.
 *
 * 알릴 거리는 차량·주차·상담 등 여러 곳에서 생긴다. 모듈마다 가져다 쓰게 엮으면
 * import 줄만 늘고, 새로 알릴 곳이 생길 때마다 배선을 다시 해야 한다.
 */
@Global()
@Module({ controllers: [TelegramController], providers: [TelegramService], exports: [TelegramService] })
export class TelegramModule {}
