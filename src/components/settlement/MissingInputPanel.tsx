import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../../store';
import type { PurchaseSettlement } from '../../types';

/**
 * 정산 전에 아직 안 채워진 것.
 *
 * 정산은 여러 사람 손을 거친다 — 차를 받아 제시일자를 적는 사람, 팔고 나서 판매완료를
 * 찍는 사람, 상사 정산서를 받아 금액을 옮기는 사람이 다 다르다. 한 군데가 비면 정산이
 * 멈추는데, 멈춘 줄은 표 수백 줄 어딘가에 섞여 있어 아무도 못 본다.
 *
 * 그래서 "지금 누가 뭘 안 채웠나"를 한 자리에 모은다. 칩을 누르면 그 차들이 펴지고,
 * 차량번호를 누르면 그 줄이 바로 열린다. 재촉할 때 들고 갈 목록이기도 하다.
 *
 * 다 채워진 달에는 아무것도 안 그린다 — 늘 떠 있으면 아무도 안 본다.
 */

/** 못 채운 항목 한 가지 */
interface Gap {
  key: string;
  label: string;
  /** 누가 채워야 하는가 — 재촉할 사람을 바로 알 수 있게 */
  who: string;
  rows: PurchaseSettlement[];
  tone: string;
}

export default function MissingInputPanel({
  rows,
  onOpen,
}: {
  /** 지금 화면이 보고 있는 달의 정산들 */
  rows: PurchaseSettlement[];
  /** 차량번호를 누르면 그 줄을 연다 */
  onOpen: (s: PurchaseSettlement) => void;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);

  /** 상담에서 판매완료로 찍힌 차 — 판매가가 비었는지 가릴 때 쓴다 */
  const soldPlates = useMemo(
    () => new Set(state.consultations.filter(c => c.status === 'SOLD').map(c => c.vehicleNumber)),
    [state.consultations],
  );

  const gaps: Gap[] = useMemo(() => {
    const sold = rows.filter(s => s.salePrice > 0);
    return [
      {
        key: 'offerDate',
        label: '입고일자 없음',
        who: '차량관리 — 차 받을 때 제시일자를 적습니다',
        rows: rows.filter(s => !s.offerDate),
        tone: 'bg-amber-100 text-amber-800',
      },
      {
        key: 'notSold',
        label: '판매완료 안 찍음',
        who: '광고팀 — 상담에서 판매완료로 바꾸면 여기로 넘어옵니다',
        // 상담은 판매완료인데 정산에 판매가가 비어 있는 차. 반대로 상담도 아직이면 그건 안 판 차다
        rows: rows.filter(s => s.salePrice === 0 && soldPlates.has(s.vehicleNumber)),
        tone: 'bg-rose-100 text-rose-800',
      },
      {
        key: 'payout',
        label: '실제지급액 없음',
        who: '계약팀 — 상사 정산서가 오면 맨 아래 금액을 옮겨 적습니다',
        rows: sold.filter(s => (s.payoutAmount ?? 0) === 0),
        tone: 'bg-indigo-100 text-indigo-800',
      },
      {
        key: 'contract',
        label: '계약서 사진 없음',
        who: '계약팀 — 올려두면 결재하는 분이 화면으로 보고 찍습니다',
        rows: sold.filter(s => !(s.contractPhotos ?? '').trim()),
        tone: 'bg-slate-200 text-slate-700',
      },
      {
        key: 'draft',
        label: '결재 안 올림',
        who: '담당자 — 다 채웠으면 올려야 결재가 시작됩니다',
        rows: sold.filter(s => (s.stage ?? 'DRAFT') === 'DRAFT'),
        tone: 'bg-violet-100 text-violet-800',
      },
    ].filter(g => g.rows.length > 0);
  }, [rows, soldPlates]);

  const total = gaps.reduce((sum, g) => sum + g.rows.length, 0);
  if (total === 0) return null;

  const shown = gaps.find(g => g.key === picked);

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-amber-50"
      >
        {open ? <ChevronDown size={14} className="text-amber-700" /> : <ChevronRight size={14} className="text-amber-700" />}
        <AlertTriangle size={14} className="text-amber-700" />
        <span className="text-xs font-bold text-amber-900">정산 전에 채워야 할 것</span>
        <span className="text-[11px] text-amber-800/80">
          {gaps.map(g => `${g.label} ${g.rows.length}`).join(' · ')}
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {gaps.map(g => (
              <button
                key={g.key}
                onClick={() => setPicked(p => (p === g.key ? null : g.key))}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  picked === g.key ? 'bg-amber-600 text-white' : g.tone
                }`}
              >
                {g.label} {g.rows.length}
              </button>
            ))}
          </div>

          {shown ? (
            <div className="mt-2">
              <p className="mb-1.5 text-[11px] text-amber-800/80">{shown.who}</p>
              {/* 차가 수십 대씩 밀리는 달이 있다 — 칸 안에서 굴린다 */}
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {shown.rows.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onOpen(s)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left hover:bg-amber-100/60"
                  >
                    <span className="font-mono text-xs text-slate-700 hover:underline">{s.vehicleNumber}</span>
                    <span className="text-xs text-slate-500">{s.vehicleName}</span>
                    <span className="ml-auto text-[11px] text-slate-400">
                      {s.offerDate ? `입고 ${dayjs(s.offerDate).format('M/D')}` : '입고일 없음'}
                      {s.salePrice > 0 && ` · 출고 ${dayjs(s.date).format('M/D')}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-amber-800/70">
              눌러서 어느 차인지 봅니다. 차량번호를 누르면 그 줄이 열립니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
