import { useState } from 'react';
import BasicSettlementTab from './BasicSettlementTab';
import BrokerageSettlementTab from './BrokerageSettlementTab';
import PurchaseSettlementTab from './PurchaseSettlementTab';

interface Props {
  role: 'employee' | 'admin';
}

type Tab = 'brokerage' | 'purchase' | 'basic';

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'brokerage', label: '알선 정산', desc: '총 진행 판매금액·실차주입금을 넣으면 수익금과 판매 수익이 자동 계산됩니다.' },
  { key: 'purchase', label: '매입 정산', desc: '상품화 항목을 넣으면 상품화총비용과 매입+상품화총비용이 자동 계산됩니다.' },
  { key: 'basic', label: '간편 정산', desc: '매입가·상품화비용·판매금액·수수료만 넣는 기존 간단 양식입니다.' },
];

export default function SettlementModule({ role }: Props) {
  const [tab, setTab] = useState<Tab>('brokerage');
  const current = TABS.find(t => t.key === tab)!;

  return (
    <div className="mx-auto max-w-368 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{role === 'employee' ? '내 정산 현황' : '정산 관리'}</h1>
        <p className="mt-1 text-sm text-slate-500">{current.desc}</p>
      </div>

      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'brokerage' && <BrokerageSettlementTab role={role} />}
      {tab === 'purchase' && <PurchaseSettlementTab role={role} />}
      {tab === 'basic' && <BasicSettlementTab role={role} />}
    </div>
  );
}
