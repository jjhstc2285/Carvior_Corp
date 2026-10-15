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

  /*
    누구 일지인가 — 관리자에게만 적힌다.

    서버는 관리자에게 전원 일지를 내려주고(work-logs.service) 직원에게는 본인 것만
    내려준다. 이름을 안 적으면 관리자 화면에서 서른 줄이 누구 할 일인지 모르는 목록이
    된다. 본인 줄에는 안 적는다 — 줄마다 자기 이름이 붙으면 읽는 데 방해만 된다.
  */
  const logOwner = (id: string) => (id === state.currentEmployeeId ? '' : nameOf(id));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      {/*
        윗줄은 두 칸 · 한 칸으로 나눈다.

        공지가 출퇴근 아래 있었더니 한참 내려야 보였다 — 들어와서 제일 먼저 봐야 하는 건
        오늘 무슨 공지가 올라왔는가다. 배너 옆, 제일 위로 올린다.

        키는 줄끼리 맞춘다. 옆 칸이 짧아 덩그러니 떠 있으면 빈 자리가 먼저 보인다.
      */}
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
        {/*
          인사 — 누구로 들어와 있는지가 한눈에 보여야 한다. 남의 계정으로 적는 일이 생긴다.

          글자는 짙은 남색이다. 바탕이 옅어서 흰 글씨로는 안 읽힌다.

          배경은 사진 한 장이다. public/ 에 두고 경로로 부른다 — 번들에 안 섞여서
          브라우저가 따로 캐시한다. 받은 원본은 2MB가 넘어 홈을 열 때마다 내려받았다.
          가로 1600px · JPEG 로 줄여 88KB 로 둔다.

          차는 오른쪽에 있고 왼쪽은 하늘이다. 그 위에 글을 얹되 흰 막을 왼쪽에서 오른쪽으로
          옅게 깔아 둔다 — 구름이 밝은 날은 글씨가 하늘에 묻힌다.
        */}
        <div
          className="relative flex min-h-[210px] w-full items-center overflow-hidden rounded-2xl bg-sky-100 bg-cover bg-right px-6 py-7 sm:px-8"
          style={{ backgroundImage: 'url(/home-banner.jpg)' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/85 via-white/50 to-transparent" />

          <div className="relative">
            <p className="text-2xl font-bold text-slate-800 sm:text-3xl">
              안녕하세요, <span className="text-indigo-600">{me?.name ?? ''}{me?.position ? ` ${me.position}` : ''}</span>님!
            </p>
            <p className="mt-1.5 text-base font-medium text-slate-500 sm:text-lg">오늘도 좋은 하루 되세요.</p>
            {/* 날짜와 인사말은 한 줄로 — 좁은 화면에서는 아래로 접힌다 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-bold text-indigo-600">
                {now.format('YYYY년 M월 D일')} ({DAY_KO[now.day()]})
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-medium text-slate-600">
                ☀️ 좋은 하루입니다.
              </span>
            </div>
          </div>
        </div>
        </div>

        <Panel title="공지사항" icon={<Megaphone size={18} className="text-rose-500" />} onMore={() => goTo('notice')}>
              {notices.length === 0 ? (
                <Empty>아직 올라온 공지가 없습니다.</Empty>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {notices.map(n => (
                    <li key={n.id}>
                      <button
                        onClick={() => goTo('notice')}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-3 text-left hover:bg-slate-50"
                      >
                        {/* 고정한 글은 왜 위에 있는지가 보여야 한다 */}
                        {n.pinned && <Pin size={13} className="shrink-0 text-rose-500" />}
                        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${NOTICE_TONE[n.category] ?? ''}`}>
                          {n.category}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{n.title}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {dayjs(n.createdAt).format('M/D')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>

        <div className="xl:col-span-2">
            {/* 바로가기 — 매일 손이 가는 것만. 다 늘어놓으면 메뉴를 한 벌 더 만드는 셈이다 */}
            <div className="grid h-full grid-cols-2 gap-4 sm:grid-cols-3">
              {SHORTCUTS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => goTo(s.key)}
                    className={`group flex min-h-[112px] flex-col justify-center gap-3 rounded-2xl ${s.tone} px-5 py-4 text-left transition hover:brightness-95`}
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full ${s.iconTone}`}>
                      <Icon size={22} />
                    </span>
                    <span>
                      <span className="flex items-center gap-1 text-base font-bold text-slate-800">
                        {s.label}
                        <ChevronRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5" />
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{s.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
        </div>

        <div className="flex">
          <HomeClockCard />
        </div>
      </div>
      {/* 키를 맞춘다 — 내용이 적은 장이 짧아지면 줄이 들쭉날쭉해진다 */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Panel
          title="오늘 업무 일지"
          icon={<NotebookPen size={18} className="text-emerald-600" />}
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
              <ul className="max-h-[340px] divide-y divide-slate-50 overflow-y-auto">
                {logs.map(l => (
                  <li key={l.id} className="flex items-start gap-2.5 px-1 py-3">
                    <input
                      type="checkbox"
                      checked={l.done}
                      onChange={() => void workLogs.toggle(l)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600"
                    />
                    <span
                      title={l.content}
                      className={`min-w-0 flex-1 text-sm ${l.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {/* 관리자에게는 전원 일지가 섞여 온다 — 누구 것인지 적어야 읽힌다 */}
                      {logOwner(l.employeeId) && (
                        <b className="mr-1 font-bold text-slate-500">{logOwner(l.employeeId)}</b>
                      )}
                      {l.content}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-slate-100 pt-2.5 text-xs text-slate-400">
                {logs.length}건 중 <b className="font-bold text-emerald-600">{doneCount}건</b> 끝냄
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="최근 상담 내역"
          icon={<Headset size={18} className="text-blue-600" />}
          onMore={() => goTo('consultation')}
        >
          {recentConsults.length === 0 ? (
            <Empty>아직 적힌 상담이 없습니다.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-400">
                    <th className="py-3 pr-2 font-medium">날짜</th>
                    <th className="py-3 pr-2 font-medium">차량</th>
                    <th className="py-3 pr-2 font-medium">손님</th>
                    <th className="py-3 pr-2 font-medium">담당</th>
                    <th className="py-3 pr-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConsults.map(c => (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap py-3 pr-2 text-slate-400">{dayjs(c.date).format('M/D')}</td>
                      <td className="max-w-[9rem] truncate py-3 pr-2 text-slate-700">
                        {c.vehicleName || c.vehicleNumber || '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-2 text-slate-500">
                        {c.customerPhone || c.customerName || '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-2 text-slate-500">
                        {nameOf(c.visitDealerId ?? c.employeeId)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
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
            icon={<Car size={18} className="text-rose-500" />}
            onMore={() => goTo('vehicle')}
          >
            {recentVehicles.length === 0 ? (
              <Empty>아직 등록된 차가 없습니다.</Empty>
            ) : (
              <ul className="divide-y divide-slate-50">
                {recentVehicles.map(v => (
                  <li key={v.id} className="flex items-center gap-2.5 px-1 py-3 text-sm">
                    <span className="w-11 shrink-0 text-xs text-slate-400">
                      {v.createdAt ? dayjs(v.createdAt).format('M/D') : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{v.vehicleModel || '차명 없음'}</span>
                    <span className="shrink-0 font-mono text-xs text-slate-500">{v.vehicleNumber}</span>
                    {v.soldDate ? (
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                        매도
                      </span>
                    ) : v.advertised ? (
                      <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                        광고중
                      </span>
                    ) : v.prepared ? (
                      <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                        상품화
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-400">
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
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-2.5 flex items-center gap-2">
        {icon}
        <p className="text-base font-bold text-slate-800">{title}</p>
        {onMore && (
          <button
            onClick={onMore}
            className="ml-auto flex items-center gap-0.5 text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            더보기 <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full items-center justify-center py-12 text-center text-sm text-slate-400">{children}</p>;
}
