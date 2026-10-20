import { useState } from 'react';
import { Download } from 'lucide-react';
import ConsultationModule from './ConsultationModule';
import type { ConsultationKind } from '../../types';
import ConsultationSheetImportModal from './SheetImportModal';
import SoldMixChart from './SoldMixChart';
import PlatformMixChart from './PlatformMixChart';
import ChartRange, { defaultRange, type Range } from './ChartRange';
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
  { key: 'SALE', label: '판매 상담' },
  { key: 'BROKERAGE', label: '알선 상담' },
  { key: 'EXPORT', label: '수출 상담' },
  { key: 'OTHER', label: '기타' },
];

export default function ConsultationHub({ role }: Props) {
  const [tab, setTab] = useState<ConsultationKind>('SALE');
  /* 두 그래프가 같이 쓰는 기간 — 처음엔 종류를 나눠 적기 시작한 달부터 오늘까지 */
  const [range, setRange] = useState<Range>(defaultRange);
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
        나간 쪽과 들어온 쪽을 나란히 둔다 — 탭과 상관없이 늘 같은 자리다.

        왼쪽은 어디로 팔렸나(판매·알선·수출·기타), 오른쪽은 어디서 전화가 왔나
        (엔카·114·소개…). 둘을 같이 봐야 "엔카에서 많이 들어오는데 정작 수출로
        나간다" 같은 게 보인다. 좁은 화면에서는 위아래로 선다.

        관리자만 본다. 회사 전체가 어디서 들어와 어디로 나가는지를 모아 놓은 숫자라,
        광고비를 어디에 쓸지 같은 판단에 쓰는 값이지 적는 사람이 볼 값이 아니다 —
        전환율이 그대로 보이면 누가 몇 건을 놓쳤는지로 읽힌다.

        화면에서 안 그리는 것뿐이다. 숫자 자체는 상담 목록에서 나오는 것이라 가린 게
        아니다 — 감춰야 하는 값이면 서버에서 안 내려줘야 한다.

        재고 금융 할부 의무는 알선 정산으로 옮겼다 — 정산에서 보기로 했다.
      */}
      {role === 'ADMIN' && (
        <>
          {/* 기간은 하나로 들고 둘에 같이 내려준다 — 자가 다르면 나란히 둔 뜻이 없다 */}
          <ChartRange value={range} onChange={setRange} />

          <div className="mb-4 flex flex-col items-stretch gap-4 xl:flex-row">
            <SoldMixChart range={range} />
            <PlatformMixChart range={range} />
          </div>
        </>
      )}

      {/* key 를 줘서 탭을 옮기면 검색·필터가 초기화된다 — 알선에서 걸어둔 조건이 수출에 남으면 헷갈린다 */}
      <ConsultationModule key={tab} role={role} kind={tab} />

      {importOpen && (
        <ConsultationSheetImportModal onClose={() => setImportOpen(false)} onImported={() => void refresh()} />
      )}
    </div>
  );
}
