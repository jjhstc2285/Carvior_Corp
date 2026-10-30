import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { confirmDanger } from '../../lib/alert';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 알선 인센티브 요율표를 고친다.
 *
 * 구간과 요율은 장사 사정에 따라 바뀐다. 코드에 박혀 있어서 바꾸려면 배포를 해야 했고,
 * 그 사이에는 종이에 적힌 표와 화면이 다른 말을 했다.
 *
 * 적용 시작일로 갈라 쌓는다. 한 벌만 두고 고치면 지난 달 급여가 새 요율로 다시
 * 계산되는데, 이미 나간 돈이 화면에서 달라지면 어느 쪽이 맞는지 따질 근거가 사라진다.
 * 그 달에는 그 달에 살아 있던 표를 쓴다.
 *
 * 금액은 만원으로 받는다 — 안내표에 적힌 꼴이 만원이고, 원으로 받으면 영 하나가 틀린다.
 */

interface Tier {
  tier: string;
  /** 원 */
  from: number;
  /** 0.2 = 20% */
  rate: number;
}

export interface RuleSet {
  id?: string;
  effectiveFrom: string;
  baseSalaryDefault: number;
  floor: number;
  tiers: Tier[];
  tenure: number[];
  leader: { baseSalary: number; defaultRate: number; targetRate: number; minPersonalSales: number };
  updatedBy?: string;
  updatedAt?: string;
}

const MAN = 10_000;
const toMan = (won: number) => (won ? String(Math.round(won / MAN)) : '');
const fromMan = (text: string) => Math.round((Number(String(text).replace(/[^\d]/g, '')) || 0) * MAN);
const toPct = (rate: number) => (rate ? String(Math.round(rate * 1000) / 10) : '');
const fromPct = (text: string) => (Number(String(text).replace(/[^\d.]/g, '')) || 0) / 100;

