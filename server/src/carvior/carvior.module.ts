import {
  Controller,
  Get,
  Query,
  Injectable,
  Logger,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 카비어(carvior.store) 파트너 API 연동.
 *
 * 저쪽에서 성사된 계약을 읽어와 수출 상담 화면에 띄운다. 읽기 전용이다.
 *
 * 인증은 client_credentials 방식이다 — id/secret으로 1시간짜리 토큰을 받아 쓴다.
 * 열쇠는 .env에만 두고 저장소에는 넣지 않는다(프론트로도 내려보내지 않는다 —
 * 브라우저가 직접 부르면 열쇠가 그대로 드러난다. 그래서 서버가 대신 부른다).
 */

const TOKEN_PATH = '/api/v1/partner-api/oauth/token';

/**
 * 시세 조회용 공개 API. 카비어의 내 차 시세 조회 화면(/price)이 쓰는 것과 같다.
 * 파트너 열쇠가 필요 없어서 토큰 없이 부른다 — 열쇠가 없어도 시세는 볼 수 있다.
 *
 * 브라우저에서 직접 부르지 않고 서버가 대신 부르는 이유는 CORS다.
 * 저쪽은 자기 도메인에서 부르는 걸 전제로 열어둔 API라, 우리 화면에서 바로 치면 막힌다.
 */
const CAR_SPEC_PATH = '/api/v1/external/car-spec';

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
   * 구전. 2026-09 현재 카비어는 이 값을 안 내려준다 — 저쪽에 칸이 생기면
   * 그대로 흘러오도록 자리만 열어뒀다(없으면 undefined 라 매입 등록에서 0으로 둔다).
   */
  brokerFee?: number | null;
  status: string;
  createdAt: string;
  reportUrl: string | null;
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

  /** 차명으로 등급을 찾는다 — "K7" 처럼 적으면 그 차의 등급들이 나온다. */
  async searchSpecs(q: string): Promise<CarSpec[]> {
    return this.publicGet<CarSpec>(`${CAR_SPEC_PATH}/search`, { q });
  }

  /** 고른 등급으로 올라와 있는 매물 — 시세 곡선을 그리는 재료다. */
  async findListings(manufacturer: string, model: string, badge: string): Promise<CarListing[]> {
    return this.publicGet<CarListing>(`${CAR_SPEC_PATH}/listings`, { manufacturer, model, badge });
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

  private async get(path: string): Promise<Response> {
    let res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });

    // 만료 시각을 넉넉히 잡아도 서버 시계가 어긋나면 401이 올 수 있다. 한 번은 새 토큰으로 다시 친다.
    if (res.status === 401) {
      this.token = null;
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
      });
    }

    if (!res.ok) {
      this.logger.warn(`카비어 조회 실패 ${res.status}: ${path}`);
      throw new ServiceUnavailableException('카비어에서 계약 목록을 가져오지 못했습니다.');
    }
    return res;
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
    return term ? this.carvior.searchSpecs(term) : [];
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
}

@Module({
  controllers: [CarviorController],
  providers: [CarviorService],
  // 매입 관리가 계약을 일괄로 끌어다 쓴다.
  exports: [CarviorService],
})
export class CarviorModule {}
