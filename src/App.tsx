import { useCallback, useState } from 'react';
import { StoreProvider } from './store';
import { AuthProvider, useAuth } from './authStore';
import { canSeeLedger } from './lib/permissions';

/**
 * 부동산을 보는 사람 — 대표 한 명이다.
 * 서버(properties.module.ts)도 같은 이름으로 다시 본다. 고칠 땐 양쪽을 같이 본다.
 */
const CEO_NAME = '유진욱';
import { useStore } from './store';
import { useAutoAwayStatus } from './hooks/useAutoAwayStatus';
import { api } from './lib/api';
import dayjs from 'dayjs';
import type { ModuleKey } from './modules';
import type { Role } from './types';
import Sidebar from './components/Sidebar';
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
import PurchaseIntakeModule from './components/purchaseIntake/PurchaseIntakeModule';
import StockFinanceModule from './components/vehicle/StockFinanceModule';
import DealerFeeModule from './components/dealerFee/DealerFeeModule';
import ApprovalModule from './components/approval/ApprovalModule';
import AdModule from './components/ad/AdModule';
import { useChatUnread } from './components/chat/useChat';
import RealtimeToasts from './components/RealtimeToasts';
import LoginPage from './components/auth/LoginPage';
import VendorModule from './components/vendor/VendorModule';
import PropertyModule from './components/property/PropertyModule';

const MODULE_TITLE: Record<ModuleKey, string> = {
  attendance: '출퇴근 관리',
  workLog: '업무 일지(작업 일지)',
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
  dealerFee: '신차영업소 상조회비',
  cleaning: '청소 관리 대장',
  chat: '메시지',
};

function ModuleContent({ module, role }: { module: ModuleKey; role: Role }) {
  if (module === 'attendance') return role === 'EMPLOYEE' ? <EmployeeView /> : <AdminView />;
  if (module === 'workLog') return <WorkLogModule role={role} />;
  if (module === 'approval') return <ApprovalModule role={role} />;
  if (module === 'vehicle') return <VehicleModule />;
  if (module === 'chat') return <ChatModule role={role} />;
  if (module === 'cleaning') return <CleaningModule role={role} />;
  if (module === 'purchaseIntake') return <PurchaseIntakeModule />;
  if (module === 'stockFinance') return <StockFinanceModule />;
  if (module === 'vendor') return <VendorModule role={role} />;
  if (module === 'property') return <PropertyModule />;
  if (module === 'dealerFee') return <DealerFeeModule />;
  if (module === 'settlement') return <SettlementModule role={role} />;
  if (module === 'consultation') return <ConsultationHub role={role} />;
  if (module === 'ad') return <AdModule role={role} />;
  return <ParkingModule isAdmin={role === 'ADMIN'} />;
}

function AuthedApp({ role }: { role: Role }) {
  const { user } = useAuth();
  const seeLedger = canSeeLedger(user);
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
  const officeOnly: ModuleKey[] = ['dealerFee'];
  // 부동산은 대표만. 이름으로 가린다(서버도 같은 이름으로 다시 본다)
  const isCeo = user?.name?.trim() === CEO_NAME;
  const blocked = (officeOnly.includes(module) && !seeLedger) || (module === 'property' && !isCeo);
  const shownModule: ModuleKey = blocked ? 'attendance' : module;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        active={shownModule}
        onChange={setModule}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        chatUnread={chatUnread}
        canSeeLedger={seeLedger}
        isCeo={isCeo}
      />
      <div className="min-w-0 flex-1">
        <TopBar
          title={MODULE_TITLE[shownModule]}
          role={role}
          onMenuClick={() => setMobileNavOpen(true)}
          chatUnread={chatUnread}
          onOpenChat={() => setModule('chat')}
        />
        <ModuleContent module={shownModule} role={role} />
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
