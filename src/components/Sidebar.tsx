import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  Car,
  Contact,
  HeartHandshake,
  Home,
  Landmark,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  NotebookPen,
  ParkingSquare,
  ReceiptText,
  Search,
  ShoppingCart,
  Sparkles,
  Stamp,
  Table2,
  Wallet,
  X,
} from 'lucide-react';
import type { ModuleKey } from '../modules';

interface Props {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** 메시지 메뉴에 붙는 안 읽은 개수 */
  chatUnread?: number;
  /** 이 사람이 볼 수 없는 메뉴는 아예 안 그린다 */
  canSeeLedger: boolean;
  /** 대표인가 — 부동산 메뉴를 가린다 */
  isCeo?: boolean;
  /** 인건비를 볼 수 있는 계정인가 — 서버가 정해 준 값 */
  canSeePayroll?: boolean;
  /** 관리 시트를 볼 수 있는가 — 대표와 관리팀 */
  canSeeSheet?: boolean;
  /** 관리자인가 — 경조사비 관리는 여기까지만 연다 */
  isAdmin?: boolean;
}

/**
 * 메뉴를 갈래로 묶는다.
 *
 * 열일곱 개가 한 줄로 늘어서 있으면 어느 게 어디 있는지 외워야 찾는다. 매일 쓰는 사람은
 * 외우지만, 가끔 쓰는 메뉴는 늘 위에서부터 훑게 된다.
 *
 * 묶는 기준은 '누가 쓰는가'가 아니라 '무슨 일인가'다. 사람 기준으로 묶으면 겸하는 사람이
 * 두 군데를 봐야 한다.
 *
 * 전에는 매입 관리가 '영업 · 차량'에, 경조사비가 '자산 · 시설'에 있었다. 매입은 차를
 * 사는 일이라 돈이 나가는 쪽이고, 경조사비는 사람에게 나가는 돈이다 — 둘 다 있던 자리와
 * 하는 일이 달랐다. 돈이 어디로 흐르는지로 다시 갈랐다.
 *
 * 갈래 이름은 짧게 둔다. 이름이 길면 그걸 읽느라 정작 메뉴를 못 본다.
 */
const NAV_GROUPS: { title: string; items: { key: ModuleKey; label: string; icon: typeof CalendarClock }[] }[] = [
  {
    title: '인사 · 급여',
    items: [
      { key: 'attendance', label: '출퇴근 관리', icon: CalendarClock },
      { key: 'workLog', label: '업무 일지', icon: NotebookPen },
      { key: 'payroll', label: '인건비', icon: Wallet },
      // 사람에게 나가는 돈이다 — 자산·시설이 아니라 여기가 맞다
      { key: 'condolence', label: '경조사비 관리', icon: HeartHandshake },
    ],
  },
  {
    title: '영업 · 고객',
    items: [
      { key: 'consultation', label: '상담 관리', icon: MessageSquareText },
      { key: 'vendor', label: '거래처 관리', icon: Contact },
      { key: 'ad', label: '광고 관리', icon: Megaphone },
    ],
  },
  {
    title: '차량 · 시설',
    items: [
      { key: 'vehicle', label: '차량 관리', icon: Car },
      { key: 'parking', label: '주차장 관리', icon: ParkingSquare },
      { key: 'property', label: '부동산 정보', icon: Home },
      { key: 'cleaning', label: '청소 관리', icon: Sparkles },
    ],
  },
  {
    title: '구매 · 재무',
    items: [
      // 차를 사는 일이다 — 돈이 나가는 쪽에 둔다
      { key: 'purchaseIntake', label: '매입 관리', icon: ShoppingCart },
      { key: 'settlement', label: '정산 관리', icon: ReceiptText },
      { key: 'approval', label: '결재 관리', icon: Stamp },
      // '(제시)'를 뗀다 — 메뉴에 붙은 사족이라 읽는 데 품만 든다
      { key: 'stockFinance', label: '재고금융', icon: Landmark },
      { key: 'adminSheet', label: '플랫폼 매물 점검', icon: Table2 },
    ],
  },
  {
    title: '기타 · 지원',
    items: [
      { key: 'dealerFee', label: '상조회비 관리', icon: Building2 },
      { key: 'chat', label: '메시지', icon: MessageSquare },
    ],
  },
];

