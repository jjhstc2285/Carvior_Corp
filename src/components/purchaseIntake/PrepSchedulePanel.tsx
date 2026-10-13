import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';

/**
 * 상품화 일정 — 차가 들어와서 광고에 올라가기까지.
 *
 * 들어온 차를 나흘 안에 광고까지 올리는 것이 목표다. 하루 늦으면 그만큼 재고일수가
 * 늘고, 늘어난 날수는 그대로 이자와 시세 하락이 된다.
 *
 * 단계를 눌러 찍는다 — 누르면 오늘, 다시 누르면 지운다. 날짜를 손으로 고르게 하지
 * 않는 이유는, 끝낸 날 바로 찍는 자리라 거의 늘 오늘이기 때문이다.
 *
 * 멈춘 자리가 보여야 한다. 넷 중 어디서 멈췄는지를 알면 다음에 같은 자리에서 또
 * 늦지 않는다 — 늦는 자리는 늘 같은 자리다.
 *
 * 광고까지 올라간 차는 목록에서 빠진다. 끝난 일이 남아 있으면 할 일 목록이 아니라
 * 지난 기록이 된다.
 */

interface Row {
  id: string;
  vehicleNumber: string;
  vehicleName: string;
  intakeDate: string;
  days: number;
  inspectedOn: string | null;
  outsourcedOn: string | null;
  photographedOn: string | null;
  listedOn: string | null;
  memo: string;
}

interface Rules {
  steps: { key: keyof Row; label: string; day: number; todo: string }[];
  targetDays: number;
}

export default function PrepSchedulePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, rule] = await Promise.all([api<Row[]>('/prep-schedule'), api<Rules>('/prep-schedule/rules')]);
      setRows(list);
      setRules(rule);
    } catch {
      // 못 불러와도 매입 목록은 그대로 보여준다 — 덤으로 띄우는 자리다
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stamp = async (row: Row, step: string, on: boolean) => {
    setBusy(row.id);
    try {
      await api(`/prep-schedule/${row.id}/stamp`, { method: 'POST', body: { step, on } });
      await load();
    } catch (e) {
      void alertError('찍지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusy(null);
    }
  };

  const target = rules?.targetDays ?? 4;
  const late = rows.filter(r => r.days > target).length;

  if (rows.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/30">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-indigo-50"
      >
        {open ? <ChevronDown size={14} className="text-indigo-700" /> : <ChevronRight size={14} className="text-indigo-700" />}
        <Wrench size={14} className="text-indigo-700" />
        <span className="text-xs font-bold text-indigo-900">상품화 진행</span>
        <span className="text-[11px] text-indigo-800/80">
          광고 전 {rows.length}대 · 들어온 지 {target}일 안에 올리는 것이 목표입니다
        </span>
        {late > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
            늦은 차 {late}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3.5 pb-3">
          {/* 어느 단계를 며칠째에 하는지 — 숫자만 보면 언제까지 해야 하는지 모른다 */}
          <p className="mb-1.5 text-[11px] text-indigo-800/70">
            {(rules?.steps ?? []).map(s => `${s.day}일째 ${s.label}`).join(' → ')}
          </p>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {rows.map(row => {
              const over = row.days > target;
              return (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                    over ? 'bg-red-50' : 'bg-white'
                  }`}
                >
                  <span className={`w-12 shrink-0 text-[11px] font-bold ${over ? 'text-red-600' : 'text-slate-500'}`}>
                    {row.days}일째
                  </span>
                  <span className="font-mono text-xs text-slate-700">{row.vehicleNumber}</span>
                  <span className="min-w-0 max-w-[12rem] truncate text-xs text-slate-500">{row.vehicleName}</span>
                  <span className="text-[11px] text-slate-400">입고 {dayjs(row.intakeDate).format('M/D')}</span>

                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {(rules?.steps ?? []).map(step => {
                      const on = !!row[step.key];
                      return (
                        <button
                          key={step.key}
                          onClick={() => void stamp(row, step.key, !on)}
                          disabled={busy === row.id}
                          title={
                            on
                              ? `${dayjs(row[step.key] as string).format('M/D')}에 끝냈습니다 — 누르면 지웁니다`
                              : `${step.day}일째 — ${step.todo}`
                          }
                          className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold disabled:opacity-50 ${
                            on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {on && <Check size={10} />}
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-1.5 text-[11px] text-slate-400">
            단계를 누르면 <b>오늘 날짜로 찍힙니다</b>(다시 누르면 지워집니다). 사진은 상품화 사진을 올리면 저절로
            찍힙니다. <b>매물 등록</b>까지 찍으면 이 목록에서 빠집니다.
          </p>
        </div>
      )}
    </div>
  );
}
