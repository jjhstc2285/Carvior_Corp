import { REFERRAL_TITLE_CLASS, REFERRAL_TITLE_LABEL, type ReferralTitle } from '../types';

/**
 * 알선팀 타이틀 배지 — 이름 왼쪽에 붙는다.
 *
 * 직책과 다르다. 직책은 회사 안에서의 자리고, 이건 알선팀 안에서의 등급이라 실적으로
 * 오르내린다. 누가 팀장인지 목록에서 바로 보이게 이름 앞에 둔다.
 *
 * 타이틀이 없으면 아무것도 그리지 않는다 — 알선팀이 아닌 사람 이름 앞에 빈 자리를
 * 만들면 줄이 어긋나 보인다.
 */
export default function ReferralTitleBadge({
  title,
  size = 'sm',
}: {
  title?: string | null;
  /** 좁은 줄에서는 sm, 카드처럼 여유 있는 자리에서는 md */
  size?: 'sm' | 'md';
}) {
  const key = (title ?? '').trim() as ReferralTitle;
  if (!REFERRAL_TITLE_LABEL[key]) return null;

  return (
    <span
      className={`shrink-0 rounded font-bold ${REFERRAL_TITLE_CLASS[key]} ${
        size === 'sm' ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-[11px]'
      }`}
    >
      {REFERRAL_TITLE_LABEL[key]}
    </span>
  );
}
