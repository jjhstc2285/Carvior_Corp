import { useMemo, useState } from 'react';
import { OrganizationChart } from 'primereact/organizationchart';
import type { TreeNode } from 'primereact/treenode';
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
 * 선과 접기는 PrimeReact 의 OrganizationChart 가 그린다. 10.x 는 MIT 라 공짜다 —
 * 11 부터는 상용 허가가 붙고 직원 열 명이 넘으면 공짜 조건에서 벗어나므로 10 에 묶어 둔다.
 * 칸 안은 nodeTemplate 으로 직접 그려서 이 앱 생김새를 따른다.
 *
 * 자리는 대표 — 본부장 — 각 팀으로 매단다. 사무장은 본부장 옆이다 — 팀을 맡는 자리가
 * 아니다. 본부장이 비면 팀을 대표 밑으로 올린다. 맡는 사람이 없다고 팀이 조직도에서
 * 사라지면 안 된다.
 */

/** 윗자리부터. 목록에 없는 직책은 뒤로 보낸다 */
const RANK = ['대표', '본부장', '사무장', '팀장', '임시팀장', '차장', '과장', '매니저', '사원'];

const rankOf = (position: string): number => {
  const i = RANK.findIndex(r => position.includes(r));
  return i === -1 ? RANK.length : i;
};

/** 팀 빛깔 — 팀마다 달라야 한 화면에서 갈래가 보인다 */
const TEAM_TONE: Record<string, string> = {
  광고팀: 'border-violet-200 bg-violet-50 text-violet-700',
  계약팀: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  매입팀: 'border-amber-200 bg-amber-50 text-amber-700',
  차량관리팀: 'border-sky-200 bg-sky-50 text-sky-700',
  알선팀: 'border-rose-200 bg-rose-50 text-rose-700',
  기타: 'border-slate-200 bg-slate-100 text-slate-600',
};

/*
  팀이 안 적힌 사람.

  대표·본부장·사무장은 팀에 속하지 않는다 — 팀을 비워 두는 게 맞다. 그래도 조직도에서
  빠지면 안 되니 위에 따로 세운다. 그 밖에 팀이 비어 있는 사람은 '기타'로 모은다 —
  안 보이게 두면 누가 빠졌는지 아무도 모른다.
*/
const TOP_POSITIONS = ['대표', '본부장', '사무장'];

/** 칸 하나가 들고 있는 값 — 사람 칸이면 employee, 팀 칸이면 team */
interface NodeData {
  employee?: Employee;
  team?: string;
  count?: number;
}

