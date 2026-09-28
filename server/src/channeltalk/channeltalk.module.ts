import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 채널톡(channel.io) Open API 연동 — 전화 상담 기록 가져오기.
 *
 * 전화가 오면 채널톡이 녹취를 받아 적는다. 그걸 사람이 다시 옮겨 치지 않게 읽어온다.
 * 읽기 전용이다 — 저쪽에 아무것도 쓰지 않는다.
 *
 * 웹훅을 걸지 않는다. 채널톡 웹훅에는 통화 종료 같은 사건이 아예 없고(아홉 가지뿐인데
 * 전부 채팅·고객 관련이다), 웹훅을 받으려면 바깥에서 우리 서버로 들어오는 문을 새로
 * 내야 한다. 이쪽에서 물어보는 편이 만들 것도 지킬 것도 적다.
 *
 * 열쇠는 .env 에만 둔다. 브라우저가 직접 부르면 열쇠가 그대로 드러나므로 서버가 대신 부른다.
 */

const BASE = 'https://api.channel.io/open/v5';

/** 한 번에 훑을 통화 수 — 저쪽은 채널당 초당 열 번쯤까지 받아준다 */
const MAX_CALLS = 30;

/** 통화 중인 건을 받아 두고 돌려쓰는 시간 — 말이 끊기지 않게 짧게 둔다 */
const LIVE_CACHE_MS = 2500;

interface CallLog {
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  state: string;
  createdAt: number;
  engagedAt?: number;
  closedAt?: number;
  userChatId: string;
  managerIds?: string[];
  missedReason?: string;
}

interface ChannelMessage {
  id: string;
  personType?: string;
  plainText?: string;
  createdAt: number;
  meet?: {
    state?: string;
    summaries?: { text?: string }[] | null;
    managerIds?: string[];
    call?: { from?: string; to?: string; direction?: string; engagedAt?: number };
  };
}

/** 화면이 받아 쓰는 모양 */
export interface CallRecord {
  userChatId: string;
  /** 통화 한 건을 가리키는 메시지 id — 전사가 여기 매달려 있다 */
  messageId: string | null;
  /** 손님 번호 — 010-1234-5678 꼴로 고쳐 둔다 */
  customerPhone: string;
  direction: 'inbound' | 'outbound';
  /** 통화 시각 — 받은 시각이 있으면 그 시각 */
  at: string;
  /** 초 단위 통화 길이. 못 재면 0 */
  seconds: number;
  managerName: string;
  /** 전사 상태 — transcribed 가 아니면 내용이 아직 비어 있을 수 있다 */
  state: string;
  /** 채널톡이 만든 AI 요약. 요금제에 없으면 빈 칸이다 */
  summary: string;
  /** 녹취 전문 — 말한 사람과 함께 */
  lines: { who: '손님' | '상담원'; text: string; at: string }[];
  /** 상담내용 칸에 그대로 붙일 수 있게 엮어 둔 글 */
  text: string;
  /** 지금 통화가 붙어 있는 중인지 — 화면이 이 줄만 계속 다시 받는다 */
  live: boolean;
}

/**
 * +821022856017 → 010-2285-6017.
 *
 * 우리 상담은 손님번호를 이 꼴로 적는다. 맞춰 두지 않으면 번호로 상담을 못 찾는다.
 */
