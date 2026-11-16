import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Query,
  Injectable,
  Logger,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

/**
 * 카비어(carvior.store) 파트너 API 연동.
 *
 * 두 방향이 있다.
 *   읽기 — 저쪽에서 성사된 계약을 가져와 수출 상담·매입 내역에 띄운다.
 *   쓰기 — 차를 보러 가기 전에 **카비어 평가사에게 검차를 맡긴다**(관리자만).
 *
 * 인증은 client_credentials 방식이다 — id/secret으로 1시간짜리 토큰을 받아 쓴다.
 * 열쇠는 .env에만 두고 저장소에는 넣지 않는다(프론트로도 내려보내지 않는다 —
 * 브라우저가 직접 부르면 열쇠가 그대로 드러난다. 그래서 서버가 대신 부른다).
 */

const TOKEN_PATH = '/api/v1/partner-api/oauth/token';

/**
 * 검차 접수 보조 API. 둘 다 카비어의 검차 신청 화면이 쓰는 공개 엔드포인트라
 * 토큰이 필요 없다 — 주문 전에 "이미 넣은 차인지", "그 날 갈 수 있는 평가사가
 * 있는지"를 먼저 확인하려고 쓴다. 확인 없이 주문하면 400/409를 받고 나서야 안다.
 */
const REQUEST_PATH = '/api/v1/external/request';

/**
 * 시세 조회용 공개 API. 카비어의 내 차 시세 조회 화면(/price)이 쓰는 것과 같다.
 * 파트너 열쇠가 필요 없어서 토큰 없이 부른다 — 열쇠가 없어도 시세는 볼 수 있다.
 *
 * 브라우저에서 직접 부르지 않고 서버가 대신 부르는 이유는 CORS다.
 * 저쪽은 자기 도메인에서 부르는 걸 전제로 열어둔 API라, 우리 화면에서 바로 치면 막힌다.
 */
const CAR_SPEC_PATH = '/api/v1/external/car-spec';

/**
 * 저쪽 검색은 적어 넣은 낱말이 **전부** 맞아야 결과를 준다.
 * 그래서 우리가 들고 있는 차명을 그대로 넣으면 대개 빈손으로 돌아온다 —
 * "르노(삼성) SM6", "아우디 A5(2세대) 40TDI quattro" 처럼 괄호와 모델 코드가 붙어 있다.
 *
 * 우리 표기와 저쪽 표기가 다른 것들. 사람이 고쳐 치게 하지 않고 여기서 맞춰준다.
 */
const SPELLING_VARIANTS: [RegExp, string][] = [
  [/산타페/g, '싼타페'],
  [/소나타/g, '쏘나타'],
  [/그렌[저져]/g, '그랜저'],
  [/액센트/g, '엑센트'], // 저쪽은 '엑센트'로 적는다
  // "올뉴 코란도"처럼 우리끼리 붙이는 세대 수식어. 저쪽 등급 이름에는 없다.
  [/(올\s*뉴|더\s*뉴|뉴)\s*/g, ''],
  [/르노\s*삼성|삼성\s*르노/g, '르노'],
];

/**
 * 찾아볼 이름 후보를 좁은 것부터 넓은 것 순으로 만든다.
 *
 * 넓은 쪽부터 찾으면 "K7" 하나로 온 등급이 다 나와서 어느 게 그 차인지 알 수 없다.
 * 좁은 쪽이 맞으면 그게 제일 정확하니 거기서 멈춘다.
 */
export function searchCandidates(name: string): string[] {
  const out: string[] = [];
  const add = (x: string) => {
    const t = x.split(/\s+/).filter(Boolean).join(' ');
    if (t && !out.includes(t)) out.push(t);
  };

  add(name);
  const spelled = SPELLING_VARIANTS.reduce((acc, [from, to]) => acc.replace(from, to), name);
  add(spelled);

  // 괄호 안은 우리끼리 쓰는 세대 표기라 저쪽엔 없다 — "(2세대)", "(삼성)"
  const bare = spelled.replace(/\([^)]*\)/g, ' ');
  add(bare);

  // 이름과 모델 코드를 붙여 적는 사람이 많다 — "벤츠C220", "티구안2.0", "봉고3".
  // 저쪽은 띄어 적어서 그대로는 안 잡힌다. 한글과 영문·숫자 사이를 벌려준다.
  const spaced = bare
    .replace(/([가-힣])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([가-힣])/g, '$1 $2');
  add(spaced);

  // 뒤에 붙은 트림·구동 표기부터 하나씩 떼어낸다 — 앞쪽이 차명일 가능성이 높다.
  const tokens = spaced.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i > 0; i -= 1) add(tokens.slice(0, i).join(' '));

  // 그래도 없으면 낱말 하나씩. 긴 것부터 — "SM6" 가 "르노" 보다 좁다.
  for (const t of [...tokens].sort((a, b) => b.length - a.length)) add(t);

  // 저쪽을 열 번씩 두드리지 않는다. 여기까지 못 찾으면 사람이 고쳐 치는 게 빠르다.
  return out.slice(0, 7);
}

