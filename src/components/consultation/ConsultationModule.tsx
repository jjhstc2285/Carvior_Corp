import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarDays, List, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { CONSULTATION_STATUS_LABEL, type ConsultationRecord, type ConsultationStatus } from '../../types';
import ConsultationForm from './ConsultationForm';
import CustomerHistoryModal from './CustomerHistoryModal';
import EventCalendar, { type CalEvent } from '../calendar/EventCalendar';
import { confirmDanger } from '../../lib/alert';

interface Props {
  role: 'EMPLOYEE' | 'ADMIN';
}

const STATUS_COLOR: Record<ConsultationStatus, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  CONTRACTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ON_HOLD: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CLOSED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

export default function ConsultationModule({ role }: Props) {
  const { state, deleteConsultation } = useStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConsultationStatus | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConsultationRecord | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => dayjs().startOf('month'));

  const scoped = role === 'EMPLOYEE'
    ? state.consultations.filter(c => c.employeeId === state.currentEmployeeId)
    : state.consultations;

  const filtered = scoped
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !query.trim() || c.vehicleNumber.includes(query.trim()) || c.customerName.includes(query.trim()))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  const eventsForDate = (dateStr: string): CalEvent[] => {
    const events: CalEvent[] = [];
    filtered.forEach(c => {
      if (c.date === dateStr) {
        events.push({
          id: `consult-${c.id}`,
          label: c.customerName,
          sublabel: CONSULTATION_STATUS_LABEL[c.status],
          colorClass: STATUS_COLOR[c.status].replace(/ ring-\S+/, ''),
          dotClass: c.status === 'CONTRACTED' ? 'bg-emerald-400' : c.status === 'ON_HOLD' ? 'bg-amber-400' : c.status === 'CLOSED' ? 'bg-gray-400' : 'bg-blue-400',
        });
      }
      if (c.nextContactDate === dateStr) {
        events.push({
          id: `followup-${c.id}`,
          label: `${c.customerName} 후속연락`,
          sublabel: '후속연락 예정',
          colorClass: 'bg-amber-50 text-amber-700',
          dotClass: 'bg-amber-400',
        });
      }
    });
    return events;
  };

  const staffStats = useMemo(() => {
    if (role !== 'ADMIN') return [];
    return state.employees.map(emp => {
      const own = state.consultations.filter(c => c.employeeId === emp.id);
      const contracted = own.filter(c => c.status === 'CONTRACTED').length;
      const rate = own.length > 0 ? Math.round((contracted / own.length) * 100) : 0;
      return { emp, total: own.length, contracted, rate };
    }).filter(s => s.total > 0);
  }, [state.consultations, state.employees, role]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{role === 'EMPLOYEE' ? '내 상담 목록' : '알선 상담 관리'}</h1>
          <p className="mt-1 text-sm text-slate-500">차량번호·고객명으로 검색하고, 고객을 클릭하면 이전 상담 이력을 바로 확인할 수 있어요.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 상담 등록
        </button>
      </div>

      {role === 'ADMIN' && staffStats.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-bold text-slate-500">담당자별 상담 → 계약 전환율</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {staffStats.map(({ emp, total, contracted, rate }) => (
              <div key={emp.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500">{emp.name}</p>
                <p className="mt-1 text-lg font-bold text-slate-800">{rate}<span className="text-xs font-medium text-slate-400">%</span></p>
                <p className="text-[11px] text-slate-400">{contracted}/{total}건 계약</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="차량번호 또는 고객명 검색"
          className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ConsultationStatus | 'all')}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
          <option value="all">전체 상태</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="CONTRACTED">계약</option>
          <option value="ON_HOLD">보류</option>
          <option value="CLOSED">종결</option>
        </select>
        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <List size={14} /> 리스트
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition-colors ${view === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <CalendarDays size={14} /> 캘린더
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EventCalendar month={calMonth} onMonthChange={setCalMonth} eventsForDate={eventsForDate} />
        </div>
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2.5 font-medium">상담일시</th>
                <th className="px-5 py-2.5 font-medium">차량번호</th>
                <th className="px-5 py-2.5 font-medium">고객명</th>
                {role === 'ADMIN' && <th className="px-5 py-2.5 font-medium">담당자</th>}
                <th className="px-5 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium">상담내용</th>
                <th className="px-5 py-2.5 font-medium text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">상담 내역이 없습니다.</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-2.5 whitespace-nowrap text-slate-600">{dayjs(c.date).format('M/D')} {c.time}</td>
                  <td className="px-5 py-2.5 font-mono text-slate-600">{c.vehicleNumber}</td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => setHistoryCustomer(c.customerName)} className="font-medium text-indigo-600 hover:underline">
                      {c.customerName}
                    </button>
                  </td>
                  {role === 'ADMIN' && <td className="px-5 py-2.5 text-slate-500">{employeeOf(c.employeeId)?.name}</td>}
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLOR[c.status]}`}>
                      {CONSULTATION_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-5 py-2.5 text-slate-500">{c.content}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditing(c); setFormOpen(true); }} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">수정</button>
                      <button onClick={() => void confirmDanger('상담 내역을 삭제할까요?').then(ok => { if (ok) void deleteConsultation(c.id); })} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {formOpen && (
        <ConsultationForm editing={editing} defaultEmployeeId={state.currentEmployeeId} onClose={() => setFormOpen(false)} />
      )}
      {historyCustomer && (
        <CustomerHistoryModal customerName={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}
    </div>
  );
}
