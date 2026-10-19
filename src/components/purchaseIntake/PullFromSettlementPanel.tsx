import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, DownloadCloud } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { withCommas } from '../../lib/money';

/**
 * 정산에만 있고 매입 등록이 없는 차 — 정산에서 끌어온다.
 *
 * 정산은 돈이 걸려 있어 다들 꼬박꼬박 적는다. 매입 등록은 안 적어도 당장 아쉬운 사람이
 * 없어서 빠진다. 그런데 재고일수도, 상품화 일정도, 장기재고 알림도 전부 매입 등록에서
 * 시작한다 — 없으면 그 차는 이 화면에 아예 안 뜬다.
 *
 * 정산에 적힌 것만 옮긴다. 고객이름·매입처·검차일은 정산에 없는 값이라 비워 두고,
 * 특이사항에 끌어왔다고 적어 둔다. 지어내는 것보다 비워 두고 누가 채우게 하는 쪽이 낫다.
 *
 * 끌어올 차가 없으면 아무것도 안 그린다 — 늘 떠 있으면 아무도 안 본다.
 */

interface Row {
  vehicleNumber: string;
  vehicleName: string;
  /** 제시일자 — 입고한 날이다. 이 날짜가 없는 차는 끌어오지 않는다 */
  date: string;
  purchaseAmount: number;
  brokerFee: number;
  employeeName: string;
}

/** 정산에는 있는데 제시일자가 없어 못 끌어오는 차 */
interface Blocked {
  vehicleNumber: string;
  vehicleName: string;
}

export default function PullFromSettlementPanel({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ rows: Row[]; blocked: Blocked[] }>('/purchase-intake/pullable');
      setRows(res.rows);
      setBlocked(res.blocked);
    } catch {
      // 못 불러와도 매입 목록은 그대로 보여준다 — 덤으로 띄우는 자리다
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pull = async () => {
    const ok = await confirmDanger(
      `${rows.length}대를 정산에서 끌어와 매입 줄로 만들까요?`,
      '매입일은 제시일자로 들어갑니다. 고객이름 · 매입처 · 검차일은 비어 있으니 나중에 채워 주세요.',
      '끌어오기',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api<{ made: number }>('/purchase-intake/pull', { method: 'POST' });
      await load();
      onDone();
      if (res.made < rows.length) {
        void alertError(
          `${res.made}대만 만들었습니다`,
          '차량번호가 규칙과 다른 차는 건너뜁니다. 번호를 고치고 다시 눌러 주세요.',
        );
      }
    } catch (e) {
      void alertError('끌어오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0 && blocked.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40">
      <div className="flex w-full items-center gap-2 px-3.5 py-2.5">
        <button onClick={() => setOpen(v => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-emerald-700" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-emerald-700" />
          )}
          <DownloadCloud size={14} className="shrink-0 text-emerald-700" />
          <span className="shrink-0 text-xs font-bold text-emerald-900">정산에서 끌어올 수 있는 차</span>
          <span className="min-w-0 truncate text-[11px] text-emerald-800/80">
            {rows.length}대 — 정산에는 있는데 매입 등록이 없습니다
            {blocked.length > 0 && (
              <span className="text-amber-700"> · 제시일자가 없어 못 끌어오는 차 {blocked.length}대</span>
            )}
          </span>
        </button>
        {rows.length > 0 && (
          <button
            onClick={() => void pull()}
            disabled={busy}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? '만드는 중…' : `${rows.length}대 끌어오기`}
          </button>
        )}
      </div>

      {open && (
        <div className="px-3.5 pb-3">
          <p className="mb-1.5 text-[11px] text-emerald-800/70">
            차명 · 매입가 · 구전 · 담당자가 들어갑니다. <b>매입일은 제시일자</b>로 들어갑니다 — 매입 관리가 달을 가르는
            기준이 제시일자라, 그 날짜라야 제 달에 앉습니다. <b>고객이름 · 매입처 · 검차일은 비어</b> 있으니 나중에 채워
            주세요(특이사항에 &quot;정산에서 끌어옴&quot;이라고 적힙니다).
          </p>

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {rows.map(row => (
              <div key={row.vehicleNumber} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                <span className="font-mono text-xs text-slate-700">{row.vehicleNumber}</span>
                <span className="min-w-0 max-w-[14rem] truncate text-xs text-slate-500">
                  {row.vehicleName || <span className="text-slate-300">차명 없음</span>}
                </span>
                <span className="text-[11px] text-slate-400">입고 {dayjs(row.date).format('M/D')}</span>
                <span className="ml-auto text-xs font-semibold text-slate-700">{withCommas(String(row.purchaseAmount))}</span>
                {row.brokerFee > 0 && (
                  <span className="text-[11px] text-amber-600">구전 {withCommas(String(row.brokerFee))}</span>
                )}
                <span className="w-20 shrink-0 text-right text-[11px] text-slate-400">{row.employeeName}</span>
              </div>
            ))}
          </div>

          {/*
            제시일자가 없어 못 끌어오는 차.

            그냥 빼 버리면 "정산에 있는데 왜 안 뜨지"가 되고, 제시일자만 적으면 된다는 걸
            아무도 모른다. 날짜를 지어내 끌어온 적이 있는데, 그 열 대가 정산일을 따라
            9월에 앉아 겨우 맞춰 둔 120대가 130대가 됐다.
          */}
          {blocked.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
              <p className="mb-1 text-[11px] text-amber-800">
                <b>제시일자가 없어 못 끌어오는 차 {blocked.length}대</b> — 재고 금융에서 제시일자를 적으면 끌어옵니다.
                매입 관리는 제시일자로 달을 가르는데, 그 날짜가 없으면 어느 달에 넣어야 할지 알 수 없습니다.
              </p>
              <div className="flex flex-wrap gap-1">
                {blocked.map(b => (
                  <span key={b.vehicleNumber} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600">
                    <span className="font-mono">{b.vehicleNumber}</span>
                    {b.vehicleName && <span className="ml-1 text-slate-400">{b.vehicleName.slice(0, 14)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
