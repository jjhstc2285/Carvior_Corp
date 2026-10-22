import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Check, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useEscClose } from '../../lib/useEscClose';
import { useStore } from '../../store';
import { effectiveKind } from '../../lib/consultationStats';
import { platformTone } from '../../lib/platformTone';
import {
  CONSULTATION_KIND_COLOR,
  CONSULTATION_KIND_LABEL,
  CONSULTATION_PLATFORMS_BY_KIND,
  type ConsultationKind,
} from '../../types';

/**
 * 분류가 안 된 유입 경로를 다시 나눈다.
 *
 * 시트에서 옮겨온 건이 경로 칸에 죄다 '기타'로 들어와 있다. 수출 상담은 거의 전부다.
 * 그래프에서 기타가 두 번째로 큰 덩어리로 서는데, 그게 '기타로 들어왔다'가 아니라
 * '아직 안 나눴다'는 뜻이라 보고 판단할 수가 없다 — 엔카에 얼마를 쓸지가 여기서 나온다.
 *
 * 전화를 받은 TM 말고는 그 건이 어디서 왔는지 모른다. 그래서 받는 자리(광고팀)와
 * 관리자에게만 연다 — 그래프를 보는 사람과 같은 자리다.
 *
 * 한 건씩 누르는 게 기본이고, 여러 건이 한 데서 온 게 분명할 때만 골라서 한꺼번에 준다.
 * 모르는 건을 묶어서 찍으면 숫자는 채워지지만 그 숫자가 거짓이 된다.
 */

/** 아직 안 나눈 값 — 빈칸이거나 '기타'다 */
export function isUnsorted(platform: string): boolean {
  const v = (platform ?? '').trim();
  return !v || v === '기타';
}

/** 그 종류에서 고를 수 있는 경로 — '기타'는 답이 아니라서 뺀다 */
const choicesOf = (kind: ConsultationKind) => CONSULTATION_PLATFORMS_BY_KIND[kind].filter(p => p !== '기타');