const BOX = 'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function IncentiveRulesForm({
  current,
  onClose,
  onSaved,
}: {
  /** 지금 쓰이고 있는 표 — 새로 만들 때 여기서 베껴 시작한다 */
  current: RuleSet;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saved, setSaved] = useState<RuleSet[]>([]);
  const [draft, setDraft] = useState<RuleSet>(() => ({ ...current, tiers: [...current.tiers] }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscClose(onClose, !busy);

  const load = useCallback(async () => {
    try {
      const rows = await api<RuleSet[]>('/referral/incentive-rules');
      setSaved(rows);
      if (rows.length > 0) setDraft({ ...rows[0], tiers: [...rows[0].tiers] });
    } catch {
      /* 못 받아와도 지금 표로 시작할 수 있다 — 창이 안 열리는 것보다 낫다 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* 보기 좋게 작은 구간부터 — 저장할 때 서버가 다시 한 번 줄 세운다 */
  const tiers = useMemo(() => [...draft.tiers].sort((a, b) => a.from - b.from), [draft.tiers]);

  const setTier = (i: number, patch: Partial<Tier>) =>
    setDraft(prev => {
      const next = [...prev.tiers].sort((a, b) => a.from - b.from);
      next[i] = { ...next[i], ...patch };
      return { ...prev, tiers: next };
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/referral/incentive-rules', { method: 'POST', body: draft });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const drop = async (row: RuleSet) => {
    if (!row.id) return;
    const ok = await confirmDanger(
      `${row.effectiveFrom}부터 쓰던 표를 지울까요?`,
      '그 뒤의 달은 바로 앞 표로 다시 계산됩니다 — 이미 나간 급여와 달라질 수 있습니다.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      setSaved(await api<RuleSet[]>(`/referral/incentive-rules/${row.id}`, { method: 'DELETE' }));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '지우지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">요율표 고치기</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          금액은 <b>만원</b>, 요율은 <b>%</b>로 적습니다. <b>적용 시작일</b>이 다르면 새 표로 쌓이고, 같으면
          덮어씁니다 — 그 달에는 그 달에 살아 있던 표로 셈합니다. 이미 나간 급여가 뒤에서 바뀌지 않게 하려는
          것입니다.
        </p>

        <div className="-mr-2 mt-3 min-h-0 flex-1 overflow-y-auto pr-2">
          {/* 적어 둔 표 — 눌러서 그 표를 고친다 */}
          {saved.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {saved.map(r => (
                <span key={r.id} className="inline-flex items-center">
                  <button
                    onClick={() => setDraft({ ...r, tiers: [...r.tiers] })}
                    className={`rounded-l-lg border py-1 pl-2.5 pr-2 text-xs font-semibold ${
                      draft.effectiveFrom === r.effectiveFrom
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                    title={r.updatedBy ? `${r.updatedBy} 고침` : undefined}
                  >
                    {r.effectiveFrom}~
                  </button>
                  <button
                    onClick={() => void drop(r)}
                    disabled={busy}
                    className="rounded-r-lg border border-l-0 border-slate-200 bg-white px-1.5 py-1 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="이 표 지우기"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
              {/* 다음 달부터 바꿀 때가 제일 잦다 — 눌러서 지금 표를 베낀다 */}
              <button
                onClick={() =>
                  setDraft(prev => ({
                    ...prev,
                    id: undefined,
                    effectiveFrom: dayjs().add(1, 'month').startOf('month').format('YYYY-MM-DD'),
                  }))
                }
                className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                <Plus size={11} className="inline" /> 다음 달부터 새 표
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="적용 시작일" hint="이 날부터">
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={e => setDraft(prev => ({ ...prev, effectiveFrom: e.target.value }))}
                className={`${BOX} w-full`}
              />
            </Field>
            <Field label="인센티브 기준선" hint="만원 · 이 아래는 기본급만">
              <input
                value={toMan(draft.floor)}
                onChange={e => setDraft(prev => ({ ...prev, floor: fromMan(e.target.value) }))}
                inputMode="numeric"
                className={`${BOX} w-full text-right`}
              />
            </Field>
            <Field label="기본 기본급" hint="만원 · 근속을 안 적었을 때">
              <input
                value={toMan(draft.baseSalaryDefault)}
                onChange={e => setDraft(prev => ({ ...prev, baseSalaryDefault: fromMan(e.target.value) }))}
                inputMode="numeric"
                className={`${BOX} w-full text-right`}
              />
            </Field>
          </div>

          {/* 달성 구간 */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700">달성 구간 (월 알선 총액 기준)</p>
              <button
                onClick={() =>
                  setDraft(prev => ({
                    ...prev,
                    tiers: [...prev.tiers, { tier: `${prev.tiers.length + 1}구간`, from: 0, rate: 0 }],
                  }))
                }
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Plus size={11} className="inline" /> 구간 추가
              </button>
            </div>
            {/*
              달성액에 '닿으면' 그 요율이 되고 다음 달성액 전까지 그대로다.
              800만에 45%면 944만도 45%고, 1,000만에 닿아야 50%가 된다.
            */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-2.5 py-2 font-medium">이름</th>
                    <th className="px-2.5 py-2 text-right font-medium">달성액(만원)부터</th>
                    <th className="px-2.5 py-2 text-right font-medium">요율(%)</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => (
                    <tr key={`${t.tier}-${i}`} className="border-t border-slate-50">
                      <td className="px-2.5 py-1.5">
                        <input
                          value={t.tier}
                          onChange={e => setTier(i, { tier: e.target.value })}
                          placeholder="1구간"
                          className={`${BOX} w-32`}
                        />
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <input
                          value={toMan(t.from)}
                          onChange={e => setTier(i, { from: fromMan(e.target.value) })}
                          inputMode="numeric"
                          placeholder="200"
                          className={`${BOX} w-28 text-right`}
                        />
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <input
                          value={toPct(t.rate)}
                          onChange={e => setTier(i, { rate: fromPct(e.target.value) })}
                          inputMode="decimal"
                          placeholder="20"
                          className={`${BOX} w-20 text-right`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() =>
                            setDraft(prev => ({
                              ...prev,
                              tiers: [...prev.tiers].sort((a, b) => a.from - b.from).filter((_, j) => j !== i),
                            }))
                          }
                          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                          aria-label="구간 지우기"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              적힌 달성액에 <b>닿으면</b> 그 요율이 되고, 다음 달성액 전까지 그대로입니다 — 800만에 45%면 944만도
              45%이고, 1,000만에 닿아야 50%가 됩니다. 요율은 초과분(총액 − 기본급)에 곱합니다.
            </p>
          </div>

          {/* 근속 기본급 */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700">근속 기본급 (만원)</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setDraft(prev => ({ ...prev, tenure: [...prev.tenure, prev.tenure.at(-1) ?? 0] }))}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <Plus size={11} className="inline" /> 연차 추가
                </button>
                <button
                  onClick={() => setDraft(prev => ({ ...prev, tenure: prev.tenure.slice(0, -1) }))}
                  disabled={draft.tenure.length <= 1}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  마지막 빼기
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.tenure.map((v, i) => (
                <label key={i} className="text-xs text-slate-500">
                  {i}년
                  <input
                    value={toMan(v)}
                    onChange={e =>
                      setDraft(prev => ({
                        ...prev,
                        tenure: prev.tenure.map((x, j) => (j === i ? fromMan(e.target.value) : x)),
                      }))
                    }
                    inputMode="numeric"
                    className={`${BOX} mt-0.5 block w-20 text-right`}
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">마지막 연차 값에서 멈춥니다 — 그보다 오래 다녀도 같습니다.</p>
          </div>

          {/* 팀장 */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-bold text-slate-700">팀장</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="기본급" hint="만원">
                <input
                  value={toMan(draft.leader.baseSalary)}
                  onChange={e =>
                    setDraft(prev => ({ ...prev, leader: { ...prev.leader, baseSalary: fromMan(e.target.value) } }))
                  }
                  inputMode="numeric"
                  className={`${BOX} w-full text-right`}
                />
              </Field>
              <Field label="관리 수당" hint="%">
                <input
                  value={toPct(draft.leader.defaultRate)}
                  onChange={e =>
                    setDraft(prev => ({ ...prev, leader: { ...prev.leader, defaultRate: fromPct(e.target.value) } }))
                  }
                  inputMode="decimal"
                  className={`${BOX} w-full text-right`}
                />
              </Field>
              <Field label="목표 달성 시" hint="%">
                <input
                  value={toPct(draft.leader.targetRate)}
                  onChange={e =>
                    setDraft(prev => ({ ...prev, leader: { ...prev.leader, targetRate: fromPct(e.target.value) } }))
                  }
                  inputMode="decimal"
                  className={`${BOX} w-full text-right`}
                />
              </Field>
              <Field label="본인 최소 실적" hint="만원">
                <input
                  value={toMan(draft.leader.minPersonalSales)}
                  onChange={e =>
                    setDraft(prev => ({
                      ...prev,
                      leader: { ...prev.leader, minPersonalSales: fromMan(e.target.value) },
                    }))
                  }
                  inputMode="numeric"
                  className={`${BOX} w-full text-right`}
                />
              </Field>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              관리 수당은 팀원 알선 합계에 붙습니다 — 팀원 수수료는 안 깎이고 회사 마진에서 나갑니다. 팀장 본인이
              최소 실적에 못 닿은 달은 안 줍니다.
            </p>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {draft.updatedBy && (
            <span className="mr-auto text-[11px] text-slate-400">
              마지막으로 고친 사람 {draft.updatedBy}
              {draft.updatedAt && ` · ${dayjs(draft.updatedAt).format('YYYY-MM-DD HH:mm')}`}
            </span>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
