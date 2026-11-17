/**
 * 상사(테넌트)마다 켜고 끄는 모듈.
 *
 * 프론트 `src/modules.ts`의 ModuleKey와 **같은 값**이어야 한다. 한쪽에만 키를 더하면
 * 메뉴는 뜨는데 권한이 없거나(또는 그 반대) 하는 식으로 조용히 어긋난다.
 */

/** 1번 상사가 쓰는 전부 */
export const ALL_MODULES = [
  'home',
  'notice',
  'attendance',
  'workLog',
  'approval',
  'consultation',
  'settlement',
  'parking',
  'vehicle',
  'ad',
  'purchaseIntake',
  'stockFinance',
  'dealerFee',
  'vendor',
  'property',
  'payroll',
  'cleaning',
  'condolence',
  'adminSheet',
  'telegramSale',
  'monitoring',
  'chat',
] as const;

/**
 * 신규 상사에게 주는 v1 — 사람·일정·소통만.
 *
 * 정산·매입·급여는 **일부러 뺐다.** 양식이 상사마다 달라서(1번 상사 정산식은
 * brokerageProfit 등 네 함수에 박혀 있다) 두 번째 상사부터 "우리 시트지는 다른데요"가
 * 반드시 나온다. 무료로 주는 제품에 그 요구가 붙으면 수익 없이 개발만 하게 되고,
 * 돈 계산이 한 번 틀리면 상사는 프로그램을 통째로 버린다.
 *
 * 주차장·세차·판금 인보이스·광고비 등은 1번 상사 단지와 거래처에 맞춰 만든 것이라
 * 다른 상사에서는 그대로 쓸 수 없다.
 */
export const V1_MODULES = [
  'home',
  'notice',
  'attendance',
  'workLog',
  'approval',
  'consultation',
  'chat',
  'vehicle',
] as const;

export const V1_MODULES_CSV = V1_MODULES.join(',');

/** DB에 쉼표로 저장된 값을 배열로. 모르는 키는 버린다(프론트에 없는 메뉴를 켜봐야 빈 화면이다) */
export function parseModules(csv: string | null | undefined): string[] {
  const known = new Set<string>(ALL_MODULES);
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => known.has(s));
}
