import { useAuth } from '../../authStore';
import { isOfficeManager } from '../../lib/permissions';
import { useVehicles } from './useVehicles';
import StockFinanceTab from './StockFinanceTab';

/**
 * 재고금융(제시) — 사이드바 한 칸을 차지하는 화면.
 *
 * 차량 관리 안의 탭이었는데, 사무장이 매일 들여다보는 화면이라 들어갈 때마다
 * 차량 관리를 거치는 게 번거로웠다.
 *
 * 다루는 값은 차량 관리와 같은 ManagedVehicle 이라 같은 훅을 쓴다 —
 * 한쪽에서 고친 값이 다른 쪽에도 그대로 보인다.
 */
export default function StockFinanceModule() {
  const api = useVehicles();
  const { user } = useAuth();
  // 제시·재고는 사무장이 챙기는 일이다. 직원에게는 상환 예정만 보인다.
  const officeManager = isOfficeManager(user);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">재고금융 (제시)</h1>
        <p className="mt-1 text-sm text-slate-500">
          {officeManager
            ? '제시 가능한 차인지 먼저 가리고(10년 이내 · 20만km 미만), 제시일자와 이전일자를 적습니다. 재고가 잡히면 할부사 · 재고금액 · 상환일자를 넣습니다.'
            : '그 달에 상환해야 하는 차량을 월별로 모아 봅니다.'}
        </p>
      </div>

      {api.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{api.error}</p>}
      {api.loading && <p className="mb-3 text-xs text-slate-400">불러오는 중…</p>}

      <StockFinanceTab api={api} isOfficeManager={officeManager} />
    </div>
  );
}
