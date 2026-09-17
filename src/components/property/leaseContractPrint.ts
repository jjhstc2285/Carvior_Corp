import dayjs from 'dayjs';
import type { LeaseContract } from '../../types';

/**
 * 계약서 인쇄본.
 *
 * 화면 CSS와 섞지 않고 새 창에 이 HTML만 그려서 인쇄한다 — 화면에 맞춘 여백·색이
 * 종이에 그대로 따라가면 양식이 틀어진다.
 *
 * 종이에 적던 양식 그대로 둔다(조항 문구·칸 순서). 옮겨 적은 사람이 "전산 걸로 바꿨네"
 * 하고 다시 확인하게 만들지 않으려는 것이다.
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

/** "2026년 3월 5일" — 안 적혔으면 손으로 적게 빈칸 */
function ymd(date: string | null): string {
  if (!date) return '&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일';
  const d = dayjs(date);
  return `${d.year()}년 ${d.month() + 1}월 ${d.date()}일`;
}

/** 줄바꿈을 살려서 — 특약은 줄 단위로 적는다 */
function multiline(value: string): string {
  return esc(value).replace(/\n/g, '<br>');
}

export function leaseContractHtml(c: LeaseContract): string {
  const isSub = c.kind === '전대차';
  const lessorLabel = isSub ? '전대인' : '임대인';
  const lesseeLabel = isSub ? '전차인' : '임차인';
  const title = `부동산${esc(c.kind)}계약서`;
  const check = (on: boolean) => (on ? '☑' : '□');

  /** 당사자 한 칸 — 임대인·임차인이 같은 모양이다 */
  const party = (
    label: string,
    name: string,
    address: string,
    phone: string,
    agent: string,
    agentPhone: string,
    idLabel: string,
  ) => `
    <table class="grid party">
      <tr>
        <td class="side" rowspan="4">${label}</td>
        <td class="th">주소</td>
        <td colspan="3">${esc(address)}</td>
      </tr>
      <tr>
        <td class="th">${idLabel}</td>
        <td></td>
        <td class="th">전화</td>
        <td>${esc(phone)}</td>
      </tr>
      <tr>
        <td class="th">성명</td>
        <td>${esc(name)}</td>
        <td class="th">날인</td>
        <td class="seal">(인)</td>
      </tr>
      <tr>
        <td class="th">대리인</td>
        <td>${esc(agent)}</td>
        <td class="th">전화</td>
        <td>${esc(agentPhone)}</td>
      </tr>
    </table>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 11px; color: #000; line-height: 1.5; }
  h1 { margin: 0 0 2mm; text-align: center; font-size: 20px; letter-spacing: 2px; }
  .checks { margin-bottom: 4mm; text-align: center; font-size: 12px; }
  .checks span { margin: 0 6px; }
  .lead { margin: 0 0 3mm; }
  h2 { margin: 4mm 0 1.5mm; font-size: 12px; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid td { border: 1px solid #000; padding: 2px 4px; height: 20px; vertical-align: middle; }
  td.th { width: 70px; background: #f2f2f2; text-align: center; font-weight: 700; white-space: nowrap; }
  td.side { width: 24px; background: #f2f2f2; text-align: center; font-weight: 700; }
  td.num { text-align: right; }
  .clause { margin: 1.2mm 0; text-align: justify; }
  .clause b { font-weight: 700; }
  .special { min-height: 18mm; border: 1px solid #000; padding: 3px 5px; }
  .date { margin: 5mm 0 3mm; text-align: center; font-size: 12px; }
  .party { margin-bottom: 2mm; }
  .seal { text-align: right; color: #666; }
  .foot { margin-top: 3mm; font-size: 10px; color: #444; }
  @media print { .noprint { display: none; } }
  .noprint { margin: 4mm 0; text-align: center; }
  .noprint button { padding: 6px 18px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">인쇄하기</button></div>

  <h1>${title}</h1>
  <p class="checks">
    <span>${check(c.rentType === '전세')} 전 세</span>
    <span>${check(c.rentType === '월세')} 월 세</span>
  </p>
  <p class="lead">${lessorLabel}과 ${lesseeLabel} 쌍방은 아래 표시부동산에 관하여 다음 계약내용과 같이 ${esc(c.kind)}계약을 체결한다.</p>

  <h2>1. 부동산의 표시</h2>
  <table class="grid">
    <tr><td class="th">소재지</td><td colspan="5">${esc(c.address)}</td></tr>
    <tr>
      <td class="th">토지</td><td class="th">지목</td><td>${esc(c.landCategory)}</td>
      <td class="th">면적</td><td colspan="2">${esc(c.landArea)} ㎡</td>
    </tr>
    <tr>
      <td class="th">건물</td><td class="th">구조·용도</td><td>${esc(c.buildingStructure)}</td>
      <td class="th">면적</td><td colspan="2">${esc(c.buildingArea)} ㎡</td>
    </tr>
    <tr>
      <td class="th" colspan="2">임대할 부분</td><td>${esc(c.leasedPart)}</td>
      <td class="th">면적</td><td colspan="2">${esc(c.leasedArea)} ㎡</td>
    </tr>
  </table>

  <h2>2. 계약내용</h2>
  <p class="clause"><b>제1조 [보증금 및 지급시기]</b> 상기 부동산에 관하여 ${lessorLabel}과 ${lesseeLabel}은 ${esc(c.kind)} 보증금 및 차임과 지불시기를 아래와 같이 약정한다.</p>
  <table class="grid">
    <tr><td class="th">보증금</td><td colspan="3">一金 ${won(c.deposit)} 원整</td></tr>
    <tr><td class="th">계약금</td><td colspan="2">一金 ${won(c.downPayment)} 원整 은 계약시에 지불하고 영수함.</td><td style="width:90px">영수인 (인)</td></tr>
    <tr><td class="th">중도금</td><td colspan="3">一金 ${won(c.interimPayment)} 원整 은 ${ymd(c.interimOn)}에 지불한다.</td></tr>
    <tr><td class="th">잔금</td><td colspan="3">一金 ${won(c.balance)} 원整 은 ${ymd(c.balanceOn)}에 지불한다.</td></tr>
    <tr><td class="th">차임(월세)</td><td colspan="3">一金 ${won(c.monthlyRent)} 원整 은 매월 ${c.payDay ? `${c.payDay}일` : '(&nbsp;&nbsp;&nbsp;일)'}에 지불하기로 한다.</td></tr>
  </table>

  <p class="clause"><b>제2조 [존속기간]</b> ${lessorLabel}은 위 부동산을 ${esc(c.kind)} 목적대로 사용 수익할 수 있는 상태로 ${ymd(c.handoverOn)}까지 ${lesseeLabel}에게 인도하며, ${esc(c.kind)}기간은 인도일로부터 ${ymd(c.endOn)}까지로 한다.</p>
  <p class="clause"><b>제3조 [용도변경 및 전대 등]</b> ${lesseeLabel}은 ${lessorLabel}의 동의 없이는 위 부동산의 용도나 구조 등을 변경하거나 전대, 임차권 양도 또는 담보제공을 하지 못하며 ${esc(c.kind)} 목적 이외의 용도에 사용할 수 없다.</p>
  <p class="clause"><b>제4조 [계약의 해지]</b> ${lesseeLabel}이 2회 이상 차임의 지급을 연체하거나 제3조를 위반했을 때는 ${lessorLabel}은 본 계약을 해지할 수 있다.</p>
  <p class="clause"><b>제5조 [계약의 종료]</b> ${esc(c.kind)} 계약이 종료된 경우 ${lesseeLabel}은 위 부동산을 원상으로 회복하여 ${lessorLabel}에게 반환한다. 이러한 경우, ${lessorLabel}은 보증금을 ${lesseeLabel}에게 반환하고 연체임대료 또는 손해배상 금액이 있을 때는 이들을 제하고 그 잔액을 반환한다.</p>
  <p class="clause"><b>제6조 [계약의 해제]</b> ${lesseeLabel}이 ${lessorLabel}에게 중도금(중도금이 없을 때는 잔금)을 지불할 때까지, ${lessorLabel}은 계약금의 배액을 상환하고, ${lesseeLabel}은 계약금을 포기하고 이 계약을 해제할 수 있다.</p>
  <p class="clause"><b>제7조 [채무불이행과 손해배상]</b> ${lessorLabel} 또는 ${lesseeLabel}에게 본 계약상의 내용에 대하여 불이행이 있을 경우 그 상대방은 불이행을 한 자에 대하여 서면으로 이행을 최고하고 계약을 해제할 수 있다. 그리고 계약당사자는 계약해제에 따른 손해배상을 각각 상대방에 대하여 청구할 수 있다.</p>
  <p class="clause"><b>제8조 [중개보수]</b> 개업공인중개사는 ${lessorLabel}과 ${lesseeLabel}이 본 계약을 불이행함으로 인한 책임을 지지 않는다. 또한 중개보수는 본 계약체결과 동시에 계약당사자 쌍방이 각각 지불하며, 개업공인중개사의 고의나 과실 없이 거래 당사자 사정으로 본 계약이 무효, 취소, 해제되어도 중개보수는 지급한다. 공동중개일 경우에 ${lessorLabel}과 ${lesseeLabel}은 각각 자신이 중개 의뢰한 개업공인중개사에게 중개수수료를 지급한다.(중개보수는 거래가액의 ${esc(c.brokerageRate) || '&nbsp;&nbsp;&nbsp;&nbsp;'} %로 한다.)</p>
  <p class="clause"><b>제9조 [중개대상물확인ㆍ설명서 등 교부]</b> 개업공인중개사는 중개대상물 확인ㆍ설명서를 작성하고 업무보증관계증서 등의 사본을 첨부하여 계약체결과 동시에 거래당사자에게 교부한다.</p>

  <h2>특약사항</h2>
  <div class="special">${multiline(c.special)}</div>

  <p class="clause" style="margin-top:3mm">본 계약을 증명하기 위하여 계약당사자간에 이의 없음을 확인하고 각각 서명ㆍ날인 및 매장마다 간인하여야 하며 ${lessorLabel}, ${lesseeLabel}, 개업공인중개사가 각 1통씩 보관한다.</p>
  <p class="date">${ymd(c.writtenOn)}</p>

  ${party(lessorLabel, c.lessorName, c.lessorAddress, c.lessorPhone, c.lessorAgent, c.lessorAgentPhone, '주민등록번호')}
  ${party(lesseeLabel, c.lesseeName, c.lesseeAddress, c.lesseePhone, c.lesseeAgent, c.lesseeAgentPhone, '주민(법인)등록번호')}

  <table class="grid party">
    <tr>
      <td class="side" rowspan="3">개업<br>공인<br>중개사</td>
      <td class="th">사무소 명칭</td><td>${esc(c.brokerOffice)}</td>
      <td class="th">등록번호</td><td>${esc(c.brokerRegNo)}</td>
    </tr>
    <tr>
      <td class="th">소재지</td><td>${esc(c.brokerAddress)}</td>
      <td class="th">전화</td><td>${esc(c.brokerPhone)}</td>
    </tr>
    <tr>
      <td class="th">대표</td><td>${esc(c.brokerName)}</td>
      <td class="th">서명ㆍ날인</td><td class="seal">(인)</td>
    </tr>
  </table>

  <p class="foot">※ 주민등록번호와 도장은 인쇄 후 손으로 적고 찍습니다.</p>
</body>
</html>`;
}
