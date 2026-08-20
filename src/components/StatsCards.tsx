import type { AttendanceStatus } from '../types';

interface Props {
  counts: Record<AttendanceStatus, number>;
  total: number;
}

const CARDS: { key: AttendanceStatus; label: string; accent: string }[] = [
  { key: 'late', label: '지각', accent: 'text-amber-600' },
  { key: 'earlyLeave', label: '조퇴', accent: 'text-orange-600' },
  { key: 'missing', label: '누락', accent: 'text-slate-500' },
  { key: 'lateAndEarly', label: '지각+조퇴', accent: 'text-red-600' },
  { key: 'annualLeave', label: '연차', accent: 'text-violet-600' },
  { key: 'fieldWork', label: '외근/출장', accent: 'text-sky-600' },
];

export default function StatsCards({ counts, total }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <p className="text-xs font-medium text-slate-400">전체 근무일 기록</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{total}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
      </div>
      {CARDS.map(c => (
        <div key={c.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-xs font-medium text-slate-400">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold ${c.accent}`}>{counts[c.key]}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
        </div>
      ))}
    </div>
  );
}
