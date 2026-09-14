import { useState } from 'react';
import { Download } from 'lucide-react';
import ConsultationModule from './ConsultationModule';
import type { ConsultationKind } from '../../types';
import ConsultationSheetImportModal from './SheetImportModal';
import CapitalQuotaPanel from './CapitalQuotaPanel';
import { useStore } from '../../store';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

/**
 * 상담 관리 — 알선과 수출을 한 메뉴에서 본다.
 *
 * 둘 다 우리가 직접 적는 상담이고 적는 내용도 흐름도 같아서, 화면 하나를 종류만
 * 바꿔 쓴다. 나눠 둔 건 목록이 섞이면 찾기 어려워서다.
 * (정산 관리가 쓰는 탭 구조와 같다)
 */
const TABS: { key: ConsultationKind; label: string }[] = [
  { key: 'BROKERAGE', label: '알선 상담' },
  { key: 'EXPORT', label: '수출 상담' },
];

export default function ConsultationHub({ role }: Props) {
  const [tab, setTab] = useState<ConsultationKind>('BROKERAGE');
  const [importOpen, setImportOpen] = useState(false);
  const { refresh } = useStore();

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">상담 관리</h1>
        {/* 시트에 쌓인 지난 상담을 옮겨온다. 한 번에 천 건이 넘어 관리자만 부른다. */}
        {role === 'ADMIN' && (
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> 구글 시트에서 가져오기
          </button>
        )}
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

      {/*
        재고금융을 쓴 캐피탈에 할부를 얼마나 깔아 줘야 하는지.
        파는 사람이 손님 앞에서 어느 할부를 밀지 정해야 해서 상담 맨 위에 둔다.
      */}
      <CapitalQuotaPanel />

      {/* key 를 줘서 탭을 옮기면 검색·필터가 초기화된다 — 알선에서 걸어둔 조건이 수출에 남으면 헷갈린다 */}
      <ConsultationModule key={tab} role={role} kind={tab} />

      {importOpen && (
        <ConsultationSheetImportModal onClose={() => setImportOpen(false)} onImported={() => void refresh()} />
      )}
    </div>
  );
}
