import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { PackageCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 차량 관리에 없는 판매완료 차.
 *
 * 알선처럼 우리가 안 사온 차는 차량 관리에 등록되지 않는다. 그래도 판 건 판 거라
 * 매도 차량으로 남아야 한다 — 언제 무엇을 넘겼는지가 없으면 나중에 맞춰볼 게 없다.
 *
 * 매도일자를 적으면 그때 차를 만든다. 조회만으로 미리 만들어두면 안 쓸 차까지 쌓인다.
 * 만들어진 차는 매입 관리에서 나머지를 채우면 그대로 이어진다.
 */

interface Row {
  vehicleNumber: string;
  vehicleModel: string;
  /** 판매완료로 찍힌 상담 날짜 */
  soldOn: string;
}

export default function UnregisteredSoldPanel({ onRegistered }: { onRegistered: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>('/vehicles/unregistered-sold'));
    } catch {
      // 이 목록이 없어도 나머지 화면은 그대로 쓸 수 있다 — 조용히 넘긴다.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async (row: Row, soldDate: string) => {
    if (!soldDate) return;
    setSaving(row.vehicleNumber);
    try {
      await api('/vehicles/register-sold', {
        method: 'POST',
        body: { vehicleNumber: row.vehicleNumber, vehicleModel: row.vehicleModel, soldDate },
      });
      setRows(list => list.filter(r => r.vehicleNumber !== row.vehicleNumber));
      onRegistered();
    } catch (e) {
      void alertError('매도로 남기지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <PackageCheck size={14} className="text-violet-700" />
        <p className="text-xs font-bold text-violet-900">차량 관리에 없는 판매완료 차 {rows.length}대</p>
        <span className="text-[11px] text-violet-800/70">
          알선처럼 우리가 안 사온 차입니다. 매도일자를 적으면 매도 차량으로 넘어갑니다
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] text-violet-800/70">
              <th className="px-2 py-1 font-medium">차량번호</th>
              <th className="px-2 py-1 font-medium">차명</th>
              <th className="px-2 py-1 font-medium">판매완료</th>
              <th className="px-2 py-1 font-medium">매도일자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.vehicleNumber} className="border-t border-violet-200/50">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-slate-800">
                  {row.vehicleNumber}
                </td>
                <td className="max-w-56 truncate px-2 py-1.5 text-slate-600" title={row.vehicleModel}>
                  {row.vehicleModel || <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                  {dayjs(row.soldOn).format('M월 D일')}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      disabled={saving === row.vehicleNumber}
                      onChange={e => void register(row, e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 disabled:bg-slate-50"
                    />
                    <button
                      disabled={saving === row.vehicleNumber}
                      onClick={() => void register(row, dayjs().format('YYYY-MM-DD'))}
                      className="rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      title="오늘 날짜로 매도 처리합니다"
                    >
                      매도
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