export default function Sidebar({
  active,
  onChange,
  mobileOpen,
  onMobileClose,
  chatUnread = 0,
  canSeeLedger,
  isCeo = false,
  canSeePayroll = false,
  canSeeSheet = false,
  isAdmin = false,
}: Props) {
  const [query, setQuery] = useState('');

  /*
    볼 수 없는 메뉴는 아예 안 그린다. 거르고 나서 빈 갈래는 제목까지 지운다 —
    아무것도 없는 제목만 남으면 뭔가 고장 난 것처럼 보인다.
  */
  const canSee = (key: ModuleKey) =>
    // 상조회비는 사무장과 관리자만 본다
    (key !== 'dealerFee' || canSeeLedger) &&
    // 부동산은 대표만 — 메뉴에서부터 안 보인다
    (key !== 'property' || isCeo) &&
    // 인건비도 마찬가지다. 누가 얼마 받는지는 메뉴에 있는 것만으로도 말이 나온다
    (key !== 'payroll' || canSeePayroll) &&
    // 플랫폼 매물 점검은 대표와 광고팀만 — 메뉴에서부터 안 보인다
    (key !== 'adminSheet' || canSeeSheet) &&
    /*
      거래처와 경조사비도 장부 쪽이다.

      거래처는 단가와 결제 조건이 적혀 있고, 경조사비는 누구에게 얼마가 나갔는지가
      남는다 — 둘 다 일하는 데 필요해서 보는 값이 아니라 챙기는 사람이 보는 값이다.
    */
    (key !== 'vendor' || canSeeLedger) &&
    /*
      경조사비는 관리자만.

      누구에게 얼마를 냈는지가 이름과 함께 줄줄이 적힌 장부다 — 사무장·본부장까지
      열어 두면 "저 집엔 얼마 냈더라"가 사내에서 오간다. 번호까지 걸어 두지만,
      메뉴에서부터 안 보이는 쪽이 먼저다.
    */
    (key !== 'condolence' || isAdmin);

  /*
    이름으로 찾는다.

    갈래로 묶어도 열일곱 개는 눈으로 훑어야 한다. 어디 있는지 아는 사람에게는 묶음이
    길이고, 이름만 아는 사람에게는 검색이 길이다 — 둘 다 열어 둔다.

    찾는 동안에는 갈래 제목을 안 그린다. 한 갈래에 한 줄씩 남으면 제목이 결과보다 많아진다.
  */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(i => canSee(i.key) && (!q || i.label.toLowerCase().includes(q))),
    })).filter(g => g.items.length > 0);
  }, [query, canSeeLedger, isCeo, canSeePayroll, canSeeSheet, isAdmin]);

  const searching = query.trim().length > 0;

  const go = (key: ModuleKey) => {
    onChange(key);
    onMobileClose();
    // 찾아 들어가면 검색어는 지운다 — 남겨 두면 다음에 열 때 메뉴가 몇 개만 보인다
    setQuery('');
  };

  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          {/* 회사 로고. public/ 에 두고 경로로 부른다 — 번들에 안 섞여서 브라우저가 따로 캐시한다 */}
          <img src="/icon-192.png" alt="애니원모터스" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-[15px] font-bold text-slate-800">애니원모터스</span>
        </div>
        <button onClick={onMobileClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden">
          <X size={18} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              // 한 개만 남았으면 엔터로 바로 들어간다 — 치고 나서 또 눌러야 하면 손이 두 번 간다
              if (e.key !== 'Enter') return;
              const only = groups.flatMap(g => g.items);
              if (only.length === 1) go(only[0].key);
            }}
            placeholder="메뉴 검색"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 메뉴가 길어 화면을 넘길 수 있다 — 넘치면 이 안에서만 구른다 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {searching && groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-400">찾는 메뉴가 없습니다.</p>
        )}
        {groups.map(group => (
          <div key={group.title} className="mb-3 last:mb-0">
            {/* 찾는 동안에는 갈래 제목을 안 그린다 — 한 줄씩 남으면 제목이 결과보다 많아진다 */}
            {!searching && (
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group.title}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = active === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => go(item.key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-50 font-semibold text-indigo-700'
                        : 'font-medium text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                    {item.label}
                    {item.key === 'chat' && chatUnread > 0 && (
                      <span className="ml-auto inline-flex min-w-4 justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 계정 정보/로그아웃은 상단 네비게이션 바(UserMenu)로 옮김 */}
    </>
  );

  return (
    <>
      {/* 데스크탑: 고정 사이드바 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {content}
      </aside>

      {/* 모바일: 오버레이 드로어 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
