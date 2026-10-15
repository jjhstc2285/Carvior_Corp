import { useMemo, useState } from 'react';
import { Phone, Users } from 'lucide-react';
import { useStore } from '../../store';
import { DEPARTMENTS, type Employee } from '../../types';
import EmployeeAvatar from '../EmployeeAvatar';

/**
 * 조직도 — 누가 어느 팀이고 번호가 몇 번인가.
 *
 * 번호를 물어보려고 카톡방을 뒤지거나 옆자리에 묻는다. 직원 명단은 관리자 화면에만 있어서
 * 직원끼리는 볼 데가 없었다 — 들어오면 보이는 자리에 둔다.
 *
 * 윗자리부터 내려 적는다. 급하면 누구에게 거는지를 자리 순서가 말해 준다.
 *
 * 번호는 눌러서 건다. 폰에서는 바로 걸리고 PC에서는 아무 일도 안 일어나니, 눌러서
 * 복사도 되게 둔다 — PC에서 번호를 보고 폰에 옮겨 적는 일이 제일 잦다.
 */

/** 윗자리부터. 목록에 없는 직책은 뒤로 보낸다 */
const RANK = ['대표', '본부장', '사무장', '팀장', '임시팀장', '차장', '과장', '매니저', '사원'];

const rankOf = (position: string): number => {
  const i = RANK.findIndex(r => position.includes(r));
  return i === -1 ? RANK.length : i;
};

/** 팀 빛깔 — 팀마다 달라야 한 화면에서 갈래가 보인다 */
const TEAM_TONE: Record<string, { head: string; chip: string }> = {
  광고팀: { head: 'bg-violet-50 text-violet-700', chip: 'hover:bg-violet-50' },
  계약팀: { head: 'bg-emerald-50 text-emerald-700', chip: 'hover:bg-emerald-50' },
  매입팀: { head: 'bg-amber-50 text-amber-700', chip: 'hover:bg-amber-50' },
  차량관리팀: { head: 'bg-sky-50 text-sky-700', chip: 'hover:bg-sky-50' },
  알선팀: { head: 'bg-rose-50 text-rose-700', chip: 'hover:bg-rose-50' },
  임원: { head: 'bg-indigo-50 text-indigo-700', chip: 'hover:bg-indigo-50' },
  기타: { head: 'bg-slate-100 text-slate-600', chip: 'hover:bg-slate-50' },
};

/*
  팀이 안 적힌 사람.

  대표·본부장·사무장은 팀에 속하지 않는다 — 팀을 비워 두는 게 맞다. 그래도 조직도에서
  빠지면 안 되니 맨 위에 따로 세운다. 그 밖에 팀이 비어 있는 사람은 '기타'로 모은다 —
  안 보이게 두면 누가 빠졌는지 아무도 모른다.
*/
const TOP_POSITIONS = ['대표', '본부장', '사무장'];

export default function OrgChart() {
  const { state } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const groups = useMemo(() => {
    const live = state.employees.filter(e => e.active !== false);
    const sort = (list: Employee[]) =>
      [...list].sort((a, b) => rankOf(a.position) - rankOf(b.position) || a.name.localeCompare(b.name));

    const top = live.filter(e => TOP_POSITIONS.some(p => e.position.includes(p)));
    const topIds = new Set(top.map(e => e.id));
    const rest = live.filter(e => !topIds.has(e.id));

    const out: { team: string; members: Employee[] }[] = [];
    if (top.length > 0) out.push({ team: '임원', members: sort(top) });
    for (const team of DEPARTMENTS) {
      const members = rest.filter(e => e.department === team);
      if (members.length > 0) out.push({ team, members: sort(members) });
    }
    const etc = rest.filter(e => !e.department || !DEPARTMENTS.includes(e.department as (typeof DEPARTMENTS)[number]));
    if (etc.length > 0) out.push({ team: '기타', members: sort(etc) });
    return out;
  }, [state.employees]);

  const copy = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(phone);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // 복사를 막아 둔 브라우저가 있다 — 번호는 글자로 보이니 그대로 두면 된다
    }
  };

  if (groups.length === 0) return null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-indigo-600" />
        <p className="text-base font-bold text-slate-800">조직도</p>
        <span className="ml-auto text-xs text-slate-400">눌러서 번호 보기</span>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {groups.map(g => {
          const tone = TEAM_TONE[g.team] ?? TEAM_TONE.기타;
          return (
            <div key={g.team}>
              <p className={`mb-1.5 inline-flex rounded-md px-2 py-1 text-xs font-bold ${tone.head}`}>
                {g.team} <span className="ml-1 font-medium opacity-60">{g.members.length}</span>
              </p>
              <div className="space-y-0.5">
                {g.members.map(m => {
                  const phone = m.phones?.[0] ?? '';
                  const open = picked === m.id;
                  return (
                    <div key={m.id}>
                      <button
                        onClick={() => setPicked(v => (v === m.id ? null : m.id))}
                        className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left ${tone.chip}`}
                      >
                        <EmployeeAvatar name={m.name} size={22} />
                        <span className="text-sm font-medium text-slate-700">{m.name}</span>
                        <span className="text-xs text-slate-400">{m.position}</span>
                        {/* 번호가 없으면 눌러도 나올 게 없다 — 미리 알려 준다 */}
                        {!phone && <span className="ml-auto text-[11px] text-slate-300">번호 없음</span>}
                        {phone && <Phone size={12} className="ml-auto text-slate-300" />}
                      </button>

                      {open && phone && (
                        <div className="mb-1 ml-8 flex flex-wrap items-center gap-1.5">
                          {/* 폰에서는 눌러서 바로 건다 */}
                          <a
                            href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                          >
                            <Phone size={11} /> {phone}
                          </a>
                          {/* PC 에서는 안 걸린다 — 번호를 폰에 옮겨 적는 일이 제일 잦다 */}
                          <button
                            onClick={() => void copy(phone)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            {copied === phone ? '복사했습니다' : '복사'}
                          </button>
                          {m.phones.slice(1).map(p => (
                            <span key={p} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
