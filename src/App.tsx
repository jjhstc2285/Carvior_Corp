import { useState } from 'react';
import { StoreProvider } from './store';
import { AuthProvider, useAuth } from './authStore';
import type { ModuleKey } from './modules';
import type { Role } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';
import SettlementModule from './components/settlement/SettlementModule';
import ConsultationModule from './components/consultation/ConsultationModule';
import ParkingModule from './components/parking/ParkingModule';
import VehiclePostModule from './components/vehiclePost/VehiclePostModule';
import LoginPage from './components/auth/LoginPage';

const MODULE_TITLE: Record<ModuleKey, string> = {
  attendance: '출퇴근 관리',
  consultation: '알선 상담 관리',
  settlement: '정산 관리',
  parking: '주차장 관리',
  vehiclePost: '매물 사진 등록',
};

function ModuleContent({ module, role }: { module: ModuleKey; role: Role }) {
  if (module === 'attendance') return role === 'EMPLOYEE' ? <EmployeeView /> : <AdminView />;
  if (module === 'settlement') return <SettlementModule role={role} />;
  if (module === 'consultation') return <ConsultationModule role={role} />;
  if (module === 'vehiclePost') return <VehiclePostModule role={role} />;
  return <ParkingModule role={role} />;
}

function AuthedApp({ role }: { role: Role }) {
  const [module, setModule] = useState<ModuleKey>('attendance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        active={module}
        onChange={setModule}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="min-w-0 flex-1">
        <TopBar title={MODULE_TITLE[module]} role={role} onMenuClick={() => setMobileNavOpen(true)} />
        <ModuleContent module={module} role={role} />
      </div>
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
