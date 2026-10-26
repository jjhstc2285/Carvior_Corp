import dayjs from 'dayjs';
import ApprovalInbox from './ApprovalInbox';
import SignupApprovals from './SignupApprovals';
import AttendanceRequestInbox from './AttendanceRequestInbox';
import ClockCard from './ClockCard';
import StatusBar from './StatusBar';
import SettlementApprovalInbox from './settlement/SettlementApprovalInbox';
import MonthlyDashboard from './MonthlyDashboard';
import IpWhitelistSettings from './IpWhitelistSettings';
import TelegramTestCard from './TelegramTestCard';
import TelegramLogCard from './TelegramLogCard';
import AttendanceDeviceSettings from './AttendanceDeviceSettings';
import EmployeeSettings from './EmployeeSettings';

export default function AdminView() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">{dayjs().format('YYYY년 M월 D일 (ddd)')} 기준</p>
      </div>

      <div className="space-y-6">
        {/*
          관리자도 자기 출퇴근은 직접 찍는다.

          이 화면에는 찍는 자리가 없어서 관리자·사무장만 출퇴근을 못 찍고 있었다 —
          직원 화면과 같은 카드를 같은 자리에 둔다.
        */}
        <ClockCard />
        {/* 오늘 누가 무엇을 하는지 — 승인함보다 먼저 보는 값이다 */}
        <StatusBar />
        {/* 결재를 기다리는 정산 — 찾으러 들어가야 하는 결재는 밀린다 */}
        <SettlementApprovalInbox />
        <AttendanceRequestInbox />
        {/* 가입 승인은 대기 건이 있을 때만 나타난다 — 없으면 자리를 차지하지 않는다 */}
        <SignupApprovals />
        <ApprovalInbox />
        {/* 공지가 안 오면 여기서 한 줄 보내 본다 — 실패는 로그에만 남아 한참 뒤에야 안다 */}
        <TelegramTestCard />
        {/*
          방에 무엇이 나갔나 — 입금방·매입방·공지방.

          보냈는지가 서버 로그에만 남아서, 사람이 못 보고 며칠 지나면 밀려 사라졌다.
          못 간 것까지 같이 남긴다 — 안 간 걸 모르는 게 제일 나쁘다.
        */}
        <TelegramLogCard />
        <IpWhitelistSettings />
        <AttendanceDeviceSettings />
        <EmployeeSettings />
        <MonthlyDashboard />
      </div>
    </div>
  );
}
