import { useState } from 'react';
import dayjs from 'dayjs';
import { Paperclip, Pencil, X } from 'lucide-react';
import { useStore } from '../../store';
import { ETC_DEALER } from './VisitAssignPanel';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import {
  CONSULTATION_KIND_LABEL,
  CONSULTATION_STATUS_LABEL,
  CONSULTATION_STATUSES,
  PAY_METHOD_LABEL,
  type ConsultationRecord,
  type ConsultationStatus,
} from '../../types';
import { effectiveKind } from '../../lib/consultationStats';

/** 상담을 맡는 팀 — 전환율도 이 팀만 센다(VisitReviewSection 과 같은 기준) */
const CONSULTATION_TEAM = '알선팀';

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
  /** 없으면 [수정]을 안 띄운다 — 고칠 자리가 아닌 화면에서도 띄워 보기 때문이다 */
  onEdit?: () => void;
  onClose: () => void;
}) {
  const { state, refresh } = useStore();
  const owner = state.employees.find(e => e.id === c.employeeId);
  const [busy, setBusy] = useState(false);

  /** 담당 딜러로 고를 수 있는 사람 — 상담과 방문을 맡는 팀이다 */
  const candidates = state.employees.filter(e => e.active !== false && e.department === CONSULTATION_TEAM);
  const dealer = state.employees.find(e => e.id === c.visitDealerId);

  /*
    담당자와 상태만은 이 창에서 바로 바꾼다.

    보려고 연 창이라 나머지는 읽기만 한다 — 금액이나 내용이 보던 중에 바뀌면 무엇을 보고
    판단한 건지 남지 않는다. 그런데 이 둘은 다르다. 손님을 누가 이어받을지, 지금 어디까지
    왔는지는 보다가 바로 정해지는 값이고, 그때마다 수정 창을 따로 열게 하면 아무도 안 고친다.
  */
  const patch = async (body: { visitDealerId?: string; status?: ConsultationStatus }) => {
    setBusy(true);
    try {
      await api(`/consultations/${c.id}`, { method: 'PATCH', body });
      await refresh();
    } catch (e) {
      void alertError('고치지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };
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
          <Row label="상태">
            <select
              value={c.status}
              disabled={busy}
              onChange={e => void patch({ status: e.target.value as ConsultationStatus })}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
            >
              {CONSULTATION_STATUSES.map(v => (
                <option key={v} value={v}>
                  {CONSULTATION_STATUS_LABEL[v]}
                </option>
              ))}
            </select>
          </Row>
          <Row label="상담일시">
            {dayjs(c.date).format('YYYY년 M월 D일 (ddd)')}
            {c.time && c.time !== '00:00' && <span className="ml-1 text-slate-500">{c.time}</span>}
          </Row>
          {/* 적은 사람은 안 바뀐다 — 그날 전화를 받은 사람이 누구였는지는 기록이다 */}
          <Row label="상담 적은 사람">{owner?.name ?? '—'}</Row>
          <Row label="담당 딜러">
            <select
              value={c.visitDealerId ?? ''}
              disabled={busy}
              onChange={e => void patch({ visitDealerId: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
            >
              {/*
                손님을 맞을 사람 — 알선팀만 고른다.

                전 직원을 늘어놓으면 사무장·대표까지 담당으로 잡히고, 그러면 전환율에
                팀이 아닌 사람이 끼어든다(그 숫자는 실적이 아니라 잡음이다).

                지금 딜러가 알선팀이 아니거나 그만둔 사람이어도 그 사람만은 남긴다 —
                목록에 없으면 고르지도 않은 사람으로 값이 튄다.
              */}
              <option value="">미지정</option>
              {dealer && dealer.id !== ETC_DEALER && !candidates.some(e => e.id === dealer.id) && (
                <option value={dealer.id}>
                  {dealer.name} {dealer.position}
                </option>
              )}
              {candidates.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.position}
                </option>
              ))}
              {/* 알선팀 밖의 사람이 맞은 건 — 미지정과 섞이면 '안 정한 건'이 부풀어 보인다 */}
              <option value={ETC_DEALER}>기타</option>
            </select>
          </Row>
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
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Pencil size={14} /> 수정
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
