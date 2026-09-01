import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { MonitorCheck, UserPlus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { alertError, alertSuccess, confirmDanger } from '../lib/alert';

interface SignupRequest {
  id: string;
  loginId: string;
  name: string;
  position: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** 신청한 브라우저 지문 — 있으면 그 PC를 출근 단말로 함께 등록할 수 있다 */
  fingerprint: string | null;
  createdAt: string;
}

/**
 * 회원가입 승인.
 *
 * 승인하면 그때 계정이 만들어진다 — 그전까지는 로그인되지 않는다.
 *
 * '이 PC를 출근 단말로도 등록'은 일부러 기본값을 끈다. 자리 PC에서 신청했으면 켜면 되지만,
 * 휴대폰으로 신청한 걸 켜버리면 휴대폰이 출근 단말이 되어 IP·단말 제한이 무의미해진다.
 */
export default function SignupApprovals() {
  const [rows, setRows] = useState<SignupRequest[]>([]);
  const [withDevice, setWithDevice] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    try {
      const data = await api<SignupRequest[]>('/auth/signups?status=PENDING');
      if (myReq !== reqId.current) return;
      setRows(data);
      setError(null);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : '가입 신청을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: SignupRequest, action: 'approve' | 'reject') => {
    if (action === 'reject' && !(await confirmDanger(`${row.name}(${row.loginId}) 신청을 반려할까요?`, undefined, '반려'))) {
      return;
    }

    setBusyId(row.id);
    try {
      await api(`/auth/signups/${row.id}/review`, {
        method: 'POST',
        body: { action, ...(action === 'approve' ? { registerDevice: !!withDevice[row.id] } : {}) },
      });
      if (action === 'approve') {
        await alertSuccess(
          `${row.name}님 계정을 만들었습니다`,
          withDevice[row.id]
            ? '그 PC에서 사무실 안에서 로그인하면 출근 단말 키가 자동으로 심어집니다.'
            : `이제 '${row.loginId}'로 로그인할 수 있습니다.`,
        );
      }
      await load();
    } catch (e) {
      void alertError('처리하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  // 대기 중인 신청이 없으면 화면을 차지하지 않는다.
  if (rows.length === 0 && !error) return null;

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <UserPlus size={15} className="text-indigo-700" />
        <h3 className="text-sm font-bold text-indigo-900">가입 승인 대기</h3>
        {rows.length > 0 && (
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">{rows.length}</span>
        )}
      </div>

      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500">{error}</p>}

      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">
                  {r.name}
                  {r.position && <span className="ml-1 text-xs font-normal text-slate-400">{r.position}</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono">{r.loginId}</span>
                  {r.phone && ` · ${r.phone}`}
                  {' · '}
                  {dayjs(r.createdAt).format('M/D HH:mm')} 신청
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => void review(r, 'reject')}
                  disabled={busyId === r.id}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  반려
                </button>
                <button
                  onClick={() => void review(r, 'approve')}
                  disabled={busyId === r.id}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyId === r.id ? '처리 중…' : '승인'}
                </button>
              </div>
            </div>

            {/* 지문이 없으면 애초에 고를 수 없다(보안 컨텍스트가 아니거나 옛 브라우저) */}
            {r.fingerprint && (
              <label className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={!!withDevice[r.id]}
                  onChange={e => setWithDevice(prev => ({ ...prev, [r.id]: e.target.checked }))}
                  className="mt-0.5 rounded"
                />
                <span>
                  <MonitorCheck size={11} className="mr-0.5 inline text-slate-500" />
                  <b>신청한 그 PC를 출근 단말로도 등록</b>
                  <br />
                  사무실 자리 PC에서 신청한 게 확실할 때만 켜세요. 휴대폰으로 신청했다면 휴대폰에서
                  출근이 찍히게 됩니다.
                </span>
              </label>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
