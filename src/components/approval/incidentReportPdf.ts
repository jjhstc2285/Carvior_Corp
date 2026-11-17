import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ApprovalDocument } from '../../types';

/**
 * 그리는 데 쓰는 칸만 받는다.
 *
 * 저장된 문서만 받게 두면 올리기 전에는 못 본다 — 다 적어 놓고 어떻게 나오는지 보려고
 * 결재부터 올리게 된다. 적는 창에서 지금 적은 값 그대로 만들어 볼 수 있어야 한다.
 */
export type IncidentReportLike = Pick<
  ApprovalDocument,
  'department' | 'position' | 'name' | 'content' | 'writtenOn'
> &
  Partial<Pick<ApprovalDocument, 'occurredOn' | 'occurredTime' | 'occurredPlace' | 'cause' | 'action' | 'prevention'>>;

/**
 * 시말서 PDF — 회사 양식 그대로 그린다.
 *
 * 부동산 계약서는 쓰던 한글 양식을 PDF로 깔고 빈칸에 값만 얹는다. 시말서는 그렇게 못 한다 —
 * 받은 양식이 스캔한 그림이고, 무엇보다 네 꼭지에 들어가는 글이 길어서 줄을 접어야 한다.
 * 깔아 놓은 종이 위에 긴 글을 얹으면 칸 밖으로 넘치거나 한 줄로 잘린다.
 *
 * 그래서 선부터 글자까지 직접 그린다. 양식에 있는 것만 그대로 옮긴다 —
 * 결재란(담당·관리자·대표이사), 윗표, 네 꼭지, 맺음 날짜와 작성자, '<상사 이름> 귀중'.
 *
 * 도장은 안 찍는다. 결재란은 비워서 뽑고 손으로 찍는 자리다.
 */

/** 한글이 박히는 글꼴(나눔고딕, OFL). 부동산 계약서와 같은 파일을 쓴다 */
const FONT_URL = '/forms/NanumGothic-Regular.ttf';

/* A4 — 왼쪽 아래가 0,0 이다 */
const W = 595;
const H = 842;
const MARGIN = 45;
const RIGHT = W - MARGIN;
const LINE = rgb(0, 0, 0);

/** 2026-10-19 → "2026 년 10 월 19 일". 안 적었으면 빈 양식처럼 남긴다 */
function korDate(day?: string | null): string {
  if (!day) return '20      년        월        일';
  const [y, m, d] = day.split('-');
  return `${y} 년  ${Number(m)} 월  ${Number(d)} 일`;
}

/**
 * 글을 칸 너비에 맞춰 접는다.
 *
 * 글자마다 너비를 재서 넘치면 끊는다. 한글은 띄어쓰기 없이 길게 적는 일이 많아
 * 낱말 단위로만 끊으면 한 줄이 통째로 삐져나간다 — 글자 단위로도 끊는다.
 */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      const next = line + ch;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = ch === ' ' ? '' : ch;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/** @param shopName 서류를 받는 상사 이름. 상사마다 달라서 박아 두지 않고 받는다. */
