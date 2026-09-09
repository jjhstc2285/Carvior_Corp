import { useState } from 'react';
import { StoreProvider } from './store';
import { AuthProvider, useAuth } from './authStore';
import { canSeeLedger } from './lib/permissions';
import type { ModuleKey } from './modules';
import type { Role } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';
import SettlementModule from './components/settlement/SettlementModule';
import ConsultationHub from './components/consultation/ConsultationHub';
import ParkingModule from './components/parking/ParkingModule';
import VehiclePostModule from './components/vehiclePost/VehiclePostModule';
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

const MODULE_TITLE: Record<ModuleKey, string> = {
  attendance: '출퇴근 관리',
  workLog: '업무 일지(작업 일지)',
  approval: '결재 관리',
  consultation: '상담 관리',
  settlement: '정산 관리',
  parking: '주차장 관리',
  vehicle: '차량 관리',
  vehiclePost: '매물 사진 등록',
  ad: '광고 관리',
  purchaseIntake: '매입 관리',
  stockFinance: '재고금융 (제시)',
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
  if (module === 'dealerFee') return <DealerFeeModule />;
  if (module === 'settlement') return <SettlementModule role={role} />;
  if (module === 'consultation') return <ConsultationHub role={role} />;
  if (module === 'vehiclePost') return <VehiclePostModule role={role} />;
  if (module === 'ad') return <AdModule role={role} />;
  return <ParkingModule isAdmin={role === 'ADMIN'} />;
}

function AuthedApp({ role }: { role: Role }) {
  const { user } = useAuth();
  const seeLedger = canSeeLedger(user);
  const [module, setModule] = useState<ModuleKey>('attendance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const chatUnread = useChatUnread();

  // 볼 수 없는 화면에 있다가 권한이 바뀌면 빈 화면에 갇힌다 — 출퇴근으로 돌려보낸다.
  const officeOnly: ModuleKey[] = ['dealerFee'];
  const shownModule: ModuleKey = officeOnly.includes(module) && !seeLedger ? 'attendance' : module;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        active={shownModule}
        onChange={setModule}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        chatUnread={chatUnread}
        canSeeLedger={seeLedger}
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
