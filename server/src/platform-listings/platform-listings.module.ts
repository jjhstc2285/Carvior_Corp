import { request as httpsRequest } from 'node:https';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { normalizePlate } from '../vehicles/vehicle.rules';

/**
 * 플랫폼별 매물 — 우리 값과 엔카·차차차에 올라간 값이 같은가.
 *
 * 올려 둔 값이 플랫폼마다 다르면 손님이 먼저 안다. 싸게 올라간 쪽을 보고 와서 그 값을
 * 부르는데, 우리 쪽 장부에는 다른 값이 적혀 있다 — 그 자리에서 깎이거나 말이 바뀐다.
 *
 * 그동안 구글 시트로 돌렸다. 시트는 그대로 두고(거기서 모으는 사람이 있다) 여기로
 * 끌어와 본다. 끌어올 때는 차량번호로 맞춘다 — 같은 차가 두 줄이 되지 않게.
 */

/**
 * 끌어오는 시트.
 *
 * 한 문서에 일곱 장이 있는데 네 장은 엔카·차차차 화면에서 긁어 붙이는 자리다(검색결과,
 * 가격 일괄 수정, 아이디별 매물…). 수식이 먹는 원본이지 사람이 관리하는 값이 아니라
 * 떠오지 않는다 — 그 자리는 원본 시트에서 그대로 쓴다.
 *
 * 떠오는 건 결과가 쌓이는 세 장이다.
 */
const SHEET_ID_DEFAULT = '1mddXpb3V5BbDj4IVY4Z5SSJynlngApt8aULN-tRbT_E';

const TABS = {
  /** 플랫폼별 매물 목록 — 우리 값과 엔카·차차차 값 */
  listing: '1128555042',
  /** 특이사항 — 특이차량과 플랫폼별 미등록·판매완료 신고 */
  issue: '1501961003',
  /** 엔카 등록 현황 — 어느 아이디로 올라가 있나 */
  account: '1872010088',
} as const;

/** 이 자리는 대표와 광고팀만 본다 — 화면과 같은 기준이다(src/lib/permissions.ts) */
const SHEET_TEAM = '광고팀';

function canSee(user: AuthUser): boolean {
  return user.role === Role.ADMIN || (user.department ?? '').trim() === SHEET_TEAM;
}

