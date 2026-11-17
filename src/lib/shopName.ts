import { useAuth } from '../authStore';

/**
 * 로그인한 사람이 속한 상사 이름.
 *
 * 이 제품은 애니원모터스 한 곳을 위해 만들어졌다가 카비어가 여러 상사에게 주는 제품이 됐다.
 * 그래서 화면과 서류에 회사 이름을 박아 두면 안 된다 — 들어온 상사 이름으로 불려야 한다.
 *
 * 이름은 로그인할 때 서버가 같이 내려준다(tenant.name). 이 기능 전에 로그인해 둔 옛 세션에는
 * 없으므로 그때는 fallback 을 쓴다.
 */
export function useShopName(fallback = '우리 상사'): string {
  const { user } = useAuth();
  return user?.tenant?.name?.trim() || fallback;
}
