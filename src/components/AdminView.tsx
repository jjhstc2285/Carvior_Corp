import dayjs from 'dayjs';
import ApprovalInbox from './ApprovalInbox';
import AttendanceRequestInbox from './AttendanceRequestInbox';
import MonthlyDashboard from './MonthlyDashboard';
import IpWhitelistSettings from './IpWhitelistSettings';
import AttendanceDeviceSettings from './AttendanceDeviceSettings';

export default function AdminView() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">{dayjs().format('YYYY년 M월 D일 (ddd)')} 기준</p>
      </div>

      <div className="space-y-6">
        <AttendanceRequestInbox />
        <ApprovalInbox />
        <IpWhitelistSettings />
        <AttendanceDeviceSettings />
        <MonthlyDashboard />
      </div>
    </div>
  );
}
