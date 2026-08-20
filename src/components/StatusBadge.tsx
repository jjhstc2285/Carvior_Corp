import type { AttendanceStatus } from '../types';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/attendance';

export default function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
