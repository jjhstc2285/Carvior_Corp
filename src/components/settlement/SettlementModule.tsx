import { useState } from 'react';
import { useStore } from '../../store';
import { canSeeAllSettlements } from '../../lib/permissions';
import BrokerageSettlementTab from './BrokerageSettlementTab';
import PurchaseSettlementTab from './PurchaseSettlementTab';
import DealerIncentiveTab from './DealerIncentiveTab';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

/*
  간편 정산 탭을 내렸다.

  매입 정산이 자리를 잡으면서 쓰는 사람이 없어졌다 — 탭이 남아 있으면 새로 들어온
  사람이 어느 쪽에 적어야 하는지 헷갈린다. 화면만 내렸고 적어둔 건과 서버는 그대로다.
  다시 쓸 일이 생기면 탭 한 줄만 되살리면 된다.
*/
type Tab = 'brokerage' | 'export' | 'purchase' | 'incentive';

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
  {
    key: 'incentive',
    label: '딜러 인센티브',
    desc: '기본급을 깔고, 월 알선 총액이 기본급을 넘은 만큼에 구간 요율을 곱해 냅니다. 대표·사무장·본부장만 봅니다.',
  },
];

export default function SettlementModule({ role }: Props) {
  const [tab, setTab] = useState<Tab>('brokerage');

  /*
    매입 정산은 계약팀과 관리자만 본다.

    남의 매입가·상품화 비용·순이익이 한 줄씩 늘어선 표다. 알선·수출은 자기 건을 적는
    자리라 다 열어두지만, 이쪽은 적는 사람이 계약팀이고 보는 뜻도 거기 있다.

    화면에서 탭만 감추는 건 막은 게 아니다 — 서버도 같은 기준으로 가린다.
  */
  const { state } = useStore();
  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  const seesPurchase = canSeeAllSettlements({ role }, me?.department, me?.name);

  const tabs = TABS.filter(t => t.key !== 'purchase' || seesPurchase);
  const current = tabs.find(t => t.key === tab) ?? tabs[0];

  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-5">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{role === 'EMPLOYEE' ? '내 정산 현황' : '정산 관리'}</h1>
        <p className="mt-1 text-sm text-slate-500">{current.desc}</p>
      </div>

      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {tabs.map(t => (
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
      {tab === 'purchase' && seesPurchase && <PurchaseSettlementTab role={role} />}
      {tab === 'incentive' && <DealerIncentiveTab />}
    </div>
  );
}
