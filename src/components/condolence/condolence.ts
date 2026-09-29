/** 경조사 구분 — 화면과 폼이 같은 목록을 쓴다 */
export type CondolenceKind = 'FUNERAL' | 'WEDDING' | 'HOLIDAY' | 'ETC';

export const KINDS: CondolenceKind[] = ['FUNERAL', 'WEDDING', 'HOLIDAY', 'ETC'];

export const KIND_LABEL: Record<CondolenceKind, string> = {
  FUNERAL: '장례',
  WEDDING: '결혼',
  HOLIDAY: '명절',
  ETC: '기타',
};

export const KIND_STYLE: Record<CondolenceKind, string> = {
  FUNERAL: 'bg-slate-100 text-slate-700',
  WEDDING: 'bg-rose-50 text-rose-700',
  HOLIDAY: 'bg-amber-50 text-amber-700',
  ETC: 'bg-sky-50 text-sky-700',
};

/**
 * 당사자와의 관계 — 부고·청첩장에 적힌 그대로 고른다.
 *
 * 자유 입력도 되게 두지만 고를 수 있으면 표기가 갈리지 않는다("모친" / "어머님" /
 * "어머니"가 섞이면 나중에 세지 못한다).
 */
export const SUBJECTS = ['본인', '부친', '모친', '배우자', '자녀', '형제', '자매', '장인', '장모'] as const;

/** 늘 얹는 화환값 — 다를 수 있어 고칠 수 있게 둔다 */
export const DEFAULT_WREATH = 45_000;

export interface Condolence {
  id: string;
  kind: CondolenceKind;
  person: string;
  relation: string;
  subject: string;
  eventOn: string;
  amount: number;
  wreath: boolean;
  wreathPrice: number;
  place: string;
  memo: string;
  recordedBy: string;
}