export default function OrgChart() {
  const { state } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const nodes: TreeNode[] = useMemo(() => {
    const live = state.employees.filter(e => e.active !== false);
    const sort = (list: Employee[]) =>
      [...list].sort((a, b) => rankOf(a.position) - rankOf(b.position) || a.name.localeCompare(b.name));

    const top = sort(live.filter(e => TOP_POSITIONS.some(p => e.position.includes(p))));
    const topIds = new Set(top.map(e => e.id));
    const rest = live.filter(e => !topIds.has(e.id));

    const person = (e: Employee): TreeNode => ({ key: e.id, data: { employee: e } as NodeData, children: [] });

    const teams: TreeNode[] = [];
    for (const team of [...DEPARTMENTS, '기타']) {
      const members =
        team === '기타'
          ? rest.filter(e => !e.department || !DEPARTMENTS.includes(e.department as (typeof DEPARTMENTS)[number]))
          : rest.filter(e => e.department === team);
      if (members.length === 0) continue;
      teams.push({
        key: `team-${team}`,
        data: { team, count: members.length } as NodeData,
        // 접고 펼 수 있게 둔다 — 사람이 스물이면 다 펴 둘 때 가로로 한참 넘친다
        expanded: true,
        children: sort(members).map(person),
      });
    }

    /*
      대표 — 본부장 — 각 팀.

      한때 임원과 팀을 대표 밑에 나란히 뒀다. 어느 팀이 누구 밑인지 적어 둔 데가 없어서
      모르는 줄을 안 그은 것인데, 팀은 본부장이 맡는 게 맞다고 정해졌다.

      사무장은 본부장 옆에 둔다 — 팀을 맡는 자리가 아니다.

      본부장이 없으면(아직 안 적었거나 자리가 비면) 팀을 대표 밑으로 올린다. 맡는 사람이
      없다고 팀이 조직도에서 사라지면 안 된다.
    */
    const ceo = top.find(e => e.position.includes('대표'));
    const head = top.find(e => e.position.includes('본부장'));
    const others = top.filter(e => e !== ceo && e !== head);

    const under: TreeNode[] = head
      ? [{ key: head.id, data: { employee: head } as NodeData, expanded: true, children: teams }, ...others.map(person)]
      : [...others.map(person), ...teams];

    // 대표가 꼭대기다. 아직 안 적었으면 회사 이름을 꼭대기에 세운다
    if (ceo) return [{ key: ceo.id, data: { employee: ceo } as NodeData, expanded: true, children: under }];
    return [{ key: 'root', data: { team: '애니원모터스' } as NodeData, expanded: true, children: under }];
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

  /*
    칸 안을 직접 그린다.

    기본 칸은 글자 한 줄이라 이름밖에 못 넣는다. 조직도를 보는 까닭이 번호를 찾는 것이라,
    이름·직책·번호가 한 칸에 있어야 한다.
  */
  const nodeTemplate = (node: TreeNode) => {
    const data = (node.data ?? {}) as NodeData;

    if (data.team) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-bold ${
            TEAM_TONE[data.team] ?? TEAM_TONE.기타
          }`}
        >
          {data.team}
          {data.count !== undefined && <span className="font-medium opacity-60">{data.count}</span>}
        </span>
      );
    }

    const m = data.employee;
    if (!m) return null;
    const phone = m.phones?.[0] ?? '';
    const open = picked === m.id;

    return (
      <span className="inline-block text-left">
        <button
          onClick={() => setPicked(v => (v === m.id ? null : m.id))}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border bg-white px-3 py-2 transition hover:border-indigo-300 hover:bg-indigo-50/40 ${
            open ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'
          }`}
        >
          <EmployeeAvatar name={m.name} size={26} />
          <span>
            <span className="block text-sm font-bold text-slate-800">{m.name}</span>
            <span className="block text-[11px] font-normal text-slate-400">{m.position || '직책 없음'}</span>
          </span>
          {/* 번호가 없으면 눌러도 나올 게 없다 — 미리 알려 준다 */}
          {phone ? (
            <Phone size={12} className="ml-1 text-slate-300" />
          ) : (
            <span className="ml-1 text-[10px] font-normal text-slate-300">번호 없음</span>
          )}
        </button>

        {open && phone && (
          <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
            {/* 폰에서는 눌러서 바로 건다 */}
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Phone size={11} /> {phone}
            </a>
            {/* PC 에서는 안 걸린다 — 번호를 폰에 옮겨 적는 일이 제일 잦다 */}
            <button
              onClick={() => void copy(phone)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              {copied === phone ? '복사함' : '복사'}
            </button>
            {m.phones.slice(1).map(p => (
              <span key={p} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">
                {p}
              </span>
            ))}
          </span>
        )}
      </span>
    );
  };

  if (nodes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-indigo-600" />
        <p className="text-base font-bold text-slate-800">조직도</p>
        <span className="ml-auto text-xs text-slate-400">이름을 누르면 번호가 나옵니다 · 팀 아래 화살표로 접습니다</span>
      </div>

      {/* 사람이 늘면 가로로 넘친다 — 페이지가 아니라 이 칸 안에서 구르게 한다 */}
      <div className="org-chart overflow-x-auto pb-2">
        <OrganizationChart value={nodes} nodeTemplate={nodeTemplate} selectionMode="single" />
      </div>
    </div>
  );
}