export async function makeIncidentReportPdf(doc: IncidentReportLike, shopName: string): Promise<Uint8Array> {
  const fontBytes = await fetch(FONT_URL).then(r => {
    if (!r.ok) throw new Error('글꼴 파일을 찾지 못했습니다.');
    return r.arrayBuffer();
  });

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  /*
    글꼴을 통째로 심는다.

    쓰는 글자만 골라 담으면(subset) 한글 글립이 빠진 채로 담겨서 뷰어가 네모 상자만
    그린다 — 글자는 들어 있는데 눈에는 하나도 안 보인다. 파일이 커지는 쪽을 택한다.
  */
  const font = await pdf.embedFont(fontBytes, { subset: false });
  let page = pdf.addPage([W, H]);

  const text = (s: string, x: number, y: number, size = 10) => {
    if (!s) return;
    page.drawText(s, { x, y, size, font, color: LINE });
  };
  /** 가운데 맞춤 — 제목과 맺음말에 쓴다 */
  const center = (s: string, y: number, size: number) => {
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: (W - w) / 2, y, size, font, color: LINE });
  };
  const box = (x: number, y: number, w: number, h: number) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE, borderWidth: 1 });

  let y = H - MARGIN;

  // ── 머리 : 회사 이름 + 결재란(비워 둔다) ──
  const APPROVERS = ['담당', '관리자', '대표이사'];
  const colW = 62;
  const headW = colW * APPROVERS.length;
  const headX = RIGHT - headW;
  const titleH = 18;
  const signH = 46;
  y -= titleH;
  APPROVERS.forEach((label, i) => {
    const x = headX + colW * i;
    box(x, y, colW, titleH);
    box(x, y - signH, colW, signH);
    const w = font.widthOfTextAtSize(label, 9);
    text(label, x + (colW - w) / 2, y + 5, 9);
  });
  text(shopName, MARGIN, y - 4, 12);

  y -= signH + 46;
  center('시   말   서', y, 24);

  // ── 윗표 : 소속·성명·발생 일시까지 ──
  y -= 34;
  const rowH = 26;
  const labelW = 86;
  const valueW = (RIGHT - MARGIN - labelW * 2) / 2;
  const rows: [string, string, string, string][] = [
    ['소속 부서', doc.department || '', '직위 / 직책', doc.position || ''],
    ['성명', doc.name, '작성일자', korDate(doc.writtenOn)],
    [
      '발생 일시',
      `${korDate(doc.occurredOn)}${doc.occurredTime ? `  ${doc.occurredTime}` : '  시'}`,
      '발생 장소',
      doc.occurredPlace || '',
    ],
  ];
  for (const [l1, v1, l2, v2] of rows) {
    y -= rowH;
    const xs = [MARGIN, MARGIN + labelW, MARGIN + labelW + valueW, MARGIN + labelW * 2 + valueW];
    const ws = [labelW, valueW, labelW, valueW];
    [l1, v1, l2, v2].forEach((cell, i) => {
      box(xs[i], y, ws[i], rowH);
      const isLabel = i % 2 === 0;
      const size = isLabel ? 9.5 : 9;
      const w = font.widthOfTextAtSize(cell, size);
      // 칸 이름은 가운데, 적은 값은 왼쪽에서 조금 띄워 놓는다
      text(cell, isLabel ? xs[i] + (ws[i] - w) / 2 : xs[i] + 7, y + rowH / 2 - size / 2 + 1, size);
    });
  }

  // ── 네 꼭지 ──
  const SECTIONS: [string, string][] = [
    ['1. 사건 및 경위', doc.content ?? ''],
    ['2. 발생 원인 및 사유', doc.cause ?? ''],
    ['3. 조치 사항', doc.action ?? ''],
    ['4. 재발 방지 대책', doc.prevention ?? ''],
  ];
  const bodyW = RIGHT - MARGIN;
  const pad = 9;
  const size = 9.5;
  const leading = 14;
  /** 비어 있어도 네모는 그린다 — 적을 자리가 비어 있다는 것도 뜻이 있다 */
  const minLines = 4;

  for (const [title, body] of SECTIONS) {
    const lines = body.trim() ? wrap(body.trim(), font, size, bodyW - pad * 2) : [];
    const boxH = Math.max(minLines, lines.length) * leading + pad * 2;

    /*
      다음 장으로 넘긴다.

      한 꼭지가 장 끝에 걸치면 제목만 남고 내용이 다음 장으로 넘어가 두 쪽짜리 토막이
      된다 — 들어갈 자리가 모자라면 통째로 넘긴다.
    */
    if (y - 24 - boxH < MARGIN + 70) {
      page = pdf.addPage([W, H]);
      y = H - MARGIN;
    }

    y -= 24;
    const tw = font.widthOfTextAtSize(title, 11);
    text(title, (W - tw) / 2, y, 11);

    y -= 8 + boxH;
    box(MARGIN, y, bodyW, boxH);
    lines.forEach((line, i) => text(line, MARGIN + pad, y + boxH - pad - size - i * leading, size));
  }

  // ── 맺음 : 날짜 · 작성자 · 귀중 ──
  y -= 44;
  if (y < MARGIN + 40) {
    page = pdf.addPage([W, H]);
    y = H - MARGIN - 60;
  }
  const tail = korDate(doc.writtenOn);
  text(tail, MARGIN + 60, y, 10);
  text(`작성자 :  ${doc.name}`, MARGIN + 270, y, 10);
  text('(서명)', MARGIN + 420, y, 10);

  y -= 40;
  center(`${shopName} 귀중`, y, 11);

  return pdf.save();
}
