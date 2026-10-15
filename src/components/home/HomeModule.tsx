import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Bell,
  Car,
  ChevronRight,
  Headset,
  Megaphone,
  MessageSquare,
  NotebookPen,
  ShoppingCart,
} from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { goTo } from '../../lib/goto';
import type { ManagedVehicle } from '../../types';
import type { ModuleKey } from '../../modules';
import ClockCard from '../ClockCard';
import { CONSULTATION_STATUS_LABEL } from '../../types';

/**
 * 홈 — 들어오면 처음 보는 자리.
 *
 * 그동안은 로그인하면 출퇴근 화면이 떴다. 출근을 찍고 나면 할 일이 없는 화면이라,
 * 다들 거기서 메뉴를 다시 짚어 어디론가 갔다 — 매일 아침 한 번씩 버리는 품이다.
 *
 * 여기 모으는 것은 '지금 내가 할 일'과 '방금 무슨 일이 있었나' 둘뿐이다. 숫자를 늘어놓는
 * 자리가 아니다 — 대수와 금액은 각 화면이 더 정확하게 센다. 여기서 또 세면 두 숫자가
 * 어긋나는 날이 오고, 그때부터 아무도 안 믿는다.
 *
 * 그래서 띄우는 건 전부 각 화면이 이미 갖고 있는 값이다. 눌러서 그리로 간다.
 */

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 바로가기 — 매일 손이 가는 것만. 늘어놓으면 메뉴를 한 벌 더 만드는 셈이다 */
const SHORTCUTS: {
  key: ModuleKey;
  label: string;
  desc: string;
  icon: typeof Car;
  tone: string;
  iconTone: string;
}[] = [
  { key: 'consultation', label: '상담 관리', desc: '상담 등록 · 방문 배정', icon: Headset, tone: 'bg-blue-50', iconTone: 'bg-blue-100 text-blue-600' },
  { key: 'vehicle', label: '차량 관리', desc: '차량 등록 · 매도일자', icon: Car, tone: 'bg-rose-50', iconTone: 'bg-rose-100 text-rose-500' },
  { key: 'workLog', label: '업무 일지', desc: '오늘 한 일 적기', icon: NotebookPen, tone: 'bg-emerald-50', iconTone: 'bg-emerald-100 text-emerald-600' },
  { key: 'purchaseIntake', label: '매입 관리', desc: '매입 등록 · 재고일수', icon: ShoppingCart, tone: 'bg-amber-50', iconTone: 'bg-amber-100 text-amber-600' },
  { key: 'ad', label: '광고 관리', desc: '광고 등록 · 점검', icon: Megaphone, tone: 'bg-violet-50', iconTone: 'bg-violet-100 text-violet-600' },
  { key: 'chat', label: '메시지', desc: '직원 간 소통', icon: MessageSquare, tone: 'bg-pink-50', iconTone: 'bg-pink-100 text-pink-500' },
];

/** 상담 상태에 색을 입힌다 — 글자만으로는 줄줄이 같은 무게로 읽힌다 */
const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  VISIT_BOOKED: 'bg-indigo-100 text-indigo-700',
  CONTRACTED: 'bg-emerald-100 text-emerald-700',
  SOLD: 'bg-emerald-100 text-emerald-700',
  VISIT_CANCELED: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-slate-100 text-slate-500',
};

