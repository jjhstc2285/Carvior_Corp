import { useState } from 'react';
import ConsultationModule from './ConsultationModule';
import ExportConsultationModule from '../exportConsultation/ExportConsultationModule';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

type Tab = 'brokerage' | 'export';

/**
 * 상담 관리 — 알선과 수출을 한 메뉴에서 본다.
 *
 * 둘 다 "손님 상담"이라 메뉴를 나눠 두면 오갈 때마다 사이드바를 거쳐야 했다.
 * 출처는 다르다 — 알선은 우리가 직접 적고, 수출은 카비오에서 읽어온다.
 * (정산 관리가 쓰는 탭 구조와 같다)
 */
const TABS: { key: Tab; label: string }[] = [
  { key: 'brokerage', label: '알선 상담' },
  { key: 'export', label: '수출 상담' },
];

export default function ConsultationHub({ role }: Props) {
  const [tab, setTab] = useState<Tab>('brokerage');

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">상담 관리</h1>
      </div>

      <div className="mb-5 flex w-fit rounded-lg bg-slate-100 p-0.5 text-sm">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'brokerage' && <ConsultationModule role={role} />}
      {tab === 'export' && <ExportConsultationModule />}
    </div>
  );
}