export default function PlatformFixPanel({
  from,
  to,
  kind,
  onClose,
}: {
  from: string;
  to: string;
  /** 보고 있던 종류. 전체로 보고 있었으면 null — 종류를 안 가린다 */
  kind: ConsultationKind | null;
  onClose: () => void;
}) {
  useEscClose(onClose);

  const { state, refresh } = useStore();
  /* 방금 나눈 건 — 저장하자마자 목록에서 내린다. 새로고침을 기다리면 같은 줄을 두 번 누른다 */
  const [done, setDone] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    return state.consultations
      .filter(c => (c.date ?? '') >= from && (c.date ?? '') <= to)
      .filter(c => isUnsorted(c.platform))
      .filter(c => !kind || effectiveKind(c) === kind)
      // 최근 것부터 — 기억이 남아 있는 건이 맨 뒤에 있으면 거기까지 못 간다
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.time ?? '').localeCompare(a.time ?? ''));
  }, [state.consultations, from, to, kind]);

  const left = rows.filter(c => !done[c.id]);
  const nameOf = (id: string) => state.employees.find(e => e.id === id)?.name ?? '';

  /** 고른 건들을 한 경로로 — 한 건만 누르면 그 건만 */
  const apply = async (ids: string[], platform: string) => {
    if (ids.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      /*
        한 건씩 보낸다. 묶어 보내는 자리가 서버에 없고, 백 건쯤이면 그냥 보내도 된다.
        다 보내고 나서 한 번만 새로고침한다 — 건마다 새로고침하면 화면이 백 번 다시 그려진다.
      */
      for (const id of ids) {
        await api(`/consultations/${id}`, { method: 'PATCH', body: { platform } });
      }
      setDone(prev => {
        const next = { ...prev };
        for (const id of ids) next[id] = platform;
        return next;
      });
      setPicked(new Set());
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /*
    고른 건들이 전부 같은 종류일 때만 한꺼번에 줄 수 있다.
    종류가 섞이면 고를 수 있는 경로가 서로 달라서 어느 목록을 보여줄지 정할 수 없다.
  */
  const pickedRows = left.filter(c => picked.has(c.id));
  const pickedKinds = new Set(pickedRows.map(c => effectiveKind(c)));
  const bulkKind = pickedKinds.size === 1 ? [...pickedKinds][0] : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              유입 경로 다시 나누기
              <span className="ml-2 text-sm font-medium text-slate-400">
                {kind ? `${CONSULTATION_KIND_LABEL[kind]} 상담 ` : ''}
                {left.length}건 남음
              </span>
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {dayjs(from).format('YY.MM.DD')} ~ {dayjs(to).format('YY.MM.DD')} · 경로가 비었거나 ‘기타’로만 적힌
              건입니다. 상담 내용을 보고 어디서 온 전화인지 눌러 주세요.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {error && <p className="px-5 pt-2 text-xs text-red-500">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">이 기간에 안 나눈 건이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(c => {
                const k = effectiveKind(c);
                const saved = done[c.id];
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border px-3 py-2 ${
                      saved ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {/* 묶어서 주려고 고르는 칸 — 다 나눈 줄은 더 고를 게 없다 */}
                      <input
                        type="checkbox"
                        checked={picked.has(c.id)}
                        disabled={!!saved}
                        onChange={() => toggle(c.id)}
                        className="size-3.5 shrink-0 accent-indigo-600 disabled:opacity-30"
                      />
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${CONSULTATION_KIND_COLOR[k].chip}`}
                      >
                        {CONSULTATION_KIND_LABEL[k]}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{dayjs(c.date).format('MM.DD')}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-700">{c.vehicleNumber || '—'}</span>
                      <span className="shrink-0 text-xs text-slate-500">{c.vehicleName}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{c.customerPhone}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{nameOf(c.employeeId)}</span>
                      {/*
                        상담 내용이 유일한 단서다 — "엔카 보고 전화", "기존 거래처"가 여기 적혀 있다.
                        한 줄로 자르고 올려두면 전부 보이게 한다.
                      */}
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={c.content}>
                        {c.content}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
                      {saved ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <Check size={13} /> {saved} 로 바꿨습니다
                        </span>
                      ) : (
                        choicesOf(k).map(p => (
                          <button
                            key={p}
                            disabled={saving}
                            onClick={() => void apply([c.id], p)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors hover:brightness-95 disabled:opacity-40 ${platformTone(p).chip}`}
                          >
                            {p}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/*
          여러 건이 한 데서 온 게 분명할 때만 쓴다. 종류가 섞여 있으면 고를 수 있는
          경로가 서로 달라서 묶어 줄 수가 없다 — 그때는 알려 주고 멈춘다.
        */}
        {pickedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50 px-5 py-2.5">
            <span className="text-xs font-bold text-slate-600">고른 {pickedRows.length}건을 한꺼번에</span>
            {bulkKind ? (
              choicesOf(bulkKind).map(p => (
                <button
                  key={p}
                  disabled={saving}
                  onClick={() => void apply(pickedRows.map(c => c.id), p)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-40 ${platformTone(p).chip}`}
                >
                  {p}
                </button>
              ))
            ) : (
              <span className="text-xs text-amber-600">
                종류가 섞여 있습니다 — 고를 수 있는 경로가 달라서 한꺼번에는 못 줍니다
              </span>
            )}
            <button
              onClick={() => setPicked(new Set())}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-200"
            >
              고른 것 풀기
            </button>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5">
          {/* 기타로 남겨 두는 것도 답일 수 있다 — 그러면 다음에도 여기 뜬다고 미리 말해 둔다 */}
          <p className="text-[11px] text-slate-400">정말 ‘기타’인 건은 그냥 두세요 — 다음에 열어도 여기 다시 뜹니다.</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