/**
 * 쉼표로 끊긴 글을 줄과 칸으로 푼다.
 *
 * 차량명에 줄바꿈이 들어 있다("제네시스 EQ900\n3.8 GDi…"). 줄 단위로 먼저 끊으면 한
 * 대가 두 줄로 갈라지므로, 따옴표 안인지를 보면서 글자 하나씩 읽는다.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // 따옴표 두 개는 따옴표 한 글자다
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** "1,270" → 1270. 숫자가 아니면 0이다('엔카 미등록', '계약중' 같은 말) */
function moneyOf(text: string): number {
  const digits = (text ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

@Injectable()
export class PlatformListingsService {
  private readonly logger = new Logger(PlatformListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list() {
    return this.prisma.platformListing.findMany({ orderBy: { vehicleNumber: 'asc' } });
  }

  /**
   * 시트를 받아 온다.
   *
   * IPv4 로 못 박는다 — 이 상자는 IPv6 길이 뚫려 있지 않아, 그대로 두면 이름은 풀리는데
   * 연결에서 멈춘다(공지방에서 같은 일을 겪었다).
   *
   * 구글이 다른 주소로 넘기는 일이 있어 세 번까지 따라간다.
   */
  private fetchCsv(url: string, hops = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const req = httpsRequest(
        {
          host: target.host,
          path: `${target.pathname}${target.search}`,
          method: 'GET',
          family: 4,
          timeout: 20_000,
          headers: { accept: 'text/csv,*/*' },
        },
        (res) => {
          const moved = res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
          if (moved) {
            if (hops >= 3) {
              reject(new Error('시트 주소가 계속 넘어갑니다.'));
              return;
            }
            res.resume();
            resolve(this.fetchCsv(new URL(res.headers.location as string, url).toString(), hops + 1));
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`시트를 받지 못했습니다(${res.statusCode}). 시트 공유가 '링크가 있는 사용자'인지 보세요.`));
            return;
          }
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () => resolve(text));
        },
      );
      req.on('timeout', () => req.destroy(new Error('시트가 응답하지 않습니다(20초).')));
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * 시트에서 끌어온다 — 차량번호로 맞춰 덮어쓴다.
   *
   * 시트에 없는 차는 안 지운다. 시트가 한 번 비어서 오면 우리 줄이 통째로 날아간다 —
   * 지우는 건 사람이 화면에서 한다.
   */
  async importFromSheet() {
    const rows = parseCsv(await this.fetchCsv(this.csvUrl(TABS.listing)));

    /*
      머리줄을 찾는다.

      첫 줄은 '플랫폼별 매물 목록 (매물 수: 249대)' 같은 제목이라 칸 이름이 아니다.
      '차량번호'가 들어 있는 줄을 머리로 본다 — 제목이 바뀌어도 따라간다.
    */
    const head = rows.findIndex((r) => r.some((c) => c.includes('차량번호')));
    if (head < 0) throw new Error("시트에서 '차량번호' 칸을 못 찾았습니다.");

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows.slice(head + 1)) {
      const plate = normalizePlate((row[1] ?? '').trim());
      if (!plate) {
        skipped += 1;
        continue;
      }

      const priceCell = (row[2] ?? '').trim();
      const data = {
        // 줄바꿈이 들어 있다 — 한 줄로 편다
        vehicleName: (row[0] ?? '').replace(/\s*\n\s*/g, ' ').trim().slice(0, 120),
        salePrice: moneyOf(priceCell),
        // 숫자가 아니면 그 말을 남긴다('계약중'·'예약')
        saleNote: moneyOf(priceCell) === 0 ? priceCell.slice(0, 20) : '',
        encar: moneyOf(row[3] ?? ''),
        chacha: moneyOf(row[4] ?? ''),
        // 오토벨 칸(row[5])은 안 가져온다 — 안 쓰기로 했다
        syncedAt: new Date(),
      };

      const before = await this.prisma.platformListing.findUnique({
        where: { vehicleNumber: plate },
        select: { id: true },
      });
      await this.prisma.platformListing.upsert({
        where: { vehicleNumber: plate },
        create: { vehicleNumber: plate, ...data },
        update: data,
      });
      if (before) updated += 1;
      else added += 1;
    }

    this.logger.log(`플랫폼 매물 시트 — 새로 ${added}대, 고침 ${updated}대`);
    return { added, updated, skipped, total: added + updated };
  }

  /** 그 장을 CSV로 받아올 주소 */
  private csvUrl(gid: string): string {
    const id = this.config.get<string>('PLATFORM_SHEET_ID', '').trim() || SHEET_ID_DEFAULT;
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }

  issues() {
    return this.prisma.platformIssue.findMany({ orderBy: [{ kind: 'asc' }, { site: 'asc' }, { vehicleNumber: 'asc' }] });
  }

  accounts() {
    return this.prisma.platformAccount.findMany({ orderBy: [{ encarId: 'asc' }, { vehicleNumber: 'asc' }] });
  }

  /**
   * 특이사항 장을 끌어온다.
   *
   * 한 장에 세 가지가 옆으로 나란히 붙어 있다 — 왼쪽 세 칸은 특이차량이고, 그 오른쪽은
   * 플랫폼마다 '미등록'과 '판매완료 신고' 목록이다. 칸마다 다른 목록이라 줄 단위로
   * 읽어서는 안 되고, 머리글을 보고 어느 칸이 무엇인지 가려야 한다.
   *
   * 오토벨 칸은 건너뛴다 — 안 쓰기로 했다.
   */
  private async importIssues() {
    const rows = parseCsv(await this.fetchCsv(this.csvUrl(TABS.issue)));
    const head = rows.findIndex((r) => r.some((c) => c.includes('특이차량')));
    if (head < 0) throw new Error("특이사항 장에서 '특이차량' 칸을 못 찾았습니다.");

    const title = rows[head];
    const body = rows.slice(head + 1);
    const now = new Date();
    type Row = { site: string; kind: string; vehicleNumber: string; issue: string; note: string };
    const found: Row[] = [];

    for (const row of body) {
      // 왼쪽 세 칸 — 특이차량
      const plate = normalizePlate((row[0] ?? '').trim());
      if (plate) {
        found.push({
          site: '',
          kind: '특이',
          vehicleNumber: plate,
          issue: (row[1] ?? '').trim().slice(0, 30),
          note: (row[2] ?? '').trim().slice(0, 60),
        });
      }

      // 오른쪽 칸들 — 머리글이 무엇을 담는 칸인지 말해 준다
      for (let i = 3; i < title.length; i += 1) {
        const label = (title[i] ?? '').trim();
        if (!label || label.includes('오토벨')) continue;

        const site = label.includes('엔카') ? '엔카' : label.includes('차차차') ? '차차차' : '';
        const kind = label.includes('미등록') ? '미등록' : label.includes('판매완료') ? '판매완료신고' : '';
        if (!site || !kind) continue;

        const cell = (row[i] ?? '').trim();
        const target = normalizePlate(cell);
        // '검색 안됨' 같은 말이 들어오기도 한다 — 차량번호 꼴이 아니면 안 담는다
        if (!target || !/\d/.test(target) || target.length < 5) continue;
        found.push({ site, kind, vehicleNumber: target, issue: '', note: '' });
      }
    }

    /*
      통째로 갈아끼운다.

      이 장은 '지금 남은 할 일' 목록이다. 처리해서 시트에서 빠진 줄이 우리 쪽에 남아
      있으면, 다 끝낸 일을 매번 다시 들여다보게 된다.
    */
    await this.prisma.$transaction(async (tx) => {
      await tx.platformIssue.deleteMany({});
      if (found.length > 0) {
        await tx.platformIssue.createMany({ data: found.map((f) => ({ ...f, syncedAt: now })) });
      }
    });
    return found.length;
  }

  /** 엔카 등록 현황 — 차량번호로 맞춰 덮어쓴다 */
  private async importAccounts() {
    const rows = parseCsv(await this.fetchCsv(this.csvUrl(TABS.account)));
    const head = rows.findIndex((r) => r.some((c) => c.includes('차량번호')));
    if (head < 0) throw new Error("엔카 현황 장에서 '차량번호' 칸을 못 찾았습니다.");

    let count = 0;
    for (const row of rows.slice(head + 1)) {
      const plate = normalizePlate((row[0] ?? '').trim());
      if (!plate) continue;
      const data = {
        encarId: (row[1] ?? '').trim().slice(0, 30),
        status: (row[2] ?? '').trim().slice(0, 30),
        // '#N/A' 는 시트 수식이 못 찾았다는 말이지 중복이 아니다
        duplicate: (row[3] ?? '').trim().startsWith('#') ? '' : (row[3] ?? '').trim().slice(0, 30),
        syncedAt: new Date(),
      };
      await this.prisma.platformAccount.upsert({
        where: { vehicleNumber: plate },
        create: { vehicleNumber: plate, ...data },
        update: data,
      });
      count += 1;
    }
    return count;
  }

  /** 세 장을 한 번에 — 한 장이 넘어져도 나머지는 들어온다 */
  async importAll() {
    const listing = await this.importFromSheet();
    const issues = await this.importIssues().catch((e: Error) => {
      this.logger.warn(`특이사항 장: ${e.message}`);
      return 0;
    });
    const accounts = await this.importAccounts().catch((e: Error) => {
      this.logger.warn(`엔카 현황 장: ${e.message}`);
      return 0;
    });
    return { ...listing, issues, accounts };
  }

  async update(
    id: string,
    dto: Partial<Record<'vehicleName' | 'saleNote' | 'memo', string>> &
      Partial<Record<'salePrice' | 'encar' | 'chacha', number>>,
  ) {
    const won = (n: number | undefined) => (n === undefined ? undefined : Math.max(0, Math.round(n)));
    return this.prisma.platformListing.update({
      where: { id },
      data: {
        ...(dto.vehicleName !== undefined ? { vehicleName: dto.vehicleName.slice(0, 120) } : {}),
        ...(dto.saleNote !== undefined ? { saleNote: dto.saleNote.slice(0, 20) } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.slice(0, 255) } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: won(dto.salePrice) } : {}),
        ...(dto.encar !== undefined ? { encar: won(dto.encar) } : {}),
        ...(dto.chacha !== undefined ? { chacha: won(dto.chacha) } : {}),
        // 손으로 고친 줄은 시트에서 온 것과 가려 보여야 한다
        syncedAt: null,
      },
    });
  }

  async remove(id: string) {
    await this.prisma.platformListing.deleteMany({ where: { id } });
  }
}

@Controller('platform-listings')
export class PlatformListingsController {
  constructor(private readonly service: PlatformListingsService) {}

  private assert(user: AuthUser): void {
    if (!canSee(user)) throw new ForbiddenException('플랫폼 매물은 대표와 광고팀만 봅니다.');
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    this.assert(user);
    return this.service.list();
  }

  @Get('issues')
  issues(@CurrentUser() user: AuthUser) {
    this.assert(user);
    return this.service.issues();
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser) {
    this.assert(user);
    return this.service.accounts();
  }

  @Post('import')
  importSheet(@CurrentUser() user: AuthUser) {
    this.assert(user);
    return this.service.importAll();
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Record<string, never>) {
    this.assert(user);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.assert(user);
    await this.service.remove(id);
  }
}

@Module({ controllers: [PlatformListingsController], providers: [PlatformListingsService] })
export class PlatformListingsModule {}
