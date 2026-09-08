import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { withCommas } from '../../lib/money';

/**
 * 매입했는데 차량 관리에 없는 차.
 *
 * 매입을 적으면 차량 관리에도 같이 올라간다. 그런데 차량번호 형식이 규칙과 다르거나
 * 저장이 막히면 조용히 건너뛴다 — 매입 기록을 못 남기는 것보다는 낫다고 봤기 때문이다.
 * 그 대신 빠진 차가 어디에도 안 보여서 "매입했는데 제시 대상에 안 뜬다"가 된다.
 *
 * 여기서 그걸 드러낸다. 눌러서 올리면 매입 관리에 적힌 연식·주행거리까지 따라와서
 * 올리자마자 제시 대상에 뜬다.
 */

interface Row {
  vehicleNumber: string;
  vehicleModel: string;
  modelYear: string;
  mileage: number;
  purchasedOn: string;
  /** 못 올린 까닭. null 이면 눌러서 올릴 수 있다 */
  reason: string | null;
}

export default function UnregisteredIntakePanel({ onRegistered }: { onRegistered: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>('/vehicles/unregistered-intake'));
    } catch {
      // 이 목록이 없어도 나머지 화면은 그대로 쓸 수 있다 — 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async (row: Row) => {
    setSaving(row.vehicleNumber);
    try {
      await api('/vehicles/register-intake', {
        method: 'POST',
        body: { vehicleNumber: row.vehicleNumber },
      });
      setRows(list => list.filter(r => r.vehicleNumber !== row.vehicleNumber));
      onRegistered();
    } catch (e) {
      void alertError('올리지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/50 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-amber-700" />
        <p className="text-xs font-bold text-amber-900">매입했는데 차량 관리에 안 올라간 차 {rows.length}대</p>
        <span className="text-[11px] text-amber-800/70">이래서 제시 대상에 안 뜹니다. 눌러서 올리면 됩니다</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] text-amber-800/70">
              <th className="px-2 py-1 font-medium">차량번호</th>
              <th className="px-2 py-1 font-medium">차량명</th>
              <th className="px-2 py-1 font-medium">연식</th>
              <th className="px-2 py-1 text-right font-medium">주행거리</th>
              <th className="px-2 py-1 font-medium">매입일</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.vehicleNumber} className="border-t border-amber-200/60">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-slate-800">
                  {row.vehicleNumber}
                </td>
                <td className="max-w-48 truncate px-2 py-1.5 text-slate-600" title={row.vehicleModel}>
                  {row.vehicleModel || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-1.5 text-slate-500">{row.modelYear || '—'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-500">
                  {row.mileage ? `${withCommas(row.mileage)}km` : '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                  {dayjs(row.purchasedOn).format('M월 D일')}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {/* 차량번호가 잘못된 건 여기서 눌러도 안 된다 — 매입 관리에서 고쳐야 한다 */}
                  {row.reason ? (
                    <span className="text-[11px] font-medium text-red-600">{row.reason}</span>
                  ) : (
                    <button
                      disabled={saving === row.vehicleNumber}
                      onClick={() => void register(row)}
                      className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      차량 관리에 올리기
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
