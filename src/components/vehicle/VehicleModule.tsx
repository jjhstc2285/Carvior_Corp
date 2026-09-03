import { useState } from 'react';
import { useVehicles } from './useVehicles';
import MovementTab from './MovementTab';
import ExpenseTab from './ExpenseTab';
import ParkingPolicyTab from './ParkingPolicyTab';
import StockFinanceTab from './StockFinanceTab';

type TabKey = 'movement' | 'stock' | 'policy' | 'expense';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'movement', label: '외부 이동 차량' },
  { key: 'stock', label: '재고금융 (제시)' },
  { key: 'policy', label: '주차 배치 기준' },
  { key: 'expense', label: '주유 · 배터리 비용' },
];

export default function VehicleModule() {
  const [tab, setTab] = useState<TabKey>('movement');
  const api = useVehicles();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">차량 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tab === 'movement' && '상품화·광고 상태에 따라 외부로 뺄 수 있는 차량이 자동으로 분류됩니다.'}
          {tab === 'stock' &&
            '제시 가능한 차인지 먼저 가리고(10년 이내·20만km 미만), 제시일자·이전일자를 적습니다. 재고가 잡히면 할부사·재고금액·상환일자를 넣고, 상환 예정은 월별로 모아 봅니다.'}
          {tab === 'policy' &&
            '값·차종·연료·판매유형으로 어느 주차장에 세울지가 정해집니다. 매입할 때 들어온 값이 채워져 있고, 고치면 추천이 바로 바뀝니다.'}
          {tab === 'expense' &&
            '차량번호 뒤 4자리만 넣으면 차량명이 채워집니다. 등록한 이력은 나중에 고치거나 지울 수 있어요.'}
        </p>
      </div>

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {api.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{api.error}</p>}
      {api.loading && <p className="mb-3 text-xs text-slate-400">불러오는 중…</p>}

      {tab === 'movement' && <MovementTab api={api} />}
      {tab === 'stock' && <StockFinanceTab api={api} />}
      {tab === 'policy' && <ParkingPolicyTab api={api} />}
      {tab === 'expense' && <ExpenseTab api={api} />}
    </div>
  );
}
