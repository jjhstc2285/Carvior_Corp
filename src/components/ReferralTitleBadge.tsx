import { REFERRAL_TITLE_EMOJI, REFERRAL_TITLE_LABEL, type ReferralTitle } from '../types';

/**
 * 알선팀 타이틀 — 이름 왼쪽, 아바타보다 앞에 붙는다.
 *
 * 글자가 아니라 그림이다. 이름 앞에 '주니어' 같은 글자를 달면 글자가 두 겹이 되어 정작
 * 이름이 안 읽힌다. 한 자리만 쓰고 멀리서도 갈리는 그림으로 둔다.
 *
 * 무엇을 뜻하는지는 손을 올리면 글자로 나온다 — 그림만으로는 처음 보는 사람이 모른다.
 *
 * 타이틀이 없으면 아무것도 그리지 않는다. 알선팀이 아닌 사람 이름 앞에 빈 자리를 만들면
 * 줄이 어긋나 보인다.
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
  const emoji = REFERRAL_TITLE_EMOJI[key];
  if (!emoji) return null;

  return (
    <span
      className={`shrink-0 leading-none ${size === 'sm' ? 'text-[13px]' : 'text-base'}`}
      title={`알선팀 ${REFERRAL_TITLE_LABEL[key]}`}
      aria-label={REFERRAL_TITLE_LABEL[key]}
    >
      {emoji}
    </span>
  );
}
