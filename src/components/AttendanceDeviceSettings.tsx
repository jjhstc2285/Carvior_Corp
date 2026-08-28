import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { MonitorCheck, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, getDeviceId, setDevice } from '../lib/api';
import { deviceFingerprint } from '../lib/deviceFingerprint';
import { confirmDanger } from '../lib/alert';

interface AttendanceDevice {
  id: string;
  label: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * 출근 단말(그 자리 PC) 관리.
 *
 * IP 화이트리스트는 "사무실 네트워크인가"까지만 가른다 — 같은 WiFi를 쓰는 휴대폰도 같은
 * 공인 IP로 나오기 때문이다. 여기서 등록한 PC의 브라우저에만 키가 저장되고,
 * 등록된 단말이 하나라도 있으면 그 키를 가진 브라우저에서만 출근이 찍힌다.
 */
export default function AttendanceDeviceSettings() {
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myDeviceId = getDeviceId();

  const load = useCallback(async () => {
    try {
      setDevices(await api<AttendanceDevice[]>('/attendance/devices'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '단말 목록을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async () => {
    const name = label.trim();
    if (!name) {
      setError('단말 이름을 입력해 주세요. (예: 1층 카운터 PC)');
      return;
    }
    setBusy(true);
    try {
      // 지문을 같이 보낸다 — 나중에 사용기록을 지워 키가 날아가도 이걸로 이 PC를 알아본다.
      const fingerprint = await deviceFingerprint();

      // 키 원본은 이 응답에서만 내려온다 — 받은 즉시 이 브라우저에 저장한다.
      const created = await api<AttendanceDevice & { token: string }>('/attendance/devices', {
        method: 'POST',
        body: { label: name, ...(fingerprint ? { fingerprint } : {}) },
      });
      setDevice({ id: created.id, token: created.token });
      setLabel('');
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '단말을 등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (device: AttendanceDevice) => {
    if (!(await confirmDanger(`'${device.label}' 단말 등록을 해제할까요?`, '이 PC에서는 더 이상 출근을 찍을 수 없게 됩니다.', '해제'))) return;
    try {
      await api(`/attendance/devices/${device.id}`, { method: 'DELETE' });
      if (device.id === myDeviceId) setDevice(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '단말 등록을 해제하지 못했습니다.');
    }
  };

  const enabled = devices.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MonitorCheck size={16} className="text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">출근 단말 (사무실 PC)</h2>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
            enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-500 ring-slate-500/20'
          }`}
        >
          {enabled ? `등록 단말 ${devices.length}대에서만 가능` : '제한 없음 (모든 기기 허용)'}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs leading-relaxed text-slate-400">
          IP 제한은 <strong className="font-semibold text-slate-500">사무실 네트워크까지만</strong> 가릅니다 — 같은 WiFi를 쓰는
          휴대폰도 공인 IP가 같아서 IP로는 구분되지 않아요. 여기에 자리 PC를 등록하면{' '}
          <strong className="font-semibold text-slate-500">그 PC 브라우저에서만</strong> 출근이 찍힙니다.
          <br />
          등록은 <strong className="font-semibold text-slate-500">반드시 그 PC에서</strong> 눌러야 합니다(키가 누른 브라우저에 저장됨).
          브라우저 데이터를 지우거나 시크릿 모드로 열면 다시 등록해야 해요.
        </p>

        {myDeviceId ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            ✓ 지금 보고 있는 이 PC는 출근 단말로 등록돼 있습니다.
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              value={label}
              onChange={e => { setLabel(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') void register(); }}
              placeholder="예: 1층 카운터 PC"
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={register}
              disabled={busy}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Plus size={14} /> 이 PC 등록
            </button>
          </div>
        )}

        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}

        {devices.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-50 rounded-lg border border-slate-100">
            {devices.map(d => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-slate-700">
                    {d.label}
                    {d.id === myDeviceId && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">이 PC</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {d.lastUsedAt ? `마지막 출근 ${dayjs(d.lastUsedAt).format('M/D HH:mm')}` : '아직 사용 기록 없음'}
                  </p>
                </div>
                <button
                  onClick={() => remove(d)}
                  className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="등록 해제"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {enabled && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            ⚠️ 마지막 남은 단말을 해제하면 다시 모든 기기에서 출근이 가능해집니다.
            키가 저장된 브라우저를 통째로 복사하면 다른 PC에서도 쓸 수 있으니, 자리 PC는 잠금을 걸어두세요.
          </p>
        )}
      </div>
    </section>
  );
}