/** 차명 검색 결과 한 줄 — 제조사·모델·등급과 그 등급으로 올라온 매물 수 */
export interface CarSpec {
  manufacturer: string;
  model: string;
  badge: string;
  count: number;
}

/** 그 등급으로 올라온 매물 한 대 */
export interface CarListing {
  id: string;
  model: string;
  badge: string;
  year: string;
  mileage: number;
  fuel: string;
  /** 호가(만원) */
  priceManwon: number;
  thumbnailUrl: string | null;
}

export interface CarviorContract {
  id: number;
  carNumber: string;
  carModel: string;
  carOwner: string;
  dealerName: string;
  /** "2026-08-20 18:00" */
  preferredDateTime: string | null;
  contractWriter: string;
  vehicleTransferred: boolean;
  contractConfirmed: boolean;
  /** 만원 */
  contractDeposit: number | null;
  contractBalance: number | null;
  purchasePrice: number | null;
  /** 주행거리(km) */
  mileage: number | null;
  /** 차키 갯수 */
  keyCount: number | null;
  /**
   * 구전(만원). 전 딜러에게 주는 수수료라 저쪽 이름은 oldDealerFee 다.
   * 안 적힌 계약도 있어서(95건 중 79건) 없을 수 있다.
   */
  oldDealerFee?: number | null;
  status: string;
  createdAt: string;
  reportUrl: string | null;
}

/**
 * 검차를 맡길 때 보내는 것.
 *
 * 앞의 네 개는 없으면 저쪽에서 400이 온다 — 카비어 Booking 테이블에서 비울 수 없는
 * 칸이다. 나머지는 알면 보내고 모르면 비운다.
 */
export interface InspectionOrder {
  carNumber: string;
  /** 차가 있는 곳. 매입 전이면 차주 위치, 단지에 들어온 뒤면 단지 주소 */
  address: string;
  /** "2026-11-20 14:00" — availableSlots()로 고른 값을 그대로 보낸다 */
  preferredDateTime: string;
  /** 신청한 사람 번호 */
  contact: string;

  carModel?: string;
  detailAddress?: string;
  /** 리포트 완료 알림톡을 받을 사람. 안 보내면 신청자가 받는다. */
  dealerName?: string;
  dealerContact?: string;
  carOwner?: string;
  customerContact?: string;
  additionalMemo?: string;
}

/** 검차를 맡긴 직후 저쪽이 돌려주는 것 */
export interface InspectionOrderResult {
  /** 카비어 쪽 접수 번호. 나중에 상태를 맞춰 보는 열쇠다 */
  id: number;
  carNumber: string;
  status: string;
  statusLabel: string;
  /** 자동배정이 바로 붙으면 이름이 온다. 안 붙으면 없다(나중에 배정될 수 있다) */
  assignedDriverName: string | null;
  /**
   * true면 카비어에 우리 발주사 계정이 없어서 **평가사 배정이 건너뛰어진** 상태다.
   * 접수는 저장돼 있으니 카비어 담당자에게 계정 등록을 요청하면 이어진다.
   */
  needsPartnerSetup: boolean;
}

/** 맡긴 검차 한 건의 진행 상태 */
export interface CarviorInspection {
  id: number;
  carNumber: string;
  carModel: string | null;
  /** PENDING / ASSIGNED / CONFIRMED / COMPLETED / CANCELLED */
  status: string;
  /** 저쪽이 만들어 주는 한국어 상태 — 우리가 또 매핑하면 두 군데가 어긋난다 */
  statusLabel: string;
  preferredDateTime: string | null;
  /** 배정된 평가사 이름. 배정 전이면 없다 */
  assignedDriverName: string | null;
  dealerName: string | null;
  mileage: number | null;
  /** 진단이 끝나고 리포트가 올라오면 생긴다. 그 전에는 없다 */
  reportUrl: string | null;
  createdAt: string;
}

