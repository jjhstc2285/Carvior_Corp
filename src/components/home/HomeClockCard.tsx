import { useState } from 'react';
import dayjs from 'dayjs';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useStore } from '../../store';
import { useCurrentIp } from '../../lib/useCurrentIp';
import { ipAllowed } from '../../lib/ipMatch';
import { punch } from '../../lib/punch';

/**
 * 홈의 출퇴근 — 누르는 일만 남긴다.
 *
 * 출퇴근 화면의 카드를 그대로 가져왔더니 홈에서 제일 큰 덩어리가 됐다. 원형 게이지와
 * 근무 시간, 구내식당 체크까지 다 들어 있는데, 홈에서 할 일은 둘 중 하나를 누르는 것뿐이다.
 *
 * 그래서 여기서는 지금 상태와 단추 두 개만 둔다. 자세한 건 출퇴근 화면이 보여 준다.
 *
 * 막히는 규칙(등록 안 된 PC·사무실 밖 네트워크)은 lib/punch 에 모아 두고 양쪽이 같이
 * 쓴다 — 각자 들고 있으면 한쪽만 고치는 날이 오고, 같은 상황에서 다른 말이 뜬다.
 */
export default function HomeClockCard() {
  const { state, clockIn, clockOut } = useStore();
  const { ip, loading: ipLoading } = useCurrentIp();
  const [busy, setBusy] = useState(false);

  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  if (!me) return null;

  const today = dayjs().format('YYYY-MM-DD');
  const record = state.records.find(r => r.employeeId === me.id && r.date === today);
  const clockedIn = !!record?.clockIn;
  const clockedOut = !!record?.clockOut;

  // 허용 IP 목록은 관리자만 받아 간다 — 다른 사람 화면에는 빈 목록이라 애초에 안 걸린다
  const isAdmin = me.role === 'ADMIN';
  const whitelistEnabled = state.ipWhitelist.length > 0 && !isAdmin;
  const ipOk = !whitelistEnabled || (!!ip && ipAllowed(state.ipWhitelist, ip));

  const canIn = !clockedIn && (isAdmin || (!ipLoading && ipOk));
  const canOut = clockedIn && !clockedOut;

  const hit = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await punch(action);
    } finally {
      setBusy(false);
    }
  };

  const badge = clockedOut
    ? { text: '퇴근', tone: 'bg-slate-100 text-slate-500' }
    : clockedIn
      ? { text: '근무중', tone: 'bg-emerald-100 text-emerald-700' }
      : { text: '미출근', tone: 'bg-rose-100 text-rose-600' };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Clock size={15} className="text-indigo-600" />
        <p className="text-sm font-bold text-slate-800">오늘 출퇴근</p>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.tone}`}>{badge.text}</span>
      </div>

      {/* 찍은 시각은 작게 — 단추가 먼저 보여야 한다 */}
      {(clockedIn || clockedOut) && (
        <p className="mb-2 text-[11px] text-slate-400">
          출근 <b className="font-bold text-slate-600">{record?.clockIn ?? '—'}</b>
          {clockedOut && (
            <>
              {' · '}퇴근 <b className="font-bold text-slate-600">{record?.clockOut}</b>
            </>
          )}
        </p>
      )}

      <div className="space-y-2">
        <button
          onClick={() => void hit(clockIn)}
          disabled={!canIn || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <LogIn size={15} /> 출근하기
        </button>
        <button
          onClick={() => void hit(clockOut)}
          disabled={!canOut || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
        >
          <LogOut size={15} /> 퇴근하기
        </button>
      </div>

      {/* 왜 못 누르는지 — 안 적으면 "버튼이 안 눌린다"로 돌아온다 */}
      {!clockedIn && !canIn && !ipLoading && (
        <p className="mt-2 text-[11px] text-amber-600">사무실 네트워크에서만 출근을 찍을 수 있습니다.</p>
      )}
    </div>
  );
}
