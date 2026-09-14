import { useState } from 'react';
import BasicSettlementTab from './BasicSettlementTab';
import BrokerageSettlementTab from './BrokerageSettlementTab';
import PurchaseSettlementTab from './PurchaseSettlementTab';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

type Tab = 'brokerage' | 'export' | 'purchase' | 'basic';

/**
 * 알선과 수출은 표를 따로 둔다.
 *
 * 적는 칸도 계산도 같지만 섞어두면 어느 쪽 실적인지 합계에서 갈리지 않는다.
 * 상담 관리가 알선·수출을 나눠 보는 것과 같은 구분이다.
 */
const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'brokerage', label: '알선 정산', desc: '총 진행 판매금액·실차주입금을 넣으면 수익금과 판매 수익이 자동 계산됩니다.' },
  { key: 'export', label: '수출 정산', desc: '수출 건만 모아 봅니다. 적는 칸과 계산은 알선 정산과 같습니다.' },
  { key: 'purchase', label: '매입 정산', desc: '상품화 항목을 넣으면 상품화총비용과 매입+상품화총비용이 자동 계산됩니다.' },
  { key: 'basic', label: '간편 정산', desc: '매입가·상품화비용·판매금액·수수료만 넣는 기존 간단 양식입니다.' },
];

export default function SettlementModule({ role }: Props) {
  const [tab, setTab] = useState<Tab>('brokerage');
  const current = TABS.find(t => t.key === tab)!;

  return (
    <div className="mx-auto max-w-368 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{role === 'EMPLOYEE' ? '내 정산 현황' : '정산 관리'}</h1>
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

      {tab === 'brokerage' && <BrokerageSettlementTab role={role} kind="BROKERAGE" />}
      {tab === 'export' && <BrokerageSettlementTab role={role} kind="EXPORT" />}
      {tab === 'purchase' && <PurchaseSettlementTab role={role} />}
      {tab === 'basic' && <BasicSettlementTab role={role} />}
    </div>
  );
}
