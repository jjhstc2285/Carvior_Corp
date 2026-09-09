import dayjs from 'dayjs';
import ApprovalInbox from './ApprovalInbox';
import SignupApprovals from './SignupApprovals';
import AttendanceRequestInbox from './AttendanceRequestInbox';
import StatusBar from './StatusBar';
import MonthlyDashboard from './MonthlyDashboard';
import IpWhitelistSettings from './IpWhitelistSettings';
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
        {/* 오늘 누가 무엇을 하는지 — 승인함보다 먼저 보는 값이다 */}
        <StatusBar />
        <AttendanceRequestInbox />
        {/* 가입 승인은 대기 건이 있을 때만 나타난다 — 없으면 자리를 차지하지 않는다 */}
        <SignupApprovals />
        <ApprovalInbox />
        <IpWhitelistSettings />
        <AttendanceDeviceSettings />
        <EmployeeSettings />
        <MonthlyDashboard />
      </div>
    </div>
  );
}
