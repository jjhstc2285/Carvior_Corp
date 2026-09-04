import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { useStore } from '../../store';
import {
  APPROVAL_KIND_LABEL,
  INCIDENT_REPORT_PLEDGE,
  REQUEST_STATUS_LABEL,
  type ApprovalDocument,
  type Role,
} from '../../types';
import IncidentReportForm from './IncidentReportForm';

const STATUS_STYLE: Record<ApprovalDocument['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
};

/**
 * 결재 관리.
 *
 * 쓰는 건 전 직원이, 결재는 관리자가 한다.
 * 직원은 자기가 쓴 문서만 보인다 — 시말서는 본인 잘못을 적는 문서라 옆자리 사람 것까지
 * 보이면 아무도 솔직하게 못 쓴다. 그건 서버가 가른다.
 */
export default function ApprovalModule({ role }: { role: Role }) {
  const { state } = useStore();
  const [docs, setDocs] = useState<ApprovalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalDocument | null>(null);
  const [opened, setOpened] = useState<ApprovalDocument | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const isAdmin = role === 'ADMIN';
  const me = state.employees.find(e => e.id === state.currentEmployeeId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await api<ApprovalDocument[]>('/approvals'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '결재 문서를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (doc: ApprovalDocument, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectNote.trim()) {
      void alertError('반려 사유를 적어 주세요', '왜 반려하는지 모르면 다시 쓸 수가 없습니다.');
      return;
    }
    try {
      await api(`/approvals/${doc.id}/review`, {
        method: 'POST',
        body: { action, ...(action === 'reject' ? { note: rejectNote.trim() } : {}) },
      });
      setRejectNote('');
      setOpened(null);
      await load();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const remove = async (doc: ApprovalDocument) => {
    if (!(await confirmDanger('이 문서를 지울까요?', '되돌릴 수 없습니다.'))) return;
    try {
      await api(`/approvals/${doc.id}`, { method: 'DELETE' });
      setOpened(null);
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const pending = docs.filter(d => d.status === 'PENDING');

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">결재 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? '올라온 문서를 결재합니다. 반려할 때는 사유를 적어 주세요.'
              : '시말서를 작성해 올리면 관리자가 결재합니다. 본인이 쓴 문서만 보입니다.'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 시말서 작성
        </button>
      </div>

      {isAdmin && pending.length > 0 && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm font-semibold text-amber-900">
          결재 대기 {pending.length}건
        </p>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="space-y-2">
        {loading && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}
        {!loading && docs.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
            올린 문서가 없습니다.
          </p>
        )}
        {docs.map(d => (
          <button
            key={d.id}
            onClick={() => {
              setOpened(d);
              setRejectNote('');
            }}
            className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50/60"
          >
            <FileText size={15} className="shrink-0 text-slate-400" />
            <span className="text-sm font-bold text-slate-800">{APPROVAL_KIND_LABEL[d.kind]}</span>
            <span className="text-sm text-slate-600">
              {d.name}
              {d.position && <span className="ml-1 text-slate-400">{d.position}</span>}
            </span>
            <span className="text-xs text-slate-400">{d.writtenOn}</span>
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[d.status]}`}>
              {REQUEST_STATUS_LABEL[d.status]}
            </span>
            <span className="w-full truncate text-xs text-slate-400">{d.content}</span>
          </button>
        ))}
      </div>

      {formOpen && me && (
        <IncidentReportForm
          editing={editing}
          me={{ name: me.name, position: me.position, department: me.department }}
          onSaved={() => void load()}
          onClose={() => setFormOpen(false)}
        />
      )}

      {/* 문서 보기 — 인쇄하면 이 종이만 나온다 */}
      {opened && (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:p-10 print:static print:bg-white print:p-0" onClick={() => setOpened(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl print:max-w-none print:shadow-none" onClick={e => e.stopPropagation()}>
            <h2 className="text-center text-2xl font-bold tracking-[0.3em] text-slate-900">
              {APPROVAL_KIND_LABEL[opened.kind]}
            </h2>

            <table className="mt-6 w-full border-collapse text-sm">
              <tbody>
                {[
                  ['부서', opened.department || '-'],
                  ['직위', opened.position || '-'],
                  ['성명', opened.name],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <th className="w-24 border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">
                      {label}
                    </th>
                    <td className="border border-slate-300 px-3 py-2 text-slate-800">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-6 text-[13px] leading-relaxed text-slate-700">{INCIDENT_REPORT_PLEDGE}</p>

            <div className="mt-5">
              <p className="mb-1 text-xs font-semibold text-slate-500">내용</p>
              <p className="min-h-40 rounded-lg border border-slate-300 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                {opened.content}
              </p>
            </div>

            <div className="mt-6 text-right text-sm text-slate-700">
              <p>작성일자 : {opened.writtenOn}</p>
              <p className="mt-1">작성자 : {opened.name} (인)</p>
            </div>

            {opened.status !== 'PENDING' && (
              <p className="mt-4 text-right text-xs text-slate-400">
                {REQUEST_STATUS_LABEL[opened.status]} · {opened.reviewer?.name}
                {opened.reviewedAt && ` · ${dayjs(opened.reviewedAt).format('YYYY-MM-DD')}`}
                {opened.reviewNote && ` · ${opened.reviewNote}`}
              </p>
            )}

            {/* 인쇄물에는 버튼이 안 나온다 */}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Printer size={15} /> 인쇄
              </button>

              {opened.status === 'PENDING' && opened.employeeId === state.currentEmployeeId && (
                <>
                  <button
                    onClick={() => {
                      setEditing(opened);
                      setOpened(null);
                      setFormOpen(true);
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => void remove(opened)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} /> 삭제
                  </button>
                </>
              )}

              {isAdmin && opened.status === 'PENDING' && (
                <>
                  <input
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="반려 사유"
                    className="w-44 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => void review(opened, 'reject')}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    반려
                  </button>
                  <button
                    onClick={() => void review(opened, 'approve')}
                    className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    승인
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