export default function HomeModule() {
  const { state } = useStore();
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);

  useEffect(() => {
    // 못 불러와도 나머지는 그대로 뜬다 — 덤으로 띄우는 자리다
    api<ManagedVehicle[]>('/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  const now = dayjs();
  const today = now.format('YYYY-MM-DD');

  /** 아직 안 읽은 알림이 먼저다 — 읽은 것은 지난 일이다 */
  const notices = useMemo(
    () =>
      [...state.notifications]
        .sort((a, b) => Number(a.read) - Number(b.read) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [state.notifications],
  );

  /**
   * 오늘 내가 맞을 손님.
   *
   * 체크리스트를 지어내지 않는다. '상담 3건 등록' 같은 할 일은 누가 정하는 숫자가 아니라
   * 그냥 적어 둔 말이 된다 — 아무도 안 지우고 아무도 안 본다. 오늘 실제로 약속이 잡힌
   * 손님만 띄운다.
   */
  const myVisits = useMemo(
    () =>
      state.consultations
        .filter(c => c.visitDate === today && c.status !== 'CLOSED')
        .filter(c => (c.visitDealerId ?? c.employeeId) === state.currentEmployeeId)
        .sort((a, b) => (a.visitTime ?? '').localeCompare(b.visitTime ?? '')),
    [state.consultations, today, state.currentEmployeeId],
  );

  const recentConsults = useMemo(
    () =>
      [...state.consultations]
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 5),
    [state.consultations],
  );

  const recentVehicles = useMemo(
    () =>
      [...vehicles]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 5),
    [vehicles],
  );

  const nameOf = (id: string) => state.employees.find(e => e.id === id)?.name ?? '';

  return (
    <div className="space-y-4">
      {/* 인사 — 누구로 들어와 있는지가 한눈에 보여야 한다. 남의 계정으로 적는 일이 생긴다 */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-6 text-white sm:px-7">
        <p className="text-xl font-bold sm:text-2xl">
          안녕하세요, {me?.name ?? ''}
          {me?.position ? ` ${me.position}` : ''}님!
        </p>
        <p className="mt-1 text-sm text-white/80">오늘도 좋은 하루 되세요.</p>
        <p className="mt-3 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
          {now.format('YYYY년 M월 D일')} ({DAY_KO[now.day()]})
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* 바로가기 — 매일 손이 가는 것만. 다 늘어놓으면 메뉴를 한 벌 더 만드는 셈이다 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SHORTCUTS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => goTo(s.key)}
                  className={`group flex items-start gap-3 rounded-2xl ${s.tone} px-4 py-3.5 text-left transition hover:brightness-95`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.iconTone}`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                      {s.label}
                      <ChevronRight size={14} className="text-slate-400 transition group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="오늘 내 손님"
              icon={<Headset size={15} className="text-indigo-600" />}
              onMore={() => goTo('consultation')}
            >
              {myVisits.length === 0 ? (
                <Empty>오늘 잡힌 방문이 없습니다.</Empty>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {myVisits.map(c => (
                    <li key={c.id} className="flex items-center gap-2 px-1 py-2 text-xs">
                      <span className="w-12 shrink-0 font-bold text-indigo-600">{c.visitTime || '시간 미정'}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {c.vehicleName || c.vehicleNumber || '차량 미정'}
                      </span>
                      <span className="shrink-0 text-slate-400">{c.customerPhone || c.customerName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="최근 등록 차량"
              icon={<Car size={15} className="text-rose-500" />}
              onMore={() => goTo('vehicle')}
            >
              {recentVehicles.length === 0 ? (
                <Empty>아직 등록된 차가 없습니다.</Empty>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {recentVehicles.map(v => (
                    <li key={v.id} className="flex items-center gap-2 px-1 py-2 text-xs">
                      <span className="w-10 shrink-0 text-slate-400">
                        {v.createdAt ? dayjs(v.createdAt).format('M/D') : ''}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{v.vehicleModel || '차명 없음'}</span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500">{v.vehicleNumber}</span>
                      {v.soldDate ? (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                          매도
                        </span>
                      ) : v.advertised ? (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          광고중
                        </span>
                      ) : v.prepared ? (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          상품화
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                          대기
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="최근 상담 내역"
            icon={<Headset size={15} className="text-blue-600" />}
            onMore={() => goTo('consultation')}
          >
            {recentConsults.length === 0 ? (
              <Empty>아직 적힌 상담이 없습니다.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
                      <th className="py-1.5 pr-2 font-medium">날짜</th>
                      <th className="py-1.5 pr-2 font-medium">차량</th>
                      <th className="py-1.5 pr-2 font-medium">손님</th>
                      <th className="py-1.5 pr-2 font-medium">담당</th>
                      <th className="py-1.5 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentConsults.map(c => (
                      <tr key={c.id} className="border-b border-slate-50 last:border-0">
                        <td className="whitespace-nowrap py-1.5 pr-2 text-slate-400">{dayjs(c.date).format('M/D')}</td>
                        <td className="max-w-[9rem] truncate py-1.5 pr-2 text-slate-700">
                          {c.vehicleName || c.vehicleNumber || '—'}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500">
                          {c.customerPhone || c.customerName || '—'}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500">
                          {nameOf(c.visitDealerId ?? c.employeeId)}
                        </td>
                        <td className="py-1.5">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              STATUS_TONE[c.status] ?? 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {CONSULTATION_STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {/*
            출퇴근은 쓰던 카드를 그대로 가져온다.

            여기에 단추를 새로 만들면 등록 안 된 PC·사무실 밖 네트워크를 가리는 규칙이
            두 벌이 된다. 한쪽만 고치는 날이 반드시 온다.
          */}
          <ClockCard />

          <Panel title="알림" icon={<Bell size={15} className="text-amber-500" />}>
            {notices.length === 0 ? (
              <Empty>새 알림이 없습니다.</Empty>
            ) : (
              <ul className="divide-y divide-slate-50">
                {notices.map(n => (
                  <li key={n.id} className="flex items-start gap-2 px-1 py-2">
                    {/* 안 읽은 것만 점을 찍는다 — 다 찍으면 아무 뜻이 없다 */}
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? 'bg-slate-200' : 'bg-red-500'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs ${n.read ? 'text-slate-400' : 'text-slate-700'}`}>
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {dayjs(n.createdAt).format('M/D HH:mm')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  onMore,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onMore?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {onMore && (
          <button
            onClick={onMore}
            className="ml-auto flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-600"
          >
            더보기 <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-slate-400">{children}</p>;
}
