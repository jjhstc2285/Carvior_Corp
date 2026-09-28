import dayjs from 'dayjs';
import { Paperclip, Pencil, X } from 'lucide-react';
import { useStore } from '../../store';
import {
  CONSULTATION_KIND_LABEL,
  CONSULTATION_STATUS_LABEL,
  PAY_METHOD_LABEL,
  type ConsultationRecord,
} from '../../types';
import { effectiveKind } from '../../lib/consultationStats';

/**
 * 상담 상세.
 *
 * 달력에서 차를 누르면 뜬다. 달력 칸에는 차명 한 줄밖에 안 들어가서, 누가 언제 무슨
 * 얘기를 했는지 보려면 목록으로 되돌아가 찾아야 했다.
 *
 * 읽기 전용이다. 고칠 일이면 [수정]으로 넘어간다 — 보려고 연 창에서 값이 바뀌면
 * 무엇을 눌러 바뀐 건지 알 수 없다.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5">
      <span className="w-20 shrink-0 text-xs font-semibold text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-700">{children}</span>
    </div>
  );
}

export default function ConsultationDetailModal({
  consultation: c,
  onEdit,
  onClose,
}: {
  consultation: ConsultationRecord;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const owner = state.employees.find(e => e.id === c.employeeId);
  // 내용에 '수출'이라 적혀 수출로 넘어간 건이 있다 — 목록에서 가르는 것과 같은 기준으로 보여준다
  const kind = effectiveKind(c);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  kind === 'EXPORT' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {CONSULTATION_KIND_LABEL[kind]}
              </span>
              <h3 className="truncate text-base font-bold text-slate-800">
                {c.vehicleName || c.vehicleNumber || '차량 미상'}
              </h3>
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{c.vehicleNumber}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 divide-y divide-slate-50">
          <Row label="상태">{CONSULTATION_STATUS_LABEL[c.status]}</Row>
          <Row label="상담일시">
            {dayjs(c.date).format('YYYY년 M월 D일 (ddd)')}
            {c.time && c.time !== '00:00' && <span className="ml-1 text-slate-500">{c.time}</span>}
          </Row>
          <Row label="담당자">{owner?.name ?? '—'}</Row>
          <Row label="손님번호">{c.customerPhone || c.customerName || '—'}</Row>
          <Row label="유입 경로">{c.platform || '—'}</Row>
          <Row label="방문 일정">
            {c.visitDate ? (
              <span className="font-semibold text-indigo-700">
                {dayjs(c.visitDate).format('M월 D일 (ddd)')}
                {c.visitTime && <span className="ml-1 font-normal text-slate-600">{c.visitTime}</span>}
              </span>
            ) : (
              <span className="text-slate-400">없음</span>
            )}
          </Row>
          <Row label="다음 연락">
            {c.nextContactDate ? dayjs(c.nextContactDate).format('M월 D일 (ddd)') : <span className="text-slate-400">없음</span>}
          </Row>
          {c.depositAmount > 0 && <Row label="입금액">{c.depositAmount.toLocaleString()}만원</Row>}
          <Row label="결제">
            {c.payMethod === 'INSTALLMENT' ? (
              <span>
                <span className="font-semibold text-indigo-700">할부</span>
                {c.installmentCapital && <span className="ml-1.5">{c.installmentCapital}</span>}
                {(c.installmentAmount ?? 0) > 0 && (
                  <span className="ml-1.5 text-slate-500">{(c.installmentAmount ?? 0).toLocaleString()}원</span>
                )}
              </span>
            ) : (
              <span className={c.payMethod === 'CASH' ? '' : 'text-slate-400'}>
                {PAY_METHOD_LABEL[c.payMethod ?? 'UNKNOWN']}
              </span>
            )}
          </Row>
          <Row label="내용">
            {/* 카톡에서 옮겨 적은 글이라 줄바꿈이 뜻을 가진다 — 그대로 둔다 */}
            {c.content ? (
              <span className="block whitespace-pre-wrap break-words">{c.content}</span>
            ) : (
              <span className="text-slate-400">없음</span>
            )}
          </Row>
          {c.files.length > 0 && (
            <Row label="첨부">
              <ul className="space-y-0.5">
                {c.files.map(f => (
                  <li key={f.id}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <Paperclip size={12} /> {f.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Pencil size={14} /> 수정
          </button>
        </div>
      </div>
    </div>
  );
}