@Injectable()
export class CarviorService {
  private readonly logger = new Logger(CarviorService.name);

  private readonly baseUrl: string;
  private readonly partner: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  /** 받아둔 토큰과 만료 시각. 1시간짜리라 매번 새로 받으면 호출이 두 배가 된다. */
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CARVIOR_BASE_URL', 'https://carvior.store');
    this.partner = config.get<string>('CARVIOR_PARTNER', 'anyone-motors');
    this.clientId = config.get<string>('CARVIOR_CLIENT_ID', '');
    this.clientSecret = config.get<string>('CARVIOR_CLIENT_SECRET', '');
  }

  /** 열쇠가 없으면 기능만 꺼둔다 — 없다고 서버가 안 뜨면 무관한 기능까지 같이 죽는다. */
  get enabled(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async findContracts(): Promise<CarviorContract[]> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        '카비어 연동이 설정되지 않았습니다. 서버 .env의 CARVIOR_CLIENT_ID/SECRET을 확인해 주세요.',
      );
    }

    // 토큰이 만료 직전이면 미리 새로 받는다. 401을 받고 나서 재시도하면 그만큼 느려진다.
    const res = await this.get(`/api/v1/partner-api/${this.partner}/completed-contracts`);
    const body = (await res.json()) as { data?: CarviorContract[] };
    return body.data ?? [];
  }

  /**
   * 차명으로 등급을 찾는다.
   *
   * 적어 넣은 이름 그대로 못 찾으면 낱말을 줄여가며 다시 찾는다. 무엇으로 찾았는지
   * 같이 돌려주는 이유: 이름을 바꿔 찾은 걸 모르면 엉뚱한 차 등급을 고르게 된다.
   */
  async searchSpecs(q: string): Promise<{ query: string; specs: CarSpec[] }> {
    for (const candidate of searchCandidates(q)) {
      const specs = await this.publicGet<CarSpec>(`${CAR_SPEC_PATH}/search`, { q: candidate });
      if (specs.length > 0) return { query: candidate, specs };
    }
    return { query: q.trim(), specs: [] };
  }

  /** 고른 등급으로 올라와 있는 매물 — 시세 곡선을 그리는 재료다. */
  async findListings(manufacturer: string, model: string, badge: string): Promise<CarListing[]> {
    return this.publicGet<CarListing>(`${CAR_SPEC_PATH}/listings`, { manufacturer, model, badge });
  }

  /**
   * 검차를 맡긴다.
   *
   * 접수는 저쪽에서 전부 처리한다 — 평가사 자동배정, 평가사 알림, 좌표, 묶음,
   * 관리자 알림톡까지. 우리는 보내고 결과만 받는다.
   */
  async requestInspection(order: InspectionOrder): Promise<InspectionOrderResult> {
    this.assertEnabled();
    const res = await this.send('POST', `/api/v1/partner-api/${this.partner}/inspection-request`, order);
    return (await res.json()) as InspectionOrderResult;
  }

  /** 맡긴 검차들의 진행 상태. 리포트가 올라오면 reportUrl이 같이 온다. */
  async findInspections(limit = 100): Promise<CarviorInspection[]> {
    this.assertEnabled();
    const res = await this.get(
      `/api/v1/partner-api/${this.partner}/inspections?limit=${encodeURIComponent(String(limit))}`,
    );
    const body = (await res.json()) as { data?: CarviorInspection[] };
    return body.data ?? [];
  }

  /**
   * 이미 진단이 돌고 있는 차인지.
   *
   * 주문 버튼을 누르기 전에 확인한다 — 같은 차를 두 번 맡기면 평가사가 두 명 가고
   * 진단비도 두 번 나간다. 저쪽에서도 막지만, 막힌 걸 400으로 알게 되면 적어 넣은
   * 내용이 날아간다.
   */
  async isAlreadyRequested(carNumber: string): Promise<boolean> {
    const body = await this.publicGetOne<{ isDuplicate?: boolean }>(`${REQUEST_PATH}/check-duplicate`, {
      carNumber,
    });
    return !!body?.isDuplicate;
  }

  /**
   * 그 날 그 주소로 갈 수 있는 평가사가 있는 시간대.
   *
   * 아무 시간이나 적어 보내면 접수는 되지만 배정이 안 돼서 하루를 버린다 —
   * 실제로 활동 중인 평가사가 있는 시간만 고르게 한다.
   */
  async availableSlots(address: string, date: string): Promise<unknown> {
    return this.publicGetOne(`${REQUEST_PATH}/available-slots`, { address, date });
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        '카비어 연동이 설정되지 않았습니다. 서버 .env의 CARVIOR_CLIENT_ID/SECRET을 확인해 주세요.',
      );
    }
  }

  /**
   * 열쇠 없이 부르는 공개 API.
   *
   * 시세를 못 불러와도 매입 등록 자체는 되어야 하므로, 실패하면 빈 목록을 준다 —
   * 화면에서는 "비교할 매물을 찾지 못했어요"로 보인다.
   */
  private async publicGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const query = new URLSearchParams(params).toString();
    try {
      const res = await fetch(`${this.baseUrl}${path}?${query}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`카비어 시세 조회 실패 ${res.status}: ${path}`);
        return [];
      }
      const body: unknown = await res.json();
      return Array.isArray(body) ? (body as T[]) : [];
    } catch (e) {
      this.logger.warn(`카비어 시세 조회 실패: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * 열쇠 없이 부르는 공개 API — 목록이 아니라 객체 하나를 주는 것들.
   *
   * publicGet()은 배열이 아니면 빈 배열로 떨어뜨리기 때문에 중복 확인·예약 가능 시간
   * 같은 응답을 받을 수 없다. 여기서는 실패하면 null을 준다 — 확인을 못 했다는 것과
   * "중복 아님"은 다르다. 호출하는 쪽이 그 둘을 갈라 쓰게 한다.
   */
  private async publicGetOne<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const query = new URLSearchParams(params).toString();
    try {
      const res = await fetch(`${this.baseUrl}${path}?${query}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`카비어 조회 실패 ${res.status}: ${path}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      this.logger.warn(`카비어 조회 실패: ${(e as Error).message}`);
      return null;
    }
  }

  private async get(path: string): Promise<Response> {
    return this.send('GET', path);
  }

  /**
   * 토큰을 달아 치고, 만료되면 한 번 다시 친다.
   *
   * ⚠ 실패했을 때 저쪽이 보낸 메시지를 그대로 올려보낸다. 전에는 전부
   * "계약 목록을 가져오지 못했습니다"로 덮었는데, 검차 주문은 "이미 진단이 진행
   * 중입니다"·"희망 일시가 필요합니다"처럼 **사람이 읽고 고칠 수 있는 이유**가
   * 오기 때문에 덮으면 화면에서 뭘 고쳐야 할지 알 수 없다.
   */
  private async send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const call = async () =>
      fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      });

    let res = await call();
    // 만료 시각을 넉넉히 잡아도 서버 시계가 어긋나면 401이 올 수 있다. 한 번은 새 토큰으로 다시 친다.
    if (res.status === 401) {
      this.token = null;
      res = await call();
    }

    if (!res.ok) {
      const reason = await this.readMessage(res);
      this.logger.warn(`카비어 ${method} 실패 ${res.status}: ${path} — ${reason ?? '이유 없음'}`);
      // 409는 중복, 400은 보낸 내용이 모자란 것. 둘 다 사람이 고칠 수 있으니 그대로 전한다.
      if (res.status === 409) throw new ConflictException(reason ?? '이미 접수된 차량입니다.');
      if (res.status === 400) throw new BadRequestException(reason ?? '보낸 내용이 올바르지 않습니다.');
      throw new ServiceUnavailableException(reason ?? '카비어와 통신하지 못했습니다.');
    }

    return res;
  }

  /** Nest가 보내는 에러 본문({ message }) 에서 사람이 읽을 문장만 꺼낸다. */
  private async readMessage(res: Response): Promise<string | null> {
    try {
      const body = (await res.json()) as { message?: string | string[]; error_description?: string };
      const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      return msg || body.error_description || null;
    } catch {
      return null;
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const res = await fetch(`${this.baseUrl}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      this.logger.error(`카비어 토큰 발급 실패 ${res.status}`);
      throw new ServiceUnavailableException('카비어 인증에 실패했습니다. 발급받은 열쇠를 확인해 주세요.');
    }

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new ServiceUnavailableException('카비어 인증 응답에 토큰이 없습니다.');
    }

    this.token = body.access_token;
    // 만료 1분 전에 새로 받는다 — 딱 맞춰 쓰면 요청이 오가는 사이에 만료될 수 있다.
    this.tokenExpiresAt = Date.now() + Math.max((body.expires_in ?? 3600) - 60, 60) * 1000;
    return this.token;
  }
}

@Controller('carvior')
export class CarviorController {
  constructor(private readonly carvior: CarviorService) {}

  /** 연동이 켜져 있는지 — 프론트가 탭을 보여줄지 판단한다. */
  @Get('status')
  status() {
    return { enabled: this.carvior.enabled };
  }

  @Get('contracts')
  contracts() {
    return this.carvior.findContracts();
  }

  /** 시세 조회 — 차명으로 등급 찾기 */
  @Get('car-spec/search')
  searchSpecs(@Query('q') q?: string) {
    const term = (q ?? '').trim();
    // 빈 검색어로 저쪽을 두드리지 않는다 — 글자를 지웠을 때도 요청이 나간다.
    return term ? this.carvior.searchSpecs(term) : { query: '', specs: [] };
  }

  /** 시세 조회 — 고른 등급의 매물 */
  @Get('car-spec/listings')
  listings(
    @Query('manufacturer') manufacturer?: string,
    @Query('model') model?: string,
    @Query('badge') badge?: string,
  ) {
    if (!manufacturer || !model || !badge) return [];
    return this.carvior.findListings(manufacturer, model, badge);
  }

  /* ───────────────── 검차 맡기기 ───────────────── */

  /**
   * 검차를 맡긴다 — **관리자만**.
   *
   * 누르면 진단비가 상사 청구액에 올라간다. 직원이 차 보러 가기 전에 자유롭게
   * 누르게 하면 월말에 청구액을 보고 놀라게 된다. 직원이 필요하다고 하면 관리자가
   * 눌러주는 흐름으로 시작하고, 쓰다 보고 풀지 결정한다(푸는 건 쉽고 조이는 건 어렵다).
   */
  @Roles(Role.ADMIN)
  @Post('inspection-request')
  async requestInspection(@Body() body: InspectionOrder, @CurrentUser() user: AuthUser) {
    const carNumber = body?.carNumber?.trim();
    if (!carNumber) throw new BadRequestException('차량번호를 적어 주세요.');

    // 적어 넣은 내용이 날아가지 않게 보내기 전에 먼저 본다. 확인 자체가 실패하면
    // (null) 막지 않고 보낸다 — 저쪽에서 한 번 더 걸러낸다.
    if (await this.carvior.isAlreadyRequested(carNumber)) {
      throw new ConflictException(`${carNumber}는 이미 카비어에 진단이 접수된 차량입니다.`);
    }

    return this.carvior.requestInspection({
      ...body,
      carNumber,
      // 리포트 완료 알림톡을 누가 받을지. 적어 보내지 않았으면 누른 사람이 받는다.
      dealerName: body.dealerName?.trim() || user.name,
    });
  }

  /** 맡긴 검차들의 진행 상태 — 전 직원이 본다. 리포트는 다 같이 봐야 쓸모가 있다. */
  @Get('inspections')
  inspections(@Query('limit') limit?: string) {
    return this.carvior.findInspections(Math.min(Math.max(Number(limit) || 100, 1), 500));
  }

  /** 그 주소·날짜에 갈 수 있는 평가사가 있는 시간대 */
  @Get('available-slots')
  availableSlots(@Query('address') address?: string, @Query('date') date?: string) {
    if (!address?.trim() || !date?.trim()) {
      throw new BadRequestException('주소와 날짜를 모두 적어 주세요.');
    }
    return this.carvior.availableSlots(address.trim(), date.trim());
  }

  /** 이미 진단이 돌고 있는 차인지 — 주문 폼에서 차량번호를 적는 동안 확인한다 */
  @Get('check-duplicate')
  async checkDuplicate(@Query('carNumber') carNumber?: string) {
    const target = carNumber?.trim();
    if (!target) return { isDuplicate: false };
    return { isDuplicate: await this.carvior.isAlreadyRequested(target) };
  }
}

@Module({
  controllers: [CarviorController],
  providers: [CarviorService],
  // 매입 관리가 계약을 일괄로 끌어다 쓴다.
  exports: [CarviorService],
})
export class CarviorModule {}