export function toLocalPhone(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/[^\d]/g, '');
  const local = digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
  if (/^01\d{8,9}$/.test(local)) {
    const mid = local.length === 11 ? 7 : 6;
    return `${local.slice(0, 3)}-${local.slice(3, mid)}-${local.slice(mid)}`;
  }
  if (/^0\d{8,10}$/.test(local)) {
    const head = local.startsWith('02') ? 2 : 3;
    const rest = local.slice(head);
    return `${local.slice(0, head)}-${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return local || (raw ?? '');
}

/** 자정을 넘겨도 읽히게 날짜까지 적는다 */
function stamp(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
}

function hhmm(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(11, 16);
}

/**
 * 상담내용 칸에 그대로 넣을 글로 엮는다.
 *
 * 요약이 있으면 앞에 세우고 전문을 뒤에 붙인다. 요약만 두면 "삼백만 원" 같은 숫자가
 * 떨어져 나간다 — 나중에 다투는 건 늘 그 숫자다.
 */
function composeText(p: {
  at: number;
  seconds: number;
  managerName: string;
  direction: string;
  summary: string;
  lines: { who: string; text: string }[];
}): string {
  const head =
    `[채널톡 ${p.direction === 'outbound' ? '건 전화' : '받은 전화'} ${stamp(p.at)}` +
    (p.seconds > 0 ? ` · ${p.seconds}초` : '') +
    (p.managerName ? ` · 담당 ${p.managerName}` : '') +
    ']';

  const body: string[] = [];
  if (p.summary) body.push(`■ 요약\n${p.summary}`);
  if (p.lines.length > 0) body.push(`■ 통화 내용\n${p.lines.map((l) => `${l.who}: ${l.text}`).join('\n')}`);
  if (body.length === 0) body.push('(녹취 내용이 아직 없습니다)');

  return `${head}\n${body.join('\n\n')}`;
}

@Injectable()
export class ChannelTalkService {
  private readonly logger = new Logger(ChannelTalkService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get key() {
    return this.config.get<string>('CHANNELTALK_ACCESS_KEY', '');
  }

  private get secret() {
    return this.config.get<string>('CHANNELTALK_ACCESS_SECRET', '');
  }

  get configured() {
    return !!this.key && !!this.secret;
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('채널톡 열쇠가 설정되지 않았습니다.');
    }
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-access-key': this.key, 'x-access-secret': this.secret },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`채널톡 ${path} → ${res.status} ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException(`채널톡에서 불러오지 못했습니다. (${res.status})`);
    }
    return (await res.json()) as T;
  }

  /** 목록에서 치운 통화 — 저쪽은 매번 다 내려주므로 여기서 걸러야 한다 */
  private async hiddenIds(): Promise<Set<string>> {
    const rows = await this.prisma.dismissedCall.findMany({ select: { userChatId: true } });
    return new Set(rows.map((r) => r.userChatId));
  }

  /** 상담원 id → 이름. 통화마다 부르지 않게 한 번만 받아 둔다 */
  private async managerNames(): Promise<Map<string, string>> {
    try {
      const res = await this.get<{ managers?: { id: string; name?: string }[] }>('/managers');
      return new Map((res.managers ?? []).map((m) => [m.id, m.name ?? '']));
    } catch {
      return new Map();
    }
  }

  /**
   * 최근 통화를 녹취까지 붙여서 가져온다.
   *
   * 통화 한 건에 세 번을 물어야 한다(통화 목록 → 그 대화의 메시지 → 전사). 저쪽에 한도가
   * 있으니 건수를 끊고 차례로 부른다. 한 건이 막혀도 나머지는 내보낸다 — 통화 하나 때문에
   * 화면이 통째로 비면 안 된다.
   */
  async recentCalls(days: number): Promise<CallRecord[]> {
    const to = Date.now();
    const from = to - Math.max(1, Math.min(days, 30)) * 86_400_000;

    const logs = await this.get<CallLog[]>(`/meet/call/log?from=${from}&to=${to}`);
    const names = await this.managerNames();

    // 치운 건 목록에 없다. 저쪽에서 매번 다시 내려오므로 여기서 걸러야 한다
    const hidden = await this.hiddenIds();

    const out: CallRecord[] = [];
    for (const log of logs.filter((l) => !hidden.has(l.userChatId)).slice(0, MAX_CALLS)) {
      try {
        out.push(await this.oneCall(log, names));
      } catch (e) {
        this.logger.warn(`통화 한 건을 못 읽었습니다(${log.userChatId}): ${(e as Error).message}`);
      }
    }
    return out;
  }

  /**
   * 지금 붙어 있는 통화.
   *
   * 녹취는 통화가 끝나고 만들어지는 게 아니라 말하는 대로 쌓인다 — 말하고 0.2초 뒤면
   * 읽힌다. 통화가 끝난 뒤에 차를 짚어 줘야 소용이 없다. 손님이 "카니발이요" 하는 그
   * 순간에 목록이 떠 있어야 상담원이 보고 답한다.
   *
   * 통화 중인지는 대화에 liveMeetId 가 박혀 있는지로 안다. 통화 로그(/meet/call/log)는
   * 끝난 것만 나오는 걸로 보인다 — 거기에 기대면 통화 중에는 아무것도 못 본다.
   */
  async liveCalls(): Promise<CallRecord[]> {
    /*
      받아 둔 걸 잠깐 돌려쓴다.

      화면이 몇 초마다 묻는데, 사무실에서 다섯 명이 화면을 열어 두면 저쪽을 다섯 배로
      두드린다. 한도는 채널당으로 걸려 있어서 사람이 늘수록 다 같이 막힌다.
      한 번 받아 온 걸 잠깐 쥐고 있으면 사람이 몇이든 저쪽에 가는 건 그대로다.
    */
    const now = Date.now();
    if (this.liveCache && now - this.liveCache.at < LIVE_CACHE_MS) return this.liveCache.rows;
    // 이미 받는 중이면 그 결과를 같이 기다린다 — 동시에 들어와도 한 번만 나간다
    if (this.liveInFlight) return this.liveInFlight;

    this.liveInFlight = this.fetchLive()
      .then((rows) => {
        this.liveCache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        this.liveInFlight = null;
      });
    return this.liveInFlight;
  }

  private liveCache: { at: number; rows: CallRecord[] } | null = null;
  private liveInFlight: Promise<CallRecord[]> | null = null;

  private async fetchLive(): Promise<CallRecord[]> {
    const res = await this.get<{ userChats?: { id: string; liveMeetId?: string | null }[] }>(
      '/user-chats?limit=30&sortOrder=desc',
    );
    const live = (res.userChats ?? []).filter((c) => c.liveMeetId);
    if (live.length === 0) return [];

    const names = await this.managerNames();
    const out: CallRecord[] = [];
    for (const chat of live) {
      try {
        out.push(await this.oneLive(chat.id, chat.liveMeetId!, names));
      } catch (e) {
        this.logger.warn(`통화 중인 건을 못 읽었습니다(${chat.id}): ${(e as Error).message}`);
      }
    }
    return out;
  }

  private async oneLive(chatId: string, meetId: string, names: Map<string, string>): Promise<CallRecord> {
    const chat = await this.get<{ messages?: ChannelMessage[] }>(`/user-chats/${chatId}/messages?limit=50`);
    const root = (chat.messages ?? []).find((m) => m.id === meetId && m.meet) ?? (chat.messages ?? []).find((m) => m.meet);
    const call = root?.meet?.call;

    const stt = await this.get<{ messages?: ChannelMessage[] }>(
      `/user-chats/${chatId}/meets/${meetId}/messages?sortOrder=asc`,
    );
    const lines = (stt.messages ?? [])
      .filter((m) => (m.plainText ?? '').trim())
      .map((m) => ({
        who: m.personType === 'manager' ? ('상담원' as const) : ('손님' as const),
        text: (m.plainText ?? '').trim(),
        at: hhmm(m.createdAt),
      }));

    const direction = (call?.direction === 'outbound' ? 'outbound' : 'inbound') as 'inbound' | 'outbound';
    const customer = direction === 'outbound' ? call?.to : call?.from;
    const at = call?.engagedAt ?? root?.createdAt ?? Date.now();
    const managerName = (root?.meet?.managerIds ?? [])
      .map((id) => names.get(id) ?? '')
      .filter(Boolean)
      .join(', ');

    return {
      userChatId: chatId,
      messageId: meetId,
      customerPhone: toLocalPhone(customer),
      direction,
      at: stamp(at),
      // 통화 중이라 아직 안 끝났다 — 길이는 지금까지 흐른 시간이다
      seconds: Math.max(0, Math.round((Date.now() - at) / 1000)),
      managerName,
      state: root?.meet?.state ?? 'live',
      summary: '',
      lines,
      text: composeText({ at, seconds: 0, managerName, direction, summary: '', lines }),
      live: true,
    };
  }

  private async oneCall(log: CallLog, names: Map<string, string>): Promise<CallRecord> {
    // 통화 로그에는 메시지 id가 없다 — 그 대화에서 통화를 가리키는 메시지를 찾아야 한다
    const chat = await this.get<{ messages?: ChannelMessage[] }>(`/user-chats/${log.userChatId}/messages?limit=50`);
    const root = (chat.messages ?? []).find((m) => m.meet);

    const summary = (root?.meet?.summaries ?? [])
      .map((s) => (s.text ?? '').trim())
      .filter(Boolean)
      .join('\n');

    let lines: CallRecord['lines'] = [];
    if (root) {
      try {
        const stt = await this.get<{ messages?: ChannelMessage[] }>(
          `/user-chats/${log.userChatId}/meets/${root.id}/messages?sortOrder=asc`,
        );
        lines = (stt.messages ?? [])
          .filter((m) => (m.plainText ?? '').trim())
          .map((m) => ({
            who: m.personType === 'manager' ? ('상담원' as const) : ('손님' as const),
            text: (m.plainText ?? '').trim(),
            at: hhmm(m.createdAt),
          }));
      } catch (e) {
        this.logger.warn(`전사를 못 읽었습니다(${log.userChatId}): ${(e as Error).message}`);
      }
    }

    const at = log.engagedAt ?? log.createdAt;
    const seconds = log.engagedAt && log.closedAt ? Math.max(0, Math.round((log.closedAt - log.engagedAt) / 1000)) : 0;
    // 손님 번호는 방향에 따라 반대쪽이다 — 우리가 건 전화면 받는 쪽이 손님이다
    const customer = log.direction === 'outbound' ? log.to : log.from;
    const managerName = (log.managerIds ?? [])
      .map((id) => names.get(id) ?? '')
      .filter(Boolean)
      .join(', ');

    return {
      userChatId: log.userChatId,
      messageId: root?.id ?? null,
      customerPhone: toLocalPhone(customer),
      direction: log.direction,
      at: stamp(at),
      seconds,
      managerName,
      state: root?.meet?.state ?? log.state,
      summary,
      lines,
      text: composeText({ at, seconds, managerName, direction: log.direction, summary, lines }),
      live: false,
    };
  }
}

