import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { INCIDENT_REPORT_PLEDGE, type ApprovalDocument } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

interface Props {
  /** 고칠 문서. 없으면 새로 쓴다 */
  editing: ApprovalDocument | null;
  /** 로그인한 사람 — 부서·직위·성명을 미리 채운다 */
  me: { name: string; position: string; department: string | null };
  onSaved: () => void;
  onClose: () => void;
}

/**
 * 시말서.
 *
 * 가운데 서약 문구는 회사 양식에 박혀 있는 말이라 고치지 못하게 둔다 — 사람마다 다르게
 * 적으면 그건 다른 문서가 된다. 적는 건 '내용'뿐이다.
 *
 * 부서·직위·성명은 로그인한 사람 것으로 채워두되 고칠 수 있다. 문서에 적힌 값이
 * 그대로 저장되므로, 나중에 부서가 바뀌어도 옛 문서는 그때 소속으로 남는다.
 */
export default function IncidentReportForm({ editing, me, onSaved, onClose }: Props) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [department, setDepartment] = useState(editing?.department ?? me.department ?? '');
  const [position, setPosition] = useState(editing?.position ?? me.position);
  const [name, setName] = useState(editing?.name ?? me.name);
  const [content, setContent] = useState(editing?.content ?? '');
  /* 종이 양식의 네 꼭지와 발생 일시·장소 — 적은 그대로 뽑혀 나간다 */
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? '');
  const [occurredTime, setOccurredTime] = useState(editing?.occurredTime ?? '');
  const [occurredPlace, setOccurredPlace] = useState(editing?.occurredPlace ?? '');
  const [cause, setCause] = useState(editing?.cause ?? '');
  const [action, setAction] = useState(editing?.action ?? '');
  const [prevention, setPrevention] = useState(editing?.prevention ?? '');
  const [writtenOn, setWrittenOn] = useState(editing?.writtenOn ?? dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !content.trim()) {
      setError('성명과 내용은 반드시 적어야 합니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        kind: 'INCIDENT_REPORT' as const,
        department: department.trim(),
        position: position.trim(),
        name: name.trim(),
        content: content.trim(),
        writtenOn,
        occurredOn: occurredOn || null,
        occurredTime: occurredTime.trim(),
        occurredPlace: occurredPlace.trim(),
        cause: cause.trim(),
        action: action.trim(),
        prevention: prevention.trim(),
      };
      if (editing) await api(`/approvals/${editing.id}`, { method: 'PATCH', body });
      else await api('/approvals', { method: 'POST', body });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '올리지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode, extra = '') => (
    <div className={extra}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
    </div>
  );

  /** 네 꼭지 — 양식에 적힌 안내문을 그대로 placeholder 로 둔다 */
  const section = (
    label: string,
    hint: string,
    value: string,
    set: (v: string) => void,
    rows: number,
  ) => (
    <div>
      <label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={e => set(e.target.value)}
        rows={rows}
        placeholder={hint}
        className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400"
      />
    </div>
  );

  const INPUT = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">시말서 {editing ? '수정' : '작성'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {field('부서', <input value={department} onChange={e => setDepartment(e.target.value)} className={INPUT} />)}
          {field('직위', <input value={position} onChange={e => setPosition(e.target.value)} className={INPUT} />)}
          {field('성명 *', <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />)}
        </div>

        {/* 회사 양식에 박혀 있는 서약 문구 — 고치지 못하게 둔다 */}
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
          {INCIDENT_REPORT_PLEDGE}
        </p>

        {/* 발생 일시·장소 — 양식 윗표에 들어가는 값이다 */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('발생 일자', <input type="date" value={occurredOn ?? ''} onChange={e => setOccurredOn(e.target.value)} className={INPUT} />)}
          {/* 시각은 글자로 받는다 — "오후 3시쯤"처럼 적어 오는 일이 많다 */}
          {field('발생 시각', <input value={occurredTime} onChange={e => setOccurredTime(e.target.value)} placeholder="오후 3시쯤" className={INPUT} />)}
          {field('발생 장소', <input value={occurredPlace} onChange={e => setOccurredPlace(e.target.value)} placeholder="1층 사무실" className={`${INPUT} sm:col-span-2`} />, 'col-span-2')}
        </div>

        {/* 종이 양식의 네 꼭지 — 적는 차례와 묻는 말을 그대로 옮겼다 */}
        <div className="mt-4 space-y-3">
          {section('1. 사건 및 경위 *', '발생한 상황과 사실관계를 구체적으로 작성해 주십시오.', content, setContent, 6)}
          {section('2. 발생 원인 및 사유', '원인 및 관련 사유를 작성해 주십시오.', cause, setCause, 4)}
          {section('3. 조치 사항', '발생 이후 취한 조치와 처리 결과를 작성해 주십시오.', action, setAction, 4)}
          {section('4. 재발 방지 대책', '향후 개선 및 예방 계획을 작성해 주십시오.', prevention, setPrevention, 4)}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {field(
            '작성일자',
            <input type="date" value={writtenOn} onChange={e => setWrittenOn(e.target.value)} className={INPUT} />,
          )}
          {field('작성자', <input value={name} readOnly className={`${INPUT} bg-slate-50 text-slate-500`} />)}
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <p className="mt-3 text-[11px] text-slate-400">
          올리면 관리자에게 결재 알림이 갑니다. <b>결재 전까지는 고치거나 지울 수 있습니다.</b>
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '올리는 중…' : editing ? '수정' : '결재 올리기'}
          </button>
        </div>
      </div>
    </div>
  );
}
