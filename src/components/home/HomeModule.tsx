import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Car,
  ChevronRight,
  Headset,
  Megaphone,
  MessageSquare,
  Pin,
  NotebookPen,
  ShoppingCart,
} from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { goTo } from '../../lib/goto';
import { useWorkLogs } from '../workLog/useWorkLogs';
import type { ManagedVehicle } from '../../types';
import type { ModuleKey } from '../../modules';
import HomeClockCard from './HomeClockCard';
import { CONSULTATION_STATUS_LABEL } from '../../types';
import { NOTICE_TONE, type Notice } from '../notice/NoticeModule';

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
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    // 못 불러와도 나머지는 그대로 뜬다 — 덤으로 띄우는 자리다
    api<ManagedVehicle[]>('/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
    api<Notice[]>('/notices')
      .then(rows => setNotices(rows.slice(0, 5)))
      .catch(() => setNotices([]));
  }, []);

  const me = state.employees.find(e => e.id === state.currentEmployeeId);
  const now = dayjs();
  const today = now.format('YYYY-MM-DD');

  // 오늘 내 일지 — 적는 곳과 같은 길을 쓴다(체크를 되돌리는 규칙까지 그대로 따라온다)
  const workLogs = useWorkLogs(today, today, '');
  const logs = workLogs.logs;
  const doneCount = logs.filter(l => l.done).length;

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
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/*
        인사 — 누구로 들어와 있는지가 한눈에 보여야 한다. 남의 계정으로 적는 일이 생긴다.

        하늘빛 바탕에 차를 한 대 세워 둔다. 사진을 받아 올 데가 없어 선으로 그린다 —
        그림 파일을 두면 바꿀 때마다 받아서 넣어야 하고, 큰 사진은 열 때마다 내려받는다.

        글자는 짙은 남색이다. 바탕이 옅어서 흰 글씨로는 안 읽힌다.
      */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-100 via-sky-50 to-indigo-100 px-5 py-6 sm:px-7">
        <svg
          viewBox="0 0 230 96"
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 bottom-0 hidden h-[115%] w-auto text-slate-400/60 sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 68h14m178 0h18" />
          <path d="M24 68c0-7 3-18 7-23l11-15c3-5 8-7 13-7h64c6 0 11 2 15 6l17 17c3 3 7 5 11 6l23 5c7 1 12 6 12 12v10c0 3-3 6-7 6h-15" />
          <path d="M62 68h66" />
          <path d="M55 24v23h112L150 29c-3-3-7-5-11-5H55z" />
          <path d="M100 24v23" />
          <circle cx="45" cy="69" r="13" />
          <circle cx="150" cy="69" r="13" />
        </svg>

        <div className="relative">
          <p className="text-xl font-bold text-slate-800 sm:text-2xl">
            안녕하세요, <span className="text-indigo-600">{me?.name ?? ''}{me?.position ? ` ${me.position}` : ''}</span>님!
          </p>
          <p className="mt-1 text-sm text-slate-500">오늘도 좋은 하루 되세요.</p>
          <p className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-600">
            {now.format('YYYY년 M월 D일')} ({DAY_KO[now.day()]})
          </p>
        </div>
      </div>

      {/*
        위 두 줄은 왼쪽이 넓고 오른쪽이 좁다 — 바로가기와 공지·출퇴근은 성격이 다르다.
        아래 세 장은 같은 무게라 폭을 똑같이 나눈다. 둘씩 묶었더니 한 장이 아래로 삐져
        나와서, 세 장을 한 줄에 둔다.
      */}
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
                  className={`group flex items-center gap-2.5 rounded-xl ${s.tone} px-3 py-2.5 text-left transition hover:brightness-95`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.iconTone}`}>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-0.5 text-xs font-bold text-slate-800">
                      {s.label}
                      <ChevronRight size={12} className="text-slate-400 transition group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

        </div>


        <div className="space-y-4">
          <HomeClockCard />

          <Panel title="공지사항" icon={<Megaphone size={15} className="text-rose-500" />} onMore={() => goTo('notice')}>
            {notices.length === 0 ? (
              <Empty>아직 올라온 공지가 없습니다.</Empty>
            ) : (
              <ul className="divide-y divide-slate-50">
                {notices.map(n => (
                  <li key={n.id}>
                    <button
                      onClick={() => goTo('notice')}
                      className="flex w-full items-center gap-1.5 px-1 py-2 text-left hover:bg-slate-50"
                    >
                      {/* 고정한 글은 왜 위에 있는지가 보여야 한다 */}
                      {n.pinned && <Pin size={11} className="shrink-0 text-rose-500" />}
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${NOTICE_TONE[n.category] ?? ''}`}>
                        {n.category}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {dayjs(n.createdAt).format('M/D')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

        </div>
      </div>

      {/* 키를 맞춘다 — 내용이 적은 장이 짧아지면 줄이 들쭉날쭉해진다 */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Panel
          title="오늘 업무 일지"
          icon={<NotebookPen size={15} className="text-emerald-600" />}
          onMore={() => goTo('workLog')}
        >
          {/*
            오늘 적어 둔 할 일을 그대로 띄운다.

            '상담 3건 등록' 같은 목록을 지어낼 뻔했다. 누가 정하는 숫자가 아니라 그냥
            적어 둔 말이 되고, 아무도 안 지우고 아무도 안 본다. 업무 일지가 이미 그
            자리다 — 본인이 적고 본인이 지운다.

            여기서 바로 체크한다. 홈에서 보고 업무 일지로 건너가 또 눌러야 하면 손이 두
            번 간다. 서버가 거부하면 체크를 되돌리는 것까지 useWorkLogs 가 들고 있다.
          */}
          {logs.length === 0 ? (
            <Empty>
              오늘 적은 일지가 없습니다.
              <br />
              <button onClick={() => goTo('workLog')} className="mt-1 font-bold text-emerald-600 hover:underline">
                업무 일지에서 적기 →
              </button>
            </Empty>
          ) : (
            <>
              <ul className="divide-y divide-slate-50">
                {logs.map(l => (
                  <li key={l.id} className="flex items-start gap-2 px-1 py-2">
                    <input
                      type="checkbox"
                      checked={l.done}
                      onChange={() => void workLogs.toggle(l)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                    />
                    <span className={`min-w-0 flex-1 text-xs ${l.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {l.content}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
                {logs.length}건 중 <b className="font-bold text-emerald-600">{doneCount}건</b> 끝냄
              </p>
            </>
          )}
        </Panel>

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
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
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
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full items-center justify-center py-8 text-center text-xs text-slate-400">{children}</p>;
}
