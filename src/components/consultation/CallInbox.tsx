import { useCallback, useEffect, useState } from 'react';
import { Car, ChevronDown, ChevronRight, PhoneIncoming, PhoneOutgoing, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { matchVehicles, type CallMatch } from '../../lib/callMatch';
import type { ManagedVehicle } from '../../types';

/**
 * 채널톡 전화 상담 받아오기.
 *
 * 전화가 오면 채널톡이 녹취를 받아 적는다. 지금은 그걸 보면서 상담내용을 다시 손으로
 * 옮겨 치는데, 통화 한 건이 길면 옮기다 빠뜨리고 숫자가 틀린다.
 *
 * 여기서는 통화를 목록으로 보여주고, 누르면 그 내용을 상담 등록 창에 그대로 넣어 준다.
 * 손님번호도 같이 넣으니 번호를 옮겨 칠 일이 없다.
 *
 * 어떤 차를 보고 걸었는지도 같이 짚어 준다 — 통화에 나온 번호 뒷자리나 차명을 상담 가능
 * 차량과 맞춰 본다. 맞는 차가 없으면 아무것도 안 짚는다. 엉뚱한 차를 짚어 주면 그걸
 * 믿고 열어 보는 헛걸음이 생긴다.
 */

export interface CallRecord {
  userChatId: string;
  messageId: string | null;
  customerPhone: string;
  direction: 'inbound' | 'outbound';
  at: string;
  seconds: number;
  managerName: string;
  state: string;
  summary: string;
  lines: { who: string; text: string; at: string }[];
  text: string;
}

interface Props {
  /** 상담 등록 창을 연다 — 통화 내용과 손님번호, 고른 차를 실어 보낸다 */
  onStart: (seed: { content: string; customerPhone: string; vehicle?: ManagedVehicle }) => void;
}

const LS_OPEN = 'callInboxOpen';

export default function CallInbox({ onStart }: Props) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [vehicles, setVehicles] = useState<ManagedVehicle[]>([]);
  const [open, setOpen] = useState(() => localStorage.getItem(LS_OPEN) === '1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 차 목록이 막혀도 통화는 보여준다 — 차를 짚어 주는 건 덤이다
      const [rows, cars] = await Promise.all([
        api<CallRecord[]>('/channeltalk/calls?days=3'),
        api<ManagedVehicle[]>('/vehicles').catch(() => [] as ManagedVehicle[]),
      ]);
      setCalls(rows);
      setVehicles(cars);
    } catch (e) {
      setError(e instanceof Error ? e.message : '통화 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 펼칠 때 받아온다 — 접어 둔 채로 저쪽 API를 계속 두드릴 이유가 없다
  useEffect(() => {
    if (open && calls.length === 0 && !error) void load();
  }, [open, calls.length, error, load]);

  const toggle = () => {
    setOpen(prev => {
      localStorage.setItem(LS_OPEN, prev ? '0' : '1');
      return !prev;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
        {open ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronRight size={14} className="text-slate-400" />
        )}
        <PhoneIncoming size={15} className="text-emerald-500" />
        <span className="text-sm font-bold text-slate-700">채널톡 전화 상담</span>
        {calls.length > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            최근 {calls.length}건
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-400">통화 내용을 상담으로 옮겨 적습니다</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:text-slate-300"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? '불러오는 중' : '다시 불러오기'}
            </button>
            <span className="text-[11px] text-slate-400">최근 3일</span>
          </div>

          {error && <p className="py-2 text-xs text-red-500">{error}</p>}
          {!error && !loading && calls.length === 0 && (
            <p className="py-2 text-xs text-slate-400">최근 3일 통화가 없습니다.</p>
          )}

          <ul className="divide-y divide-slate-50">
            {calls.map(call => (
              <CallRow
                key={call.userChatId}
                call={call}
                vehicles={vehicles}
                expanded={expanded === call.userChatId}
                onToggle={() => setExpanded(prev => (prev === call.userChatId ? null : call.userChatId))}
                onStart={onStart}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CallRow({
  call,
  vehicles,
  expanded,
  onToggle,
  onStart,
}: {
  call: CallRecord;
  vehicles: ManagedVehicle[];
  expanded: boolean;
  onToggle: () => void;
  onStart: Props['onStart'];
}) {
  /* 통화에 나온 차 — 요약과 전문을 합쳐서 찾는다 */
  const matches: CallMatch[] = matchVehicles(call.text, vehicles).slice(0, 4);
  const outbound = call.direction === 'outbound';
  // 전사가 아직 도는 중이면 내용이 비어 있다. 조금 뒤에 다시 부르면 채워진다
  const pending = call.lines.length === 0 && call.state !== 'transcribed';

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {outbound ? (
          <PhoneOutgoing size={13} className="text-sky-500" />
        ) : (
          <PhoneIncoming size={13} className="text-emerald-500" />
        )}
        <span className="font-mono text-sm font-semibold text-slate-700">{call.customerPhone}</span>
        <span className="text-xs text-slate-400">{call.at}</span>
        {call.seconds > 0 && <span className="text-xs text-slate-400">{call.seconds}초</span>}
        {call.managerName && <span className="text-xs text-slate-500">담당 {call.managerName}</span>}
        {pending && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            받아 적는 중
          </span>
        )}

        <button
          onClick={onToggle}
          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          {expanded ? '접기' : '통화 내용'}
        </button>
        <button
          onClick={() => onStart({ content: call.text, customerPhone: call.customerPhone })}
          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          상담으로 옮기기
        </button>
      </div>

      {/* 어떤 차를 보고 걸었는지 — 누르면 그 차로 상담을 연다 */}
      {matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Car size={12} className="text-slate-300" />
          {matches.map(m => (
            <button
              key={m.vehicle.id}
              onClick={() => onStart({ content: call.text, customerPhone: call.customerPhone, vehicle: m.vehicle })}
              title={`${m.reason} 로 찾았습니다 — 눌러서 이 차로 상담을 엽니다`}
              className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <span className="font-mono">{m.vehicle.vehicleNumber}</span>
              <span className="text-indigo-500">{m.vehicle.vehicleModel}</span>
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
          {call.summary && (
            <p className="mb-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
              <b className="text-slate-500">요약</b>
              {'\n'}
              {call.summary}
            </p>
          )}
          {call.lines.length === 0 ? (
            <p className="text-xs text-slate-400">
              {pending ? '채널톡이 아직 받아 적는 중입니다. 잠시 뒤 다시 불러오세요.' : '녹취 내용이 없습니다.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {call.lines.map((l, i) => (
                <li key={i} className="text-xs leading-relaxed">
                  <span className={l.who === '상담원' ? 'font-semibold text-indigo-600' : 'font-semibold text-slate-500'}>
                    {l.who}
                  </span>
                  <span className="ml-1.5 text-slate-700">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
