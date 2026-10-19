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
  /** 우리가 사온 차가 아닌 종류(알선·수출·기타)인가 — 차량 관리에 없는 게 당연하다 */
  brokered?: boolean;
  /** 고칠 상담 */
  consultationId: string;
  /** 뒤 네 자리가 같은 차 — 번호를 짧게 적은 상담을 여기로 맞춘다 */
  matches?: { vehicleNumber: string; soldOn: string | null }[];
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

  /**
   * 짧게 적은 번호를 진짜 번호로 고친다.
   *
   * 7618 로 적힌 알티마가 실은 26무7618 이다. 그 차는 차량 관리에 멀쩡히 있는데 번호가
   * 짧아서 못 맞춘 것뿐이라, 상담의 번호만 고치면 이 줄은 저절로 사라진다 —
   * 차를 새로 만들면 같은 차가 두 줄이 된다.
   */
  const matchTo = async (row: Row, vehicleNumber: string) => {
    if (!vehicleNumber) return;
    setSaving(row.vehicleNumber);
    try {
      await api(`/consultations/${row.consultationId}`, { method: 'PATCH', body: { vehicleNumber } });
      setRows(list => list.filter(r => r.vehicleNumber !== row.vehicleNumber));
      onRegistered();
    } catch (e) {
      void alertError('번호를 고치지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(null);
    }
  };

  const register = async (row: Row, soldDate: string) => {
    if (!soldDate) return;
    setSaving(row.vehicleNumber);
    try {
      await api('/vehicles/register-sold', {
        method: 'POST',
        /*
          알선차라는 표를 같이 보낸다.

          매도는 매도인데 우리가 판 대수에 섞이면 안 된다 — 오늘 매도 대수를 보는데
          알선 건이 끼어 있으면 나중에 맞춰볼 수가 없다. 표가 붙은 차는 집계에서 뺀다.
        */
        body: { vehicleNumber: row.vehicleNumber, vehicleModel: row.vehicleModel, soldDate, brokered: row.brokered === true },
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
          알선처럼 우리가 안 사온 차입니다. 매도일자를 적으면 매도 차량으로 넘어갑니다 —
          알선 표가 붙은 차는 우리 매도 대수에 안 들어갑니다
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] text-violet-800/70">
              <th className="px-2 py-1 font-medium">차량번호</th>
              <th className="px-2 py-1 font-medium">차명</th>
              <th className="px-2 py-1 font-medium">판매완료</th>
              <th className="px-2 py-1 font-medium">같은 차 아닌가요</th>
              <th className="px-2 py-1 font-medium">매도일자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.vehicleNumber} className="border-t border-violet-200/50">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-slate-800">
                  {row.vehicleNumber}
                  {/* 알선·수출은 차량 관리에 없는 게 당연하다 — 빠진 게 아니라고 적어 둔다 */}
                  {row.brokered && (
                    <span
                      className="ml-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-emerald-700"
                      title="알선·수출 상담입니다. 우리가 사온 차가 아니라 차량 관리에 없는 게 당연하고, 매도해도 우리 매도 대수에 안 들어갑니다"
                    >
                      알선
                    </span>
                  )}
                </td>
                <td className="max-w-56 truncate px-2 py-1.5 text-slate-600" title={row.vehicleModel}>
                  {row.vehicleModel || <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                  {dayjs(row.soldOn).format('M월 D일')}
                </td>

                {/*
                  뒤 네 자리가 같은 차 — 눌러서 상담 번호를 고친다.

                  차를 새로 만들지 않는다. 번호만 고치면 그 차와 이어지고 이 줄은 저절로
                  사라진다 — 새로 만들면 같은 차가 두 줄이 된다.

                  두 대가 걸리면 사람이 골라야 한다. 매도일자가 적힌 쪽이 대개 그 차지만
                  확실하지 않아서 둘 다 띄운다.
                */}
                <td className="px-2 py-1.5">
                  {row.matches && row.matches.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {row.matches.map(m => (
                        <button
                          key={m.vehicleNumber}
                          disabled={saving === row.vehicleNumber}
                          onClick={() => void matchTo(row, m.vehicleNumber)}
                          title={`상담 차량번호를 ${m.vehicleNumber} 로 고칩니다`}
                          className="rounded-lg border border-indigo-300 bg-white px-2 py-1 font-mono text-[12px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {m.vehicleNumber}
                          {m.soldOn && <span className="ml-1 font-sans text-[10px] text-slate-400">매도 {dayjs(m.soldOn).format('M/D')}</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">짝 없음</span>
                  )}
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
