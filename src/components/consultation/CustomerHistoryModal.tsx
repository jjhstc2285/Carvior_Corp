import dayjs from 'dayjs';
import { Paperclip, X } from 'lucide-react';
import { useStore } from '../../store';
import { CONSULTATION_STATUS_LABEL } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

interface Props {
  customerName: string;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  CONTRACTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ON_HOLD: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CLOSED: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

export default function CustomerHistoryModal({ customerName, onClose }: Props) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const { state } = useStore();
  const history = state.consultations
    .filter(c => (c.customerPhone || c.customerName) === customerName)
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  const employeeOf = (id: string) => state.employees.find(e => e.id === id);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{customerName} 상담 이력</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">총 {history.length}건 (최신순)</p>

        <ol className="mt-4 space-y-4 border-l border-slate-100 pl-4">
          {history.map(c => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">{dayjs(c.date).format('YYYY.M.D')} {c.time}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_COLOR[c.status]}`}>
                  {CONSULTATION_STATUS_LABEL[c.status]}
                </span>
                <span className="text-xs text-slate-400">담당 {employeeOf(c.employeeId)?.name}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{c.content}</p>
              {c.files.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <Paperclip size={11} /> {c.files.map(f => f.fileName).join(', ')}
                </div>
              )}
              {c.nextContactDate && (
                <p className="mt-1 text-xs text-indigo-500">다음 연락 예정: {dayjs(c.nextContactDate).format('M월 D일')}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
