import { useCallback, useEffect, useState } from 'react';
import { StoreProvider } from './store';
import { AuthProvider, useAuth } from './authStore';
import { canSeeLedger } from './lib/permissions';

/**
 * 부동산을 볼 수 있는지는 서버에 묻는다.
 *
 * 대외비라 보는 사람을 몇으로 못 박아 두는데(대표 · 사무장 · 테스트 계정), 그 목록을
 * 화면도 들고 있으면 사람이 바뀔 때 양쪽을 고쳐야 한다 — 한쪽만 고치면 메뉴는 보이는데
 * 안 열리거나, 열리는데 메뉴가 없다.
 */
/** 인건비를 볼 수 있는 계정인가 — 누가 보는지는 서버가 정한다 */
function usePayrollAccess(): boolean {
  const [canOpen, setCanOpen] = useState(false);
  useEffect(() => {
    void api<{ canOpen: boolean }>('/payroll/access')
      .then(r => setCanOpen(r.canOpen))
      // 못 물어보면 안 보여준다 — 남의 급여는 막히는 쪽이 안전하다
      .catch(() => setCanOpen(false));
  }, []);
  return canOpen;
}

function usePropertyAccess(): boolean {
  const [canOpen, setCanOpen] = useState(false);
  useEffect(() => {
    void api<{ canOpen: boolean }>('/properties/access')
      .then(r => setCanOpen(r.canOpen))
      // 못 물어보면 안 보여준다 — 대외비는 막히는 쪽이 안전하다
      .catch(() => setCanOpen(false));
  }, []);
  return canOpen;
}
import { useStore } from './store';
import { useAutoAwayStatus } from './hooks/useAutoAwayStatus';
import { api } from './lib/api';
import dayjs from 'dayjs';
import type { ModuleKey } from './modules';
import type { Role } from './types';
import Sidebar from './components/Sidebar';
import AdminSheetModule from './components/admin/AdminSheetModule';
import { canSeeAdminSheet } from './lib/permissions';
import TopBar from './components/TopBar';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';
import SettlementModule from './components/settlement/SettlementModule';
import ConsultationHub from './components/consultation/ConsultationHub';
import ParkingModule from './components/parking/ParkingModule';
import WorkLogModule from './components/workLog/WorkLogModule';
import VehicleModule from './components/vehicle/VehicleModule';
import ChatModule from './components/chat/ChatModule';
import CleaningModule from './components/cleaning/CleaningModule';
import CondolenceModule from './components/condolence/CondolenceModule';
import PurchaseIntakeModule from './components/purchaseIntake/PurchaseIntakeModule';
import StockFinanceModule from './components/vehicle/StockFinanceModule';
import DealerFeeModule from './components/dealerFee/DealerFeeModule';
import LedgerLock from './components/LedgerLock';
import ApprovalModule from './components/approval/ApprovalModule';
import AdModule from './components/ad/AdModule';
import { useChatUnread } from './components/chat/useChat';
import RealtimeToasts from './components/RealtimeToasts';
import LoginPage from './components/auth/LoginPage';
import VendorModule from './components/vendor/VendorModule';
import PropertyModule from './components/property/PropertyModule';
import PayrollModule from './components/payroll/PayrollModule';

const MODULE_TITLE: Record<ModuleKey, string> = {
  adminSheet: '플랫폼 매물 점검',
  attendance: '출퇴근 관리',
  workLog: '업무 일지',
  approval: '결재 관리',
  consultation: '상담 관리',
  settlement: '정산 관리',
  parking: '주차장 관리',
  vehicle: '차량 관리',
  ad: '광고 관리',
  purchaseIntake: '매입 관리',
  stockFinance: '재고금융 (제시)',
  vendor: '거래처 대장',
  property: '부동산 정보',
  payroll: '인건비',
  dealerFee: '신차영업소 상조회비',
  cleaning: '청소 관리 대장',
  condolence: '경조사비 대장',
  chat: '메시지',
};

function ModuleContent({ module, role }: { module: ModuleKey; role: Role }) {
  if (module === 'attendance') return role === 'EMPLOYEE' ? <EmployeeView /> : <AdminView />;
  if (module === 'workLog') return <WorkLogModule role={role} />;
  if (module === 'approval') return <ApprovalModule role={role} />;
  if (module === 'vehicle') return <VehicleModule />;
  if (module === 'chat') return <ChatModule role={role} />;
  if (module === 'cleaning') return <CleaningModule role={role} />;
  /*
    경조사비 대장은 번호를 한 번 더 받는다.

    누구에게 얼마를 냈는지가 사람 이름과 함께 줄줄이 적힌 장부다 — 자리를 비운 사이
    열린 화면이 그대로 남으면 안 된다. 부동산·상조회비와 같은 번호를 쓴다.
  */
  if (module === 'condolence')
    return (
      <LedgerLock title="경조사비 대장">
        <CondolenceModule />
      </LedgerLock>
    );
  if (module === 'purchaseIntake') return <PurchaseIntakeModule />;
  if (module === 'stockFinance') return <StockFinanceModule />;
  if (module === 'vendor') return <VendorModule role={role} />;
  if (module === 'property') return <PropertyModule />;
  if (module === 'payroll') return <PayrollModule />;
  if (module === 'dealerFee')
    return (
      // 부동산과 같은 비밀번호로 잠근다 — 같은 성격의 돈 장부다
      <LedgerLock title="신차영업소 상조회비">
        <DealerFeeModule />
      </LedgerLock>
    );
  if (module === 'settlement') return <SettlementModule role={role} />;
  if (module === 'consultation') return <ConsultationHub role={role} />;
  if (module === 'ad') return <AdModule role={role} />;
  if (module === 'adminSheet') return <AdminSheetModule />;
  return <ParkingModule isAdmin={role === 'ADMIN'} />;
}

