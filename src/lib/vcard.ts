/**
 * 연락처를 휴대폰에 넣을 수 있는 파일(.vcf)로 만든다.
 *
 * 번호는 다 시스템에 있는데 정작 전화를 걸 때는 휴대폰이다. 지금은 화면에서 번호를
 * 보고 손으로 눌러 건다 — 한 자리 틀리면 엉뚱한 데로 가고, 저장된 이름이 없으니 다시
 * 걸려 와도 누군지 모른다.
 *
 * vCard 는 아이폰·안드로이드가 둘 다 읽는다. 파일을 열면 '모두 추가'가 뜬다.
 *
 * 이름 앞에 표를 붙인다. 휴대폰 연락처에 섞여 들어가는 거라, 나중에 지우거나 찾을 때
 * 표가 없으면 내 연락처와 구별이 안 된다.
 */

export interface Contact {
  /** 저장될 이름 — 여기에 표를 붙인다 */
  name: string;
  phone: string;
  /** 소속·업체 — 연락처의 '회사' 칸에 들어간다 */
  org?: string;
  /** 무슨 사이인지 — 연락처 메모로 남는다 */
  note?: string;
}

/** 숫자만 남긴다. 저장은 하이픈 없이 해도 휴대폰이 알아서 보기 좋게 그린다 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/[^\d]/g, '');
  if (digits.startsWith('82')) return `0${digits.slice(2)}`;
  return digits;
}

/** 전화번호로 쓸 수 있는 값인가 — 사업자번호나 계좌번호가 섞여 들어온다 */
export function isPhone(raw: string): boolean {
  const d = normalizePhone(raw);
  return /^0\d{8,10}$/.test(d);
}

/**
 * vCard 한 줄에 못 들어가는 글자를 피한다.
 *
 * 쉼표·세미콜론은 칸을 나누는 글자라 그대로 두면 이름이 잘린다.
 */
function esc(v: string): string {
  return (v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function toVCard(contacts: Contact[]): string {
  return contacts
    .filter(c => isPhone(c.phone) && c.name.trim())
    .map(c =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        // FN 은 보이는 이름, N 은 성/이름으로 나눈 것 — 둘 다 없으면 안 읽는 기기가 있다
        `FN:${esc(c.name)}`,
        `N:;${esc(c.name)};;;`,
        c.org ? `ORG:${esc(c.org)}` : '',
        `TEL;TYPE=CELL:${normalizePhone(c.phone)}`,
        c.note ? `NOTE:${esc(c.note)}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n'),
    )
    // vCard 는 줄바꿈이 CRLF 다. LF 만 쓰면 못 읽는 기기가 있다
    .join('\r\n');
}

/**
 * 파일로 내려준다.
 *
 * 휴대폰에서는 이 파일을 카톡·메일로 보내 열면 연락처에 들어간다. PC에서 받아
 * 옮기는 일이 더 많아서 그냥 내려받기로 둔다.
 */
export function downloadVCard(contacts: Contact[], fileName: string): number {
  const text = toVCard(contacts);
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.vcf') ? fileName : `${fileName}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
  return contacts.filter(c => isPhone(c.phone) && c.name.trim()).length;
}

/**
 * 같은 번호가 여러 군데서 온다.
 *
 * 거래처 대장에도 있고 키 불출 이력에도 있는 사람이 있다. 그대로 두면 휴대폰에 같은
 * 사람이 두 번 저장된다 — 번호를 기준으로 하나만 남기고, 이름이 더 자세한 쪽을 쓴다.
 */
export function dedupe(contacts: Contact[]): Contact[] {
  const byPhone = new Map<string, Contact>();
  for (const c of contacts) {
    if (!isPhone(c.phone) || !c.name.trim()) continue;
    const key = normalizePhone(c.phone);
    const kept = byPhone.get(key);
    if (!kept || c.name.length > kept.name.length) byPhone.set(key, c);
  }
  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