/**
 * 치운 통화를 다루는 부분.
 *
 * 통화 자체는 채널톡 것이라 지울 수 없고, 지워서도 안 된다 — 녹취는 나중에 다툴 때
 * 꺼내 보는 물건이다. 저쪽은 그대로 두고 우리 목록에서만 가린다.
 *
 * 브라우저가 아니라 서버에 둔다. 한 사람이 처리한 전화가 옆자리 화면에 그대로 남아
 * 있으면 같은 손님에게 두 번 전화가 간다.
 */
@Injectable()
export class DismissedCallService {
  constructor(private readonly prisma: PrismaService) {}

  async hiddenIds(): Promise<Set<string>> {
    const rows = await this.prisma.dismissedCall.findMany({ select: { userChatId: true } });
    return new Set(rows.map((r) => r.userChatId));
  }

  /** 휴지통 — 치운 차례대로, 누가 언제 치웠는지와 함께 */
  async list() {
    const rows = await this.prisma.dismissedCall.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { dismissedBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      userChatId: r.userChatId,
      customerPhone: r.customerPhone,
      calledAt: r.calledAt,
      dismissedBy: r.dismissedBy?.name ?? '',
      dismissedAt: r.createdAt.toISOString(),
    }));
  }

  /** 두 사람이 같은 통화를 동시에 치워도 탈이 없게 upsert 로 둔다 */
  async dismiss(employeeId: string, userChatId: string, customerPhone: string, calledAt: string) {
    await this.prisma.dismissedCall.upsert({
      where: { userChatId },
      create: { userChatId, customerPhone, calledAt, dismissedById: employeeId },
      update: {},
    });
  }

  /** 되돌리기 — 없는 걸 되돌려도 탈 없이 넘어간다 */
  async restore(userChatId: string) {
    await this.prisma.dismissedCall.deleteMany({ where: { userChatId } });
  }
}

