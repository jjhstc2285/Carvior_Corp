import dayjs from 'dayjs';
import type { LeaseContract } from '../../types';

/**
 * 계약서 인쇄본.
 *
 * 화면 CSS와 섞지 않고 새 창에 이 HTML만 그려서 인쇄한다 — 화면에 맞춘 여백·색이
 * 종이에 그대로 따라가면 양식이 틀어진다.
 *
 * 종이에 쓰던 양식(공인중개사협회 서식)을 그대로 옮겼다 — 칸 순서·조항 문구·글자 크기까지.
 * 옮겨 적은 사람이 "전산 걸로 바꿨네" 하고 다시 확인하게 만들지 않으려는 것이다.
 * 한 장(A4)에 들어가게 맞췄다. 두 장으로 넘어가면 간인을 더 찍어야 한다.
 *
 * 주민등록번호·법인등록번호·도장은 빈칸으로 찍어 손으로 채우게 한다.
 */

/** 남이 적은 글이 그대로 화면 태그가 되지 않게 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const won = (n: number) => (n > 0 ? n.toLocaleString() : '');

/** 빈칸 — 손으로 적을 자리 */
const BLANK = '&nbsp;'.repeat(10);

/** "2026년 3월 5일" — 안 적혔으면 손으로 적게 빈칸 */
function ymd(date: string | null): string {
  if (!date) return '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일';
  const d = dayjs(date);
  return `${d.year()}년 ${d.month() + 1}월 ${d.date()}일`;
}

/** 줄바꿈을 살려서 — 특약은 줄 단위로 적는다 */
function multiline(value: string): string {
  return esc(value).replace(/\n/g, '<br>');
}

