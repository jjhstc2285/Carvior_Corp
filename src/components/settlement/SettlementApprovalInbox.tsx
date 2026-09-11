import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Stamp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { useAuth } from '../../authStore';
import { useStore } from '../../store';
import { ContractPhotoThumb } from './ContractPhotos';
import {
  SETTLEMENT_STAGE_CLASS,
  SETTLEMENT_STAGE_LABEL,
  brokerageProfit,
  type BrokerageSettlement,
  type PurchaseSettlement,
  type SettlementStage,
} from '../../types';

/**
 * 정산 승인함 — 매입·알선 두 가지를 한 자리에서.
 *
 * 정산 화면은 달로 걸러 보는 곳이라 지난 달에 올라온 건이 눈에 안 띈다. 결재를 기다리는
 * 건은 대시보드에서 바로 보여야 한다 — 찾으러 들어가야 하는 결재는 밀린다.
 *
 * 담당자에 따라 본부장을 건너뛰는 건이 있어, 내 차례인 것만 승인 버튼이 뜬다.
 */

/** 서버(settlements/approvers.ts)와 같은 이름 — 고칠 땐 양쪽을 같이 본다. */
const CHIEF_APPROVER = '안원용';
const CEO_APPROVER = '유진욱';

/** 매입·알선을 한 줄로 놓고 보기 위한 최소 모양 */
interface Pending {
  kind: '매입' | '알선';
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  employeeId: string;
  amount: number;
  contractPhotos?: string;
  submittedAt?: string | null;
  stage?: SettlementStage;
  chiefRequired?: boolean;
}

export default function SettlementApprovalInbox() {
  const { user } = useAuth();
  const { state } = useStore();
  const [rows, setRows] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // 한쪽이 실패해도 다른 쪽은 보여준다 — 승인함이 통째로 사라지면 결재가 밀린다.
    const [purchase, brokerage] = await Promise.all([
      api<PurchaseSettlement[]>('/settlements/purchase/pending').catch(() => []),
      api<BrokerageSettlement[]>('/settlements/brokerage/pending').catch(() => []),
    ]);
    const merged: Pending[] = [
      ...purchase.map(s => ({
        kind: '매입' as const,
        id: s.id,
        vehicleNumber: s.vehicleNumber,
        vehicleName: s.vehicleName,
        employeeId: s.employeeId,
        // 매입은 최종 합계가 결재의 기준이 되는 금액이다.
        amount: s.grandTotalWon ?? 0,
        contractPhotos: s.contractPhotos,
        submittedAt: s.submittedAt,
        stage: s.stage,
        chiefRequired: s.chiefRequired,
      })),
      ...brokerage.map(s => ({
        kind: '알선' as const,
        id: s.id,
        vehicleNumber: s.vehicleNumber,
        vehicleName: s.vehicleName,
        employeeId: s.employeeId,
        // 알선은 수익금이 결재의 기준이다 — 정산받을금액은 그 안에서 나온다.
        amount: brokerageProfit(s),
        contractPhotos: s.contractPhotos,
        submittedAt: s.submittedAt,
        stage: s.stage,
        chiefRequired: s.chiefRequired,
      })),
    ].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
    setRows(merged);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const role = user?.name === CHIEF_APPROVER ? 'CHIEF' : user?.name === CEO_APPROVER ? 'CEO' : null;

  /** 지금 이 사람이 찍을 차례인가 */
  const myTurn = (s: Pending) => {
    if (role === 'CHIEF') return s.stage === 'SUBMITTED' && s.chiefRequired !== false;
    if (role === 'CEO') return s.stage === 'CHIEF' || (s.stage === 'SUBMITTED' && s.chiefRequired === false);
    return false;
  };

  const approve = async (s: Pending) => {
    setBusyId(s.id);
    try {
      const path = s.kind === '매입' ? 'purchase' : 'brokerage';
      await api(`/settlements/${path}/${s.id}/approve`, { method: 'POST' });
      await load();
    } catch (e) {
      void alertError('승인하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) return null;

  const mine = rows.filter(myTurn).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        <Stamp size={15} className="text-indigo-700" />
        <h2 className="text-sm font-bold text-slate-800">정산 결재 {rows.length}건</h2>
        {mine > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
            내 차례 {mine}건
          </span>
        )}
      </div>

      <ul className="divide-y divide-slate-50">
        {rows.map(s => (
          <li key={`${s.kind}-${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                s.kind === '매입' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'
              }`}
            >
              {s.kind}
            </span>
            <span className="font-mono text-sm font-semibold text-slate-800">{s.vehicleNumber}</span>
            <span className="text-sm text-slate-600">{s.vehicleName}</span>

            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${SETTLEMENT_STAGE_CLASS[s.stage ?? 'DRAFT']}`}
            >
              {/* 본부장을 안 거치는 건은 올라온 순간이 곧 대표 차례다 */}
              {s.stage === 'SUBMITTED' && s.chiefRequired === false
                ? '대표 승인 대기'
                : SETTLEMENT_STAGE_LABEL[s.stage ?? 'DRAFT']}
            </span>

            <span className="text-xs text-slate-500">
              {state.employees.find(e => e.id === s.employeeId)?.name}
            </span>
            {s.submittedAt && (
              <span className="text-xs text-slate-400">{dayjs(s.submittedAt).format('M/D HH:mm')} 올림</span>
            )}

            {/* 계약서 사진 — 눌러서 크게 본다. 없으면 없다고 적어 준다 */}
            {s.contractPhotos ? (
              <ContractPhotoThumb value={s.contractPhotos} />
            ) : (
              <span className="text-[11px] text-amber-700">계약서 사진 없음</span>
            )}

            <span className="ml-auto text-sm font-semibold text-slate-700">
              {s.amount.toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-slate-400">원</span>
            </span>

            {myTurn(s) && (
              <button
                disabled={busyId === s.id}
                onClick={() => void approve(s)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={12} /> 승인
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