@Controller('channeltalk')
export class ChannelTalkController {
  constructor(
    private readonly service: ChannelTalkService,
    private readonly dismissed: DismissedCallService,
  ) {}

  /** 열쇠가 꽂혀 있는지 — 화면이 안내 문구를 고르는 데 쓴다 */
  @Get('status')
  status() {
    return { configured: this.service.configured };
  }

  @Get('calls')
  calls(@Query('days') days?: string) {
    return this.service.recentCalls(Number(days) || 3);
  }

  /** 지금 붙어 있는 통화 — 화면이 몇 초마다 다시 묻는다 */
  @Get('live')
  live() {
    return this.service.liveCalls();
  }

  /** 휴지통 */
  @Get('dismissed')
  dismissedList() {
    return this.dismissed.list();
  }

  /** 목록에서 치운다 — 저쪽 통화는 그대로 둔다 */
  @Post('dismissed')
  @HttpCode(204)
  async dismiss(
    @CurrentUser() user: AuthUser,
    @Body() body: { userChatId?: string; customerPhone?: string; calledAt?: string },
  ) {
    await this.dismissed.dismiss(user.id, body.userChatId ?? '', body.customerPhone ?? '', body.calledAt ?? '');
  }

  /** 휴지통에서 꺼낸다 */
  @Delete('dismissed/:userChatId')
  @HttpCode(204)
  async restore(@Param('userChatId') userChatId: string) {
    await this.dismissed.restore(userChatId);
  }
}

@Module({ controllers: [ChannelTalkController], providers: [ChannelTalkService, DismissedCallService] })
export class ChannelTalkModule {}