export function leaseContractHtml(c: LeaseContract): string {
  const isSub = c.kind === '전대차';
  const lessor = isSub ? '전대인' : '임대인';
  const lessee = isSub ? '전차인' : '임차인';
  const title = `부동산${esc(c.kind)}계약서`;
  const check = (on: boolean) => (on ? '☑' : '□');

  /**
   * 당사자 칸 — 임대인·임차인이 같은 모양이다.
   * 왼쪽 세로 글자(임/대/인)까지 협회 서식 그대로 둔다.
   */
  const party = (label: string, idLabel: string, p: {
    name: string;
    address: string;
    phone: string;
    agent: string;
    agentPhone: string;
  }) => `
    <table class="grid sign">
      <colgroup>
        <col style="width:26px"><col style="width:78px"><col><col style="width:46px"><col style="width:108px">
        <col style="width:46px"><col style="width:110px"><col style="width:58px">
      </colgroup>
      <tr>
        <td class="side" rowspan="3">${label.split('').join('<br>')}</td>
        <td class="th">주 소</td>
        <td colspan="6">${esc(p.address)}</td>
      </tr>
      <tr>
        <td class="th">${idLabel}</td><td></td>
        <td class="th">전 화</td><td>${esc(p.phone)}</td>
        <td class="th">성 명</td><td>${esc(p.name)}</td>
        <td class="seal" rowspan="2">(인)</td>
      </tr>
      <tr>
        <td class="th">대 리 인</td><td></td>
        <td class="th">전 화</td><td>${esc(p.agentPhone)}</td>
        <td class="th">성 명</td><td>${esc(p.agent)}</td>
      </tr>
    </table>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 10mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 10px; color: #000; line-height: 1.45; }

  .head { display: flex; align-items: flex-start; justify-content: space-between; }
  .head h1 { flex: 1; margin: 0 0 1mm; text-align: center; font-size: 21px; letter-spacing: 3px; color: #1b3a8a; }
  .head .checks { width: 70px; padding-top: 2mm; font-size: 11px; font-weight: 700; line-height: 1.7; text-align: left; }

  .lead { margin: 0 0 2mm; }
  h2 { margin: 2.5mm 0 1mm; font-size: 11px; }

  table.grid { width: 100%; border-collapse: collapse; }
  table.grid td { border: 1px solid #000; padding: 1.5px 4px; height: 19px; vertical-align: middle; }
  td.th { background: #eef1f6; text-align: center; font-weight: 700; white-space: nowrap; }
  td.side { background: #eef1f6; text-align: center; font-weight: 700; line-height: 1.25; }
  td.sqm { text-align: center; }
  td.seal { text-align: center; color: #555; }

  .clause { margin: 0.9mm 0; text-align: justify; }
  .clause b { font-weight: 700; }

  .special { margin-top: 1mm; border: 1px solid #000; min-height: 14mm; padding: 2px 5px; }
  .date { margin: 3mm 0 2mm; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
  .sign { margin-bottom: 1.5mm; }
  .foot { margin-top: 2mm; font-size: 9px; color: #444; }

  @media print { .noprint { display: none; } }
  .noprint { margin: 3mm 0; text-align: center; }
  .noprint button { padding: 6px 18px; font-size: 13px; cursor: pointer; }
  .noprint .hint { margin: 2mm 0 0; font-size: 11px; color: #555; }
</style>
</head>
<body>
  <div class="noprint">
    <button onclick="window.print()">인쇄 / PDF로 저장</button>
    <p class="hint">파일로 남기려면 인쇄 창에서 <b>대상(프린터)</b>을 <b>"PDF로 저장"</b>으로 고르세요.</p>
  </div>

  <div class="head">
    <div style="width:70px"></div>
    <h1>${title}</h1>
    <div class="checks">
      ${check(c.rentType === '전세')} 전 세<br>
      ${check(c.rentType === '월세')} 월 세
    </div>
  </div>

  <p class="lead">${lessor}과 ${lessee} 쌍방은 아래 표시부동산에 관하여 다음 계약내용과 같이 ${esc(c.kind)}계약을 체결한다.</p>

  <h2>1. 부동산의 표시</h2>
  <table class="grid">
    <colgroup><col style="width:66px"><col style="width:70px"><col><col style="width:52px"><col style="width:150px"></colgroup>
    <tr><td class="th" colspan="2">소 재 지</td><td colspan="3">${esc(c.address)}</td></tr>
    <tr>
      <td class="th">토 지</td><td class="th">지 목</td><td>${esc(c.landCategory)}</td>
      <td class="th">면 적</td><td class="sqm">${esc(c.landArea)} ㎡</td>
    </tr>
    <tr>
      <td class="th">건 물</td><td class="th">구조·용도</td><td>${esc(c.buildingStructure)}</td>
      <td class="th">면 적</td><td class="sqm">${esc(c.buildingArea)} ㎡</td>
    </tr>
    <tr>
      <td class="th" colspan="2">임대할 부분</td><td>${esc(c.leasedPart)}</td>
      <td class="th">면 적</td><td class="sqm">${esc(c.leasedArea)} ㎡</td>
    </tr>
  </table>

  <h2>2. 계약내용</h2>
  <p class="clause"><b>제1조 [보증금 및 지급시기]</b> 상기 부동산에 관하여 ${lessor}과 ${lessee}은 ${esc(c.kind)} 보증금 및 차임과 지불시기를 아래와 같이 약정한다.</p>
  <table class="grid">
    <colgroup><col style="width:66px"><col><col style="width:86px"></colgroup>
    <tr>
      <td class="th">보 증 금</td>
      <td colspan="2">一金 ${won(c.deposit) || BLANK} 원整 ( ₩ ${won(c.deposit) || BLANK} 원)</td>
    </tr>
    <tr>
      <td class="th">계 약 금</td>
      <td>一金 ${won(c.downPayment) || BLANK} 원整 은 계약시에 지불하고 영수함.</td>
      <td class="th">영수인 (인)</td>
    </tr>
    <tr>
      <td class="th">중 도 금</td>
      <td colspan="2">一金 ${won(c.interimPayment) || BLANK} 원整 은 ${ymd(c.interimOn)}에 지불한다.</td>
    </tr>
    <tr>
      <td class="th">잔      금</td>
      <td colspan="2">一金 ${won(c.balance) || BLANK} 원整 은 ${ymd(c.balanceOn)}에 지불한다.</td>
    </tr>
    <tr>
      <td class="th">차임(월세)</td>
      <td colspan="2">一金 ${won(c.monthlyRent) || BLANK} 원整 은 매월 ( ${c.payDay ? `${c.payDay}` : '&nbsp;&nbsp;&nbsp;'} 일 )에 지불하기로 한다.</td>
    </tr>
  </table>

  <p class="clause"><b>제2조 [존속기간]</b> ${lessor}은 위 부동산을 ${esc(c.kind)} 목적대로 사용 수익할 수 있는 상태로 ${ymd(c.handoverOn)}까지 ${lessee}에게 인도하며, ${esc(c.kind)}기간은 인도일로부터 ${ymd(c.endOn)}까지로 한다.</p>
  <p class="clause"><b>제3조 [용도변경 및 전대 등]</b> ${lessee}은 ${lessor}의 동의 없이는 위 부동산의 용도나 구조 등을 변경하거나 전대, 임차권 양도 또는 담보제공을 하지 못하며 ${esc(c.kind)} 목적 이외의 용도에 사용할 수 없다.</p>
  <p class="clause"><b>제4조 [계약의 해지]</b> ${lessee}이 2회 이상 차임의 지급을 연체하거나 제3조를 위반했을 때는 ${lessor}은 본 계약을 해지할 수 있다.</p>
  <p class="clause"><b>제5조 [계약의 종료]</b> ${esc(c.kind)} 계약이 종료된 경우 ${lessee}은 위 부동산을 원상으로 회복하여 ${lessor}에게 반환한다. 이러한 경우, ${lessor}은 보증금을 ${lessee}에게 반환하고 연체임대료 또는 손해배상 금액이 있을 때는 이들을 제하고 그 잔액을 반환한다.</p>
  <p class="clause"><b>제6조 [계약의 해제]</b> ${lessee}이 ${lessor}에게 중도금(중도금이 없을 때는 잔금)을 지불할 때까지, ${lessor}은 계약금의 배액을 상환하고, ${lessee}은 계약금을 포기하고 이 계약을 해제할 수 있다.</p>
  <p class="clause"><b>제7조 [채무불이행과 손해배상]</b> ${lessor} 또는 ${lessee}에게 본 계약상의 내용에 대하여 불이행이 있을 경우 그 상대방은 불이행을 한 자에 대하여 서면으로 이행을 최고하고 계약을 해제할 수 있다. 그리고 계약당사자는 계약해제에 따른 손해배상을 각각 상대방에 대하여 청구할 수 있다.</p>
  <p class="clause"><b>제8조 [중개보수]</b> 개업공인중개사는 ${lessor}과 ${lessee}이 본 계약을 불이행함으로 인한 책임을 지지 않는다. 또한 중개보수는 본 계약체결과 동시에 계약당사자 쌍방이 각각 지불하며, 개업공인중개사의 고의나 과실 없이 거래 당사자 사정으로 본 계약이 무효, 취소, 해제되어도 중개보수는 지급한다. 공동중개일 경우에 ${lessor}과 ${lessee}은 각각 자신이 중개 의뢰한 개업공인중개사에게 중개수수료를 지급한다.(중개보수는 거래가액의 ${esc(c.brokerageRate) || '&nbsp;&nbsp;&nbsp;&nbsp;'} %로 한다.)</p>
  <p class="clause"><b>제9조 [중개대상물확인ㆍ설명서 등 교부]</b> 개업공인중개사는 중개대상물 확인ㆍ설명서를 작성하고 업무보증관계증서 등의 사본을 첨부하여 계약체결과 동시에 거래당사자에게 교부한다.</p>

  <p class="clause" style="margin-top:2mm"><b>특약사항 :</b></p>
  <div class="special">${multiline(c.special)}</div>

  <p class="clause" style="margin-top:2mm">본 계약을 증명하기 위하여 계약당사자간에 이의 없음을 확인하고 각각 서명ㆍ날인 및 매장마다 간인하여야 하며 ${lessor}, ${lessee}, 개업공인중개사가 각 1통씩 보관한다.</p>
  <p class="date">${ymd(c.writtenOn)}</p>

  ${party(lessor, '주민등록번호', {
    name: c.lessorName,
    address: c.lessorAddress,
    phone: c.lessorPhone,
    agent: c.lessorAgent,
    agentPhone: c.lessorAgentPhone,
  })}
  ${party(lessee, '주민(법인)등록번호', {
    name: c.lesseeName,
    address: c.lesseeAddress,
    phone: c.lesseePhone,
    agent: c.lesseeAgent,
    agentPhone: c.lesseeAgentPhone,
  })}

  <table class="grid sign">
    <colgroup><col style="width:26px"><col style="width:96px"><col><col style="width:46px"><col style="width:150px"></colgroup>
    <tr>
      <td class="side" rowspan="4">개<br>업<br>공<br>인<br>중<br>개<br>사</td>
      <td class="th">사무소 명칭</td><td>${esc(c.brokerOffice)}</td>
      <td class="th">등록번호</td><td>${esc(c.brokerRegNo)}</td>
    </tr>
    <tr>
      <td class="th">사무소 소재지</td><td>${esc(c.brokerAddress)}</td>
      <td class="th">전 화</td><td>${esc(c.brokerPhone)}</td>
    </tr>
    <tr>
      <td class="th">대 표</td><td>${esc(c.brokerName)}</td>
      <td class="th" colspan="2">자필 서명ㆍ날인 (인)</td>
    </tr>
    <tr>
      <td class="th">소속공인중개사</td><td></td>
      <td class="th" colspan="2">자필 서명ㆍ날인 (인)</td>
    </tr>
  </table>

  <p class="foot">※ 주민등록번호와 도장은 인쇄 후 손으로 적고 찍습니다. 중개 없이 쓰는 계약이면 개업공인중개사 칸은 비워 둡니다.</p>
</body>
</html>`;
}
