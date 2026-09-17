import { PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { LeaseContract } from '../../types';

/**
 * 원본 계약서 양식(PDF)에 값을 얹는다.
 *
 * 사무장님이 쓰던 한글 양식을 PDF로 받아 그대로 깔고, 빈칸 자리에 글자만 올린다 —
 * 우리가 다시 그린 서식이 아니라 쓰던 종이 그대로라, 받아 보는 쪽이 다시 확인할 일이 없다.
 *
 * 좌표는 원본에서 글자 위치를 뽑아 잡았다(A4 595 x 841pt, 왼쪽 아래가 0,0).
 * 칸 이름이 있는 x 를 기준으로 그 뒤에 값을 놓는다 — 양식이 바뀌면 여기 숫자만 고친다.
 *
 * 주민등록번호·법인등록번호·도장은 일부러 비운다. 손으로 적고 찍는 자리다.
 */

const TEMPLATE_URL = '/forms/lease-contract.pdf';
/** 한글이 박히는 글꼴(나눔고딕, OFL). 원본 글꼴은 남의 것이라 쓸 수 없다. */
const FONT_URL = '/forms/NanumGothic-Regular.ttf';

const won = (n: number) => (n > 0 ? n.toLocaleString() : '');

/** 날짜를 연·월·일로 나눠 각 칸에 넣는다 — 양식이 "년 월 일"로 끊겨 있다 */
function ymdParts(date: string | null): [string, string, string] {
  if (!date) return ['', '', ''];
  const [y, m, d] = date.split('-');
  return [y, String(Number(m)), String(Number(d))];
}

export async function fillLeaseContractPdf(c: LeaseContract): Promise<Uint8Array> {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(TEMPLATE_URL).then(r => {
      if (!r.ok) throw new Error('계약서 양식 파일을 찾지 못했습니다.');
      return r.arrayBuffer();
    }),
    fetch(FONT_URL).then(r => {
      if (!r.ok) throw new Error('글꼴 파일을 찾지 못했습니다.');
      return r.arrayBuffer();
    }),
  ]);

  const pdf = await PDFDocument.load(templateBytes);
  pdf.registerFontkit(fontkit);
  /*
    글꼴을 통째로 심는다.

    쓰는 글자만 골라 담으면(subset) 파일은 작아지는데, 한글 글립이 빠진 채로 담겨서
    뷰어가 네모 상자만 그린다 — 글자는 들어 있는데 눈에는 하나도 안 보인다.
    파일이 100KB → 800KB로 늘지만, 안 보이는 계약서보다는 낫다.
  */
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const page = pdf.getPage(0);

  /** 한 칸에 글자를 놓는다. 비어 있으면 아무것도 안 그린다(손으로 적을 자리로 남는다) */
  const put = (text: string | number | null | undefined, x: number, y: number, size = 9) => {
    const value = String(text ?? '').trim();
    if (!value) return;
    draw(page, font, value, x, y, size);
  };

  const isSub = c.kind === '전대차';

  // ── 1. 부동산의 표시 ──
  put(c.address, 95, 715, 9);
  put(c.landCategory, 140, 689);
  put(c.landArea, 395, 689);
  put(c.buildingStructure, 140, 671);
  put(c.buildingArea, 395, 671);
  put(c.leasedPart, 140, 652);
  put(c.leasedArea, 395, 652);

  // ── 2. 계약내용 — 보증금과 지급시기 ──
  put(won(c.deposit), 120, 605);
  put(won(c.deposit), 275, 605); // ( ₩ ○○○ 원 ) 쪽에도 같은 금액
  put(won(c.downPayment), 120, 587);

  put(won(c.interimPayment), 120, 569);
  const [iy, im, id] = ymdParts(c.interimOn);
  put(iy, 282, 569);
  put(im, 330, 569);
  put(id, 370, 569);

  put(won(c.balance), 120, 551);
  const [by, bm, bd] = ymdParts(c.balanceOn);
  put(by, 282, 551);
  put(bm, 330, 551);
  put(bd, 370, 551);

  put(won(c.monthlyRent), 120, 533);
  put(c.payDay || '', 300, 533);

  // ── 제2조 존속기간 — 인도일과 만료일 ──
  const [hy, hm, hd] = ymdParts(c.handoverOn);
  put(hy, 383, 509, 8);
  put(hm, 419, 509, 8);
  put(hd, 442, 509, 8);
  const [ey, em, ed] = ymdParts(c.endOn);
  put(ey, 173, 497, 8);
  put(em, 216, 497, 8);
  put(ed, 242, 497, 8);

  // 제8조 중개보수 %
  put(c.brokerageRate, 246, 333, 8);

  // ── 특약사항 ── 줄바꿈을 살려 아래로 쌓는다
  c.special
    .split('\n')
    .filter(line => line.trim())
    .slice(0, 3)
    .forEach((line, i) => put(line, 72, 291 - i * 11, 8.5));

  // ── 작성일 ──
  const [wy, wm, wd] = ymdParts(c.writtenOn);
  put(wy, 262, 248);
  put(wm, 300, 248);
  put(wd, 337, 248);

  /*
    우리가 빌려준 자리면 우리가 임대인 칸에 들어간다. 자리를 바꿔 넣지 않으면
    빌려주고도 임차인 칸에 우리 이름이 찍힌 채로 나간다.
  */
  // 임대인(전대인) 칸 — y 218 주소 / 198 전화·성명 / 178 대리인
  put(c.lessorAddress, 130, 215);
  put(c.lessorPhone, 295, 195);
  put(c.lessorName, 415, 195);
  put(c.lessorAgent, 130, 175);
  put(c.lessorAgentPhone, 295, 175);

  // 임차인(전차인) 칸 — y 161 주소 / 141 전화·성명 / 121 대리인
  put(c.lesseeAddress, 130, 158);
  put(c.lesseePhone, 295, 138);
  put(c.lesseeName, 415, 138);
  put(c.lesseeAgent, 130, 118);
  put(c.lesseeAgentPhone, 295, 118);

  // ── 개업공인중개사 ── 중개 없이 쓰면 비워 둔다
  put(c.brokerOffice, 130, 101, 8.5);
  put(c.brokerAddress, 130, 83, 8.5);
  put(c.brokerName, 130, 65, 8.5);
  put(c.brokerRegNo, 130, 32, 8.5);
  put(c.brokerPhone, 300, 32, 8.5);

  /*
    전대차면 제목과 당사자 이름이 '임대차/임대인/임차인'으로 찍혀 있다. 원본 글자를
    지울 수는 없으니, 맨 아래에 무슨 계약인지 한 줄 적어 둔다 — 종이만 보고도 갈리게.
  */
  if (isSub) {
    draw(page, font, '※ 이 계약은 전대차입니다 (임대인 = 전대인, 임차인 = 전차인)', 29, 18, 8);
  }

  return pdf.save();
}

function draw(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number) {
  page.drawText(text, { x, y, size, font });
}

/** 파일로 받는다 — 브라우저가 알아서 내려받게 한다 */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // 바로 지우면 내려받기가 끊기는 브라우저가 있어 한 박자 뒤에 치운다
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 새 창에서 바로 본다 — 받기 전에 확인하는 쪽이 많다 */
export function openPdf(bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
