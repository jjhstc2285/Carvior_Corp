import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { digitsOnly, withCommas } from '../../lib/money';
import {
  APPROVAL_KIND_LABEL,
  INCIDENT_REPORT_PLEDGE,
  LEAVE_KINDS,
  type ApprovalDocument,
  type ApprovalKind,
} from '../../types';

interface Props {
  kind: ApprovalKind;
  /** 고칠 문서. 없으면 새로 쓴다 */
  editing: ApprovalDocument | null;
  /** 로그인한 사람 — 부서·직위·성명을 미리 채운다 */
  me: { name: string; position: string; department: string | null };
  onSaved: () => void;
  onClose: () => void;
}

const INPUT = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

const CONTENT_HINT: Record<ApprovalKind, string> = {
  INCIDENT_REPORT: '언제, 무슨 일이 있었고, 앞으로 어떻게 하겠다는지 적어 주세요.',
  LEAVE: '휴가 사유를 적어 주세요.',
  EXPENSE: '무엇에 쓴 돈인지 적어 주세요.',
};

/**
 * 결재 문서 작성.
 *
 * 양식마다 묻는 게 다르다 — 시말서는 경위, 휴가원은 기간, 지출결의서는 금액과 지출처.
 * 공통인 부서·직위·성명·내용·작성일자는 한 번만 쓰고 다른 칸만 종류별로 갈랐다.
 *
 * 부서·직위·성명은 로그인한 사람 것으로 채워두되 고칠 수 있다. 적힌 값이 그대로 저장되므로
 * 나중에 부서가 바뀌어도 옛 문서는 그때 소속으로 남는다.
 */
export default function ApprovalForm({ kind, editing, me, onSaved, onClose }: Props) {
  const [department, setDepartment] = useState(editing?.department ?? me.department ?? '');
  const [position, setPosition] = useState(editing?.position ?? me.position);
  const [name, setName] = useState(editing?.name ?? me.name);
  const [content, setContent] = useState(editing?.content ?? '');
  const [writtenOn, setWrittenOn] = useState(editing?.writtenOn ?? dayjs().format('YYYY-MM-DD'));

  // 휴가원
  const [leaveKind, setLeaveKind] = useState(editing?.leaveKind || LEAVE_KINDS[0]);
  const [startOn, setStartOn] = useState(editing?.startOn ?? '');
  const [endOn, setEndOn] = useState(editing?.endOn ?? '');
  const [days, setDays] = useState(editing?.days != null ? String(editing.days) : '');

  // 지출결의서
  const [spentOn, setSpentOn] = useState(editing?.spentOn ?? dayjs().format('YYYY-MM-DD'));
  const [amount, setAmount] = useState(withCommas(editing?.amount ?? 0));
  const [payee, setPayee] = useState(editing?.payee ?? '');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !content.trim()) {
      setError('성명과 내용은 반드시 적어야 합니다.');
      return;
    }
    if (kind === 'LEAVE' && (!startOn || !endOn)) {
      setError('휴가 기간을 적어 주세요.');
      return;
    }
    if (kind === 'LEAVE' && endOn < startOn) {
      setError('종료일이 시작일보다 빠릅니다.');
      return;
    }
    if (kind === 'EXPENSE' && Number(digitsOnly(amount)) <= 0) {
      setError('금액을 적어 주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        kind,
        department: department.trim(),
        position: position.trim(),
        name: name.trim(),
        content: content.trim(),
        writtenOn,
        ...(kind === 'LEAVE'
          ? { leaveKind, startOn, endOn, days: Number(days) || 0 }
          : { leaveKind: '', startOn: null, endOn: null, days: 0 }),
        ...(kind === 'EXPENSE'
          ? { spentOn, amount: Number(digitsOnly(amount)) || 0, payee: payee.trim() }
          : { spentOn: null, amount: 0, payee: '' }),
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

  const field = (label: string, node: React.ReactNode, span = '') => (
    <div className={span}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">
            {APPROVAL_KIND_LABEL[kind]} {editing ? '수정' : '작성'}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {field('부서', <input value={department} onChange={e => setDepartment(e.target.value)} className={INPUT} />)}
          {field('직위', <input value={position} onChange={e => setPosition(e.target.value)} className={INPUT} />)}
          {field('성명 *', <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />)}
        </div>

        {/* 시말서 — 회사 양식에 박혀 있는 서약 문구라 고치지 못하게 둔다 */}
        {kind === 'INCIDENT_REPORT' && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
            {INCIDENT_REPORT_PLEDGE}
          </p>
        )}

        {kind === 'LEAVE' && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {field(
              '휴가 종류',
              <select value={leaveKind} onChange={e => setLeaveKind(e.target.value)} className={INPUT}>
                {LEAVE_KINDS.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>,
            )}
            {field('시작일 *', <input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} className={INPUT} />)}
            {field('종료일 *', <input type="date" value={endOn} onChange={e => setEndOn(e.target.value)} className={INPUT} />)}
            {/* 반차가 있어 0.5 단위로 받는다 */}
            {field(
              '일수',
              <input
                value={days}
                onChange={e => setDays(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="1"
                className={`${INPUT} text-right`}
              />,
            )}
          </div>
        )}

        {kind === 'EXPENSE' && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {field('지출일', <input type="date" value={spentOn} onChange={e => setSpentOn(e.target.value)} className={INPUT} />)}
            {field('지출처', <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="상호" className={INPUT} />)}
            {field(
              '금액(원) *',
              <input
                value={amount}
                onChange={e => setAmount(withCommas(e.target.value))}
                inputMode="numeric"
                placeholder="150,000"
                className={`${INPUT} text-right`}
              />,
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            {kind === 'INCIDENT_REPORT' ? '내용 *' : kind === 'LEAVE' ? '사유 *' : '적요 *'}
          </label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={kind === 'INCIDENT_REPORT' ? 8 : 4}
            placeholder={CONTENT_HINT[kind]}
            className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {field('작성일자', <input type="date" value={writtenOn} onChange={e => setWrittenOn(e.target.value)} className={INPUT} />)}
          {field('작성자', <input value={name} readOnly className={`${INPUT} bg-slate-50 text-slate-500`} />)}
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <p className="mt-3 text-[11px] text-slate-400">
          올리면 관리자에게 결재 알림이 갑니다. <b>결재 전까지는 고치거나 지울 수 있습니다.</b>
          {kind === 'LEAVE' && ' 휴가원은 결재 문서라 근태의 연차 차감과는 따로입니다 — 연차는 근태 신청에서 냅니다.'}
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