/**
 * 직원 화면으로 보기.
 *
 * 관리자 화면에는 직원에게 안 보여야 할 숫자가 섞여 있다(판매수익 같은 것). 가렸는지
 * 확인하려면 직원 계정으로 다시 로그인해야 했는데, 그러자고 남의 계정 비밀번호를 물어
 * 볼 수는 없다.
 *
 * 켜면 그 자리에서 직원 눈으로 바뀐다. 보기만 바뀌는 것이고 서버는 그대로 관리자로
 * 본다 — 가려지는 게 화면뿐인 값이 있으면 이걸로는 안 잡힌다. 그래서 '확인용'이다.
 *
 * 새로 고치면 꺼진다. 켜 둔 걸 잊고 "왜 안 보이지" 하는 일이 없게, 켜져 있는 동안에는
 * 위에 띠를 하나 두른다.
 */
function AuthedApp({ role }: { role: Role }) {
  const { user } = useAuth();
  const [asEmployee, setAsEmployee] = useState(false);
  const shownRole: Role = asEmployee ? 'EMPLOYEE' : role;
  const seeLedger = canSeeLedger(user);
  const isCeo = usePropertyAccess();
  const canSeePayroll = usePayrollAccess();
  const [module, setModule] = useState<ModuleKey>('attendance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const chatUnread = useChatUnread();
  const { state, refresh } = useStore();

  /*
   * 30분 조작이 없으면 상태를 자리비움으로 바꾼다.
   *
   * 어느 화면에 있든 돌아야 해서 앱 껍데기에 단다. 출근을 찍고 아직 퇴근을 안 찍었을
   * 때만 잡는다 — 퇴근한 사람이 자리를 비운 건 당연한 일이다.
   */
  const today = dayjs().format('YYYY-MM-DD');
  const myRecord = state.records.find(r => r.employeeId === state.currentEmployeeId && r.date === today);
  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  /** 관리 시트 — 대표(관리자)와 관리팀만. 메뉴에서부터 안 보인다 */
  const canSeeSheet = canSeeAdminSheet({ role }, me?.department);

  useAutoAwayStatus({
    working: Boolean(myRecord?.clockIn) && !myRecord?.clockOut,
    statusText: me?.statusText,
    setStatus: useCallback(
      async (next: { emoji: string | null; text: string | null }) => {
        await api('/employees/me/status', { method: 'PATCH', body: next });
        await refresh();
      },
      [refresh],
    ),
  });

  // 볼 수 없는 화면에 있다가 권한이 바뀌면 빈 화면에 갇힌다 — 출퇴근으로 돌려보낸다.
  // 거래처·경조사비도 장부 쪽이다 — 단가와 나간 돈이 적혀 있다
  const officeOnly: ModuleKey[] = ['dealerFee', 'vendor', 'condolence'];
  // 누가 보는지는 서버가 정한다 — 대표 · 사무장 · 테스트 계정
  const blocked =
    (officeOnly.includes(module) && !seeLedger) ||
    (module === 'property' && !isCeo) ||
    (module === 'payroll' && !canSeePayroll) ||
    (module === 'adminSheet' && !canSeeSheet);
  const shownModule: ModuleKey = blocked ? 'attendance' : module;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 직원 눈으로 보는 중 — 켜 둔 걸 잊지 않게 띠를 두른다 */}
      {asEmployee && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">
          직원 화면으로 보는 중입니다 — 보기만 바뀐 것이고 권한은 그대로입니다
          <button
            onClick={() => setAsEmployee(false)}
            className="rounded-full bg-white/25 px-2.5 py-0.5 font-bold hover:bg-white/40"
          >
            관리자 화면으로
          </button>
        </div>
      )}
      <Sidebar
        active={shownModule}
        onChange={setModule}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        chatUnread={chatUnread}
        canSeeLedger={seeLedger}
        isCeo={isCeo}
        canSeePayroll={canSeePayroll}
        canSeeSheet={canSeeSheet}
      />
      <div className="min-w-0 flex-1">
        <TopBar
          title={MODULE_TITLE[shownModule]}
          role={shownRole}
          onMenuClick={() => setMobileNavOpen(true)}
          chatUnread={chatUnread}
          onOpenChat={() => setModule('chat')}
          preview={role === 'ADMIN' ? { on: asEmployee, toggle: () => setAsEmployee(v => !v) } : undefined}
        />
        <ModuleContent module={shownModule} role={shownRole} />
      </div>

      {/* 어느 화면에 있어도 실시간 알림·메시지를 놓치지 않게 앱 전체에 하나만 띄운다 */}
      <RealtimeToasts onOpenChat={() => setModule('chat')} />
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();

  // 저장된 토큰으로 세션을 복구하는 동안 로그인 화면이 깜빡이지 않게 잡아둔다.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">불러오는 중…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <StoreProvider>
      <AuthedApp role={user.role} />
    </StoreProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
