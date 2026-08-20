import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../store';
import { useCurrentIp } from '../lib/useCurrentIp';

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const FULL_WORK_MINUTES = 8 * 60;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export default function ClockCard() {
  const { state, clockIn, clockOut } = useStore();
  const { ip, loading: ipLoading, error: ipError } = useCurrentIp();
  const [, forceTick] = useState(0);

  // 출근~지금(또는 퇴근시각)까지 원형 게이지가 실시간으로 차오르게 1분마다 리렌더
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const employee = state.employees.find(e => e.id === state.currentEmployeeId)!;
  const today = dayjs().format('YYYY-MM-DD');
  const record = state.records.find(r => r.employeeId === employee.id && r.date === today);

  const whitelistEnabled = state.ipWhitelist.length > 0;
  const ipAllowed = !whitelistEnabled || (!!ip && state.ipWhitelist.includes(ip));

  const clockedIn = !!record?.clockIn;
  const clockedOut = !!record?.clockOut;

  const canClockIn = !clockedIn && !ipLoading && ipAllowed;
  const canClockOut = clockedIn && !clockedOut;

  const nowMin = toMinutes(dayjs().format('HH:mm'));
  const workedMin = record?.clockIn
    ? (record.clockOut ? toMinutes(record.clockOut) : nowMin) - toMinutes(record.clockIn)
    : 0;
  const percent = Math.max(0, Math.min(100, Math.round((workedMin / FULL_WORK_MINUTES) * 100)));
  const h = Math.floor(Math.max(workedMin, 0) / 60);
  const m = Math.max(workedMin, 0) % 60;

  const statusMessage = clockedOut
    ? `${employee.name}님, 오늘 근무를 마쳤습니다.`
    : clockedIn
      ? `${employee.name}님, 근무 중입니다.\n오늘도 화이팅하세요.`
      : `${employee.name}님, 아직 출근 전입니다.`;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>오늘</span>
            <span>{dayjs().format('YY-MM-DD')} ({DAY_KO[dayjs().day()]}) {dayjs().format('HH:mm:ss')}</span>
          </div>
          <p className="mt-3 whitespace-pre-line text-base font-semibold text-slate-800">{statusMessage}</p>
          <div className="mt-3 space-y-0.5 text-sm text-slate-500">
            <p>출근 : {record?.clockIn ?? '-'}</p>
            <p>퇴근 : {record?.clockOut ?? '-'}</p>
          </div>

          {whitelistEnabled && !ipAllowed && !ipLoading && (
            <p className="mt-2 max-w-xs text-xs text-red-500">
              현재 IP({ip ?? '확인 불가'})는 출근 등록이 허용된 IP가 아닙니다. 관리자에게 문의해주세요.
            </p>
          )}
          {ipError && <p className="mt-2 text-xs text-red-400">{ipError}</p>}
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="50" cy="50" r={radius} fill="none" stroke="#4f7cff" strokeWidth="8"
                strokeDasharray={`${dash} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.4s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-slate-800">{percent}%</span>
              <span className="text-[11px] text-slate-400">근무시간</span>
              <span className="text-xs font-semibold text-slate-600">{h}h {m}m</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => clockIn(employee.id)}
              disabled={!canClockIn}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              style={canClockIn ? { backgroundColor: '#4f7cff' } : undefined}
            >
              출근
            </button>
            <button
              onClick={() => clockOut(employee.id)}
              disabled={!canClockOut}
              className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              퇴근
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
