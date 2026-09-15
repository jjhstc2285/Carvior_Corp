import { Avatar } from 'antd';

/**
 * 직원 얼굴 자리.
 *
 * 사진은 안 받는다 — 올려 달라고 하면 절반은 안 올리고, 그러면 있는 사람만 얼굴이
 * 있는 어정쩡한 목록이 된다. 이름 끝 두 글자와 색으로 대신한다.
 *
 * 색은 이름에서 낸다. 같은 사람은 어느 화면에서나 같은 색이라, 이름을 읽기 전에
 * 색만 보고도 누구인지 짐작이 간다. 무작위로 고르면 새로 그릴 때마다 색이 바뀐다.
 */

/** 서로 헷갈리지 않는 만큼만 고른 색. 글자는 흰색이라 너무 밝은 색은 안 쓴다. */
const COLORS = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#0284c7',
  '#65a30d',
  '#c2410c',
];

export function avatarColor(name: string): string {
  let sum = 0;
  for (const ch of name) sum = (sum + ch.charCodeAt(0)) % 9973;
  return COLORS[sum % COLORS.length];
}

/**
 * 성을 뺀 이름. "유진욱" → "진욱", "안원용" → "원용".
 *
 * 우리 회사에 김씨가 넷이라 성만 쓰면 다 같아 보인다. 두 글자 이름은 그대로 둔다.
 */
export function avatarLabel(name: string): string {
  const clean = name.trim();
  return clean.length > 2 ? clean.slice(1) : clean;
}

export default function EmployeeAvatar({
  name,
  size = 28,
  title,
}: {
  name: string;
  size?: number;
  /** 마우스를 올렸을 때 — 안 주면 이름을 띄운다 */
  title?: string;
}) {
  const label = avatarLabel(name);
  return (
    // antd Avatar 는 title 을 안 받아서 감싼 자리에 붙인다
    <span title={title ?? name} className="inline-flex shrink-0">
      <Avatar
        size={size}
        style={{
          backgroundColor: avatarColor(name),
          // 두 글자를 칸 안에 넣으려면 기본 글자 크기로는 넘친다
          fontSize: size <= 24 ? 10 : size <= 32 ? 11 : 13,
          fontWeight: 700,
        }}
      >
        {label}
      </Avatar>
    </span>
  );
}
