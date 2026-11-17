import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * 올린 파일을 어디에 둘지 한 곳에서 정한다.
 *
 * 전에는 올리는 자리마다(차량사진·근태·상조회비·공지·정산·판금인보이스 여섯 곳)
 * multer의 diskStorage로 상자 안에 직접 떨어뜨리고 Apache가 /uploads 로 내줬다.
 * 상자 디스크가 사진에 그대로 먹히는 구조다 — carvior 상자는 29G 중 6.5G만 남아 있고,
 * 2026-09-28에 이미 디스크가 꽉 차서 목록 API가 500을 뿜은 적이 있다.
 * 사진은 계속 쌓이고 줄지 않는다.
 *
 * 그래서 S3로 보낸다. 카비어가 쓰는 버킷을 **접두어(prefix)로 갈라서** 함께 쓴다 —
 * 진단 리포트 사진과 섞이면 어느 것이 무엇인지 알 수 없다.
 *
 * ⚠ AWS 키가 없으면 전처럼 로컬 디스크에 쓴다.
 * 개발 PC에는 키가 없고, 키가 없다고 업로드가 터지면 화면을 못 만든다. 운영에서는
 * .env에 키가 있으니 S3로 간다 — 뜰 때 로그에 어느 쪽인지 한 줄 남긴다.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  /** 버킷 안에서 이 제품 파일이 사는 자리. 카비어 진단 사진과 섞이지 않게 갈라 둔다 */
  private readonly prefix: string;
  /** 로컬 폴백용 — 기존 UPLOAD_DIR 과 같은 값 */
  private readonly localDir: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('AWS_S3_BUCKET_NAME', '');
    this.region = config.get<string>('AWS_S3_REGION', '');
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY', '');
    const secretAccessKey = config.get<string>('AWS_SECRET_KEY', '');
    // 접두어 양끝 슬래시는 떼어 둔다 — 붙어 있으면 키가 "//" 로 시작해서 S3에서
    // 빈 이름 폴더가 하나 생긴다(콘솔에서 보면 이름 없는 칸이 뜬다).
    this.prefix = config.get<string>('S3_PREFIX', 'carvior-biz').replace(/^\/+|\/+$/g, '');
    this.localDir = config.get<string>('UPLOAD_DIR', './uploads');

    const ready = Boolean(this.bucket && this.region && accessKeyId && secretAccessKey);
    this.s3 = ready ? new S3Client({ region: this.region, credentials: { accessKeyId, secretAccessKey } }) : null;

    if (ready) {
      this.logger.log(`업로드 → S3 s3://${this.bucket}/${this.prefix}/ (${this.region})`);
    } else {
      this.logger.warn(
        `업로드 → 로컬 디스크 ${this.localDir} (AWS 키 없음). 운영이라면 .env의 ` +
          `AWS_S3_BUCKET_NAME / AWS_S3_REGION / AWS_ACCESS_KEY / AWS_SECRET_KEY 를 확인하세요.`,
      );
    }
  }

  get usesS3(): boolean {
    return this.s3 !== null;
  }

  /**
   * 파일 하나를 저장하고 **화면에서 그대로 쓸 수 있는 주소**를 돌려준다.
   *
   * 원본 파일명은 쓰지 않는다 — 한글 이름이 깨지고 경로에 넣기 위험한 글자가 섞여 들어온다.
   * 확장자만 소문자로 가져가고 이름은 UUID로 새로 짓는다(기존 diskStorage와 같은 규칙).
   *
   * @param folder 'vehicles' | 'attendance' | 'notices' | ... — 종류별로 나누는 칸
   */
  async save(file: Express.Multer.File, folder: string): Promise<string> {
    const name = `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`;

    if (!this.s3) {
      // 로컬 폴백 — 전과 같은 자리, 전과 같은 주소 모양
      const dir = join(this.localDir, folder);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), file.buffer);
      return `/uploads/${folder}/${name}`;
    }

    const key = `${this.prefix}/${folder}/${name}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // 사진은 바뀌지 않는다(이름이 UUID라 같은 주소에 다른 내용이 올 일이 없다).
        // 브라우저가 오래 들고 있게 해서 S3 요청 수와 요금을 줄인다.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /** 여러 장 — 한 장이라도 실패하면 전체가 실패한다(절반만 올라간 묶음이 더 나쁘다) */
  async saveAll(files: Express.Multer.File[], folder: string): Promise<string[]> {
    return Promise.all(files.map((f) => this.save(f, folder)));
  }

  /**
   * 저장된 주소로 파일을 지운다.
   *
   * 이미 없으면 조용히 넘어간다 — 지우는 쪽은 DB 줄을 없애는 것이 목적이고, 파일이
   * 먼저 사라져 있다고 그 일을 막을 이유가 없다.
   *
   * 로컬에 있던 옛 파일(`/uploads/...`)과 S3 주소를 둘 다 받는다. 운영 중에 S3로
   * 넘어가면 DB에 두 모양이 섞이는데, 지우는 쪽에서 가려내지 않으면 옛 파일이 영원히 남는다.
   */
  async remove(url: string): Promise<void> {
    if (!url) return;

    if (url.startsWith('/uploads/')) {
      try {
        await unlink(join(this.localDir, url.slice('/uploads/'.length)));
      } catch {
        // 이미 없으면 그만이다
      }
      return;
    }

    const key = this.keyFromUrl(url);
    if (!key || !this.s3) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      // 지우기 실패가 DB 정리를 막으면 안 된다. 남은 것은 로그로 쫓는다.
      this.logger.warn(`S3 삭제 실패 ${key}: ${(e as Error).message}`);
    }
  }

  async removeAll(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(urls.filter((u): u is string => !!u).map((u) => this.remove(u)));
  }

  /** `https://버킷.s3.리전.amazonaws.com/키` → `키`. 우리 버킷이 아니면 null */
  private keyFromUrl(url: string): string | null {
    try {
      const { hostname, pathname } = new URL(url);
      if (!hostname.startsWith(`${this.bucket}.`)) return null;
      return decodeURIComponent(pathname.replace(/^\/+/, '')) || null;
    } catch {
      return null;
    }
  }

  /** 업로드 자리에서 공통으로 쓰는 실패 메시지 */
  static uploadFailed(): never {
    throw new InternalServerErrorException('사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
