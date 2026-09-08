import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { FilePlus2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 정산 줄이 아직 없는 매입 건.
 *
 * 매입하면 정산 줄이 자동으로 생긴다. 그런데 그 기능이 생기기 전에 들어온 차와,
 * 만들다 막힌 차는 정산에 아예 안 보인다 — 매입 관리에는 있는데 정산에는 없으니
 * 계약팀이 뭘 채워야 하는지 알 길이 없다.
 *
 * 여기서 그걸 드러낸다. 누르면 차량번호·차명·매입가·구전이 채워진 줄이 생기고,
 * 상품화 비용과 판매가는 비어 있다 — 그게 계약팀이 채울 칸이다.
 */

interface Row {
  intakeId: string;
  vehicleNumber: string;
  vehicleName: string;
  date: string;
  totalAmount: number;
  employeeName: string;
}

export default function PendingPurchaseDrafts({ onCreated }: { onCreated: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>('/purchase-intake/settlement-drafts'));
    } catch {
      // 이 목록이 없어도 정산 화면은 그대로 쓸 수 있다 — 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const make = async (row: Row) => {
    setBusy(row.intakeId);
    try {
      await api(`/purchase-intake/settlement-drafts/${row.intakeId}`, { method: 'POST' });
      setRows(list => list.filter(r => r.intakeId !== row.intakeId));
      onCreated();
    } catch (e) {
      void alertError('만들지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(null);
    }
  };

  /** 한 번에 다 만든다. 밀린 게 많을 때 하나씩 누르게 두지 않는다. */
  const makeAll = async () => {
    setBusy('all');
    try {
      for (const row of rows) {
        await api(`/purchase-intake/settlement-drafts/${row.intakeId}`, { method: 'POST' });
      }
      setRows([]);
      onCreated();
    } catch (e) {
      void alertError('만들지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return null;

  // 어느 달 것이 밀려 있는지 먼저 보이게 한다 — 몇 건인지보다 어느 달인지가 먼저 궁금하다.
  const months = [...new Set(rows.map(r => dayjs(r.date).format('M월')))].join(' · ');

  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/50 p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <FilePlus2 size={14} className="text-amber-700" />
        <p className="text-xs font-bold text-amber-900">정산 줄이 없는 매입 {rows.length}건</p>
        <span className="text-[11px] text-amber-800/70">
          {months} · 누르면 매입 관리에 적힌 값이 채워진 줄이 생깁니다
        </span>
        <button
          disabled={busy != null}
          onClick={() => void makeAll()}
          className="ml-auto rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {busy === 'all' ? '만드는 중…' : '전부 만들기'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rows.map(row => (
          <button
            key={row.intakeId}
            disabled={busy != null}
            onClick={() => void make(row)}
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs hover:bg-amber-100 disabled:opacity-50"
            title={`${row.date} · 매입 ${row.totalAmount.toLocaleString()}원 · ${row.employeeName}`}
          >
            <span className="font-mono font-semibold text-slate-800">{row.vehicleNumber}</span>
            <span className="ml-1.5 text-slate-500">{row.vehicleName}</span>
            <span className="ml-1.5 text-amber-700/70">{dayjs(row.date).format('M/D')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
