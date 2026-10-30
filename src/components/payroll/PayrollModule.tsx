import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Lock, Plus, Trash2, Wallet } from 'lucide-react';
import { api, ApiError, getPayrollPass, setPayrollPass } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import type { PayrollEntry } from '../../types';

/**
 * 인건비.
 *
 * 종이로 돌던 급여표를 그대로 옮긴 것이다 — 급여, 회사공제, 본인공제, 식대, 실 이체.
 *
 * 실 이체액은 저장하지 않는다. 급여에서 공제를 빼고 식대를 더하면 나오는 값이라,
 * 저장해 두면 금액을 고쳤을 때 둘이 어긋난다. 볼 때마다 다시 낸다.
 *
 * 로그인만으로는 안 열린다. 보는 사람을 이름으로 좁히고 번호를 한 번 더 받는다 —
 * 자리를 비운 사이 남의 급여가 열린 채로 있으면 안 된다.
 */

/*
  칸마다 너비를 따로 준다 — 여기에 w-full 을 같이 넣으면 둘이 부딪쳐 칸이 찌그러진다.
*/
const INPUT =
  'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

/** 돈 칸에 쓰는 너비 — 천만 단위까지 쉼표를 넣어도 안 잘린다 */
const MONEY_W = 'w-28';

/*
  숫자 칸의 오른끝을 맞춘다.

  제목과 셈한 값은 칸 끝에 붙는데 적는 칸은 테두리와 안쪽 여백만큼 안으로 들어와 있다 —
  그래서 급여·공제는 한 줄로 안 서고 식대·실 이체만 바깥으로 튀어나와 보였다.
  적는 칸 안쪽 여백(px-2 8px)에 테두리 1px 을 더한 만큼 제목과 셈한 값을 안으로 민다.
*/
const NUM_PAD = 'pr-[9px]';

/** 공제를 누가 지는가 — 종이에 적혀 있던 말 그대로 */
const BURDENS = ['본인all', '세금 all 회사부담', '공제없음'];

/**
 * 실 이체 = 급여 + 인센티브 − 회사공제 − 본인공제 ± 식대
 *
 * 식대는 따로 챙겨 주는 돈이다 — 급여에 더한다.
 *
 * 처음에는 빼기로 뒀었다. 구내식당은 회사가 식당에 직접 내니 밥을 현물로 준 셈이고,
 * 급여에 또 얹으면 두 번 주는 것이라고 봤다. 그런데 우리는 식대를 따로 더 챙겨 준다 —
 * 그렇게 두는 바람에 하루 구천 원씩 급여에서 빠지고 있었다.
 *
 * 상계(빼기)로도 둘 수 있게는 남겨 둔다. 식당 값을 회사가 내고 그만큼 급여에서 빼는
 * 방식으로 바뀔 수 있다 — 화면 위에서 고르고, 고른 것은 그 브라우저에 남는다.
 */
function netOf(r: PayrollEntry, meal: number, offset: boolean): number {
  // 인센티브는 급여와 따로 적지만 통장에서는 같이 나간다
  return r.monthlyPay + r.incentive - r.companyDeduction - r.selfDeduction + (offset ? -meal : meal);
}

/** 식대를 상계(차감)할지 — 켜 두면 급여에서 뺀다. 기본은 더하기다 */
const LS_MEAL_OFFSET = 'payrollMealOffset';

/** 그 달 식비 — 서버가 근태를 세어 내려준다 */
interface MealRow {
  name: string;
  days: number;
  amount: number;
  /** 근태로 낸 값 — 손으로 고친 줄에서 원래 얼마였는지 */
  autoAmount?: number;
  /** 손으로 고친 줄인가 */
  edited?: boolean;
  editedBy?: string;
}
interface Meal {
  month: string;
  perDay: number;
  inBy: string;
  outFrom: string;
  rows: MealRow[];
}

export default function PayrollModule() {
  const [rows, setRows] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  /*
    식비는 적는 값이 아니라 근태에서 나오는 값이다.

    9시 30분까지 찍고 6시를 넘겨 찍은 날만 하루 9,000원. 달마다 달라서 어느 달인지 같이
    고른다 — 지난달 급여를 낼 때 이번 달 근태로 세면 안 된다.
  */
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [meal, setMeal] = useState<Meal | null>(null);
  /* 구내식당은 회사가 직접 내므로 급여에서 빼는 게 기본이다 */
  /*
    기본은 더하기다.

    'offset' 이라고 적어 둔 사람만 뺀다 — 전에는 반대로 두어서, 아무것도 안 고른 사람은
    모두 상계로 보고 하루 구천 원씩 빠진 금액을 보고 있었다.
  */
  const [mealOffset, setMealOffset] = useState(() => localStorage.getItem(LS_MEAL_OFFSET) === 'offset');

  // 잠금 — 번호를 받기 전에는 아무것도 안 보여준다
  const [locked, setLocked] = useState(!getPayrollPass());
  const [denied, setDenied] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<PayrollEntry[]>('/payroll'));
      setDenied(false);
      setLocked(false);
    } catch (e) {
      // 통행증이 시간 지나 막힌 것과, 아예 볼 수 없는 계정을 갈라 본다
      if (e instanceof ApiError && e.code === 'PAYROLL_LOCKED') {
        setPayrollPass(null);
        setLocked(true);
      } else if (e instanceof ApiError && e.status === 403) {
        setDenied(true);
      } else {
        void alertError('불러오지 못했습니다', e instanceof ApiError ? e.message : '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = async () => {
    setUnlocking(true);
    setCodeError(null);
    try {
      const res = await api<{ pass: string }>('/payroll/unlock', { method: 'POST', body: { code } });
      setPayrollPass(res.pass);
      setCode('');
      setLocked(false);
      await load();
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.message : '열지 못했습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  const patch = async (row: PayrollEntry, body: Partial<PayrollEntry>) => {
    setBusyId(row.id);
    try {
      await api(`/payroll/${row.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    try {
      await api('/payroll', { method: 'POST', body: { name: '새 직원' } });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: PayrollEntry) => {
    const ok = await confirmDanger(
      `${row.name} 줄을 지울까요?`,
      '그만둔 분이면 지우지 말고 [지급중] 체크를 풀어 주세요 — 지난 달 인건비도 기록입니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/payroll/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  /* 근태에서 식비를 받아온다 — 달을 바꾸거나 잠금이 풀리면 다시 받는다 */
  const loadMeal = useCallback(async () => {
    if (locked || denied) return;
    try {
      setMeal(await api<Meal>(`/payroll/meal?month=${month}`));
    } catch {
      // 못 받아오면 식대는 0으로 둔다 — 모르는 값을 준 것으로 세지 않는다
      setMeal(null);
    }
  }, [locked, denied, month]);

  useEffect(() => {
    void loadMeal();
  }, [loadMeal]);

  /** 이름으로 찾는 그 사람 식비 */
  const mealOf = useCallback(
    (name: string): MealRow => {
      const hit = meal?.rows.find(x => x.name === name.trim());
      return hit ?? { name, days: 0, amount: 0, autoAmount: 0, edited: false };
    },
    [meal],
  );

  /**
   * 그 달 식대를 고친다.
   *
   * 근태로 내는 값이지만, 찍고 나가서 밖에서 먹은 날이나 찍는 걸 잊은 날처럼 찍힌 것과
   * 먹은 것이 안 맞는 달이 있다.
   *
   * 칸을 비우면 다시 근태로 낸 값으로 돌아간다 — 따로 되돌리기 단추를 내는 것보다
   * 한 칸을 비우는 쪽이 적는 사람에게 자연스럽다.
   */
  const saveMeal = async (name: string, text: string) => {
    const blank = text.trim() === '';
    try {
      setMeal(
        await api<Meal>('/payroll/meal', {
          method: 'POST',
          body: { month, name, amount: blank ? -1 : Number(digitsOnly(text)) || 0 },
        }),
      );
    } catch (e) {
      void alertError('식대를 저장하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const shown = rows.filter(r => showInactive || r.active);

  const totals = useMemo(() => {
    const live = rows.filter(r => r.active);
    return {
      count: live.length,
      pay: live.reduce((s, r) => s + r.monthlyPay, 0),
      incentive: live.reduce((s, r) => s + r.incentive, 0),
      company: live.reduce((s, r) => s + r.companyDeduction, 0),
      self: live.reduce((s, r) => s + r.selfDeduction, 0),
      meal: live.reduce((s, r) => s + mealOf(r.name).amount, 0),
      net: live.reduce((s, r) => s + netOf(r, mealOf(r.name).amount, mealOffset), 0),
      days: live.reduce((s, r) => s + mealOf(r.name).days, 0),
    };
  }, [rows, mealOf, mealOffset]);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Lock size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">인건비는 정해진 분만 볼 수 있습니다.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Lock size={26} className="mx-auto text-indigo-500" />
          <h1 className="mt-3 text-base font-bold text-slate-800">인건비</h1>
          <p className="mt-1 text-xs text-slate-500">번호를 넣어 주세요. 창을 닫으면 다시 물어봅니다.</p>
          <input
            type="password"
            value={code}
            onChange={e => {
              setCode(e.target.value);
              setCodeError(null);
            }}
            onKeyDown={e => e.key === 'Enter' && void unlock()}
            placeholder="••••"
            className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-indigo-400"
          />
          {codeError && <p className="mt-2 text-xs font-medium text-red-500">{codeError}</p>}
          <button
            onClick={() => void unlock()}
            disabled={unlocking || !code.trim()}
            className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {unlocking ? '여는 중…' : '열기'}
          </button>
        </div>
      </div>
    );
  }

  /* 이 화면도 사무실 PC 에서만 본다 — 가운데 좁게 모으면 열두 칸짜리 표가 잘린다 */
  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold text-slate-900">
            <Wallet size={18} className="text-indigo-600" /> 인건비
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            급여에서 공제를 빼고 식대를 {mealOffset ? <b>상계(차감)</b> : <b>더한</b>} <b>실 이체액</b>을 자동으로
            냅니다 — 금액을 고치면 바로 따라갑니다.
            <br />
            식대는 근태에서 냅니다 — <b>{meal?.inBy ?? '09:30'}까지 찍고 {meal?.outFrom ?? '18:00'}을 넘겨 찍은 날</b>만
            하루 {(meal?.perDay ?? 9000).toLocaleString()}원입니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/*
            식대는 따로 챙겨 주는 돈이라 급여에 더한다 — 그게 기본이다.

            상계는 식당 값을 회사가 내고 그만큼 급여에서 빼는 방식이다. 그렇게 바뀔 수
            있어 고르는 자리는 남겨 둔다.
          */}
          <label className="text-xs text-slate-500">
            식대 처리
            <select
              value={mealOffset ? 'offset' : 'add'}
              onChange={e => {
                const next = e.target.value === 'offset';
                setMealOffset(next);
                localStorage.setItem(LS_MEAL_OFFSET, next ? 'offset' : 'add');
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            >
              <option value="add">더하기(급여에 얹음) — 기본</option>
              <option value="offset">상계(급여에서 뺌)</option>
            </select>
          </label>
          {/* 어느 달 근태로 식비를 낼지 — 지난달 급여를 이번 달 근태로 세면 안 된다 */}
          <label className="text-xs text-slate-500">
            식대 기준 달
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </label>
          <button
            onClick={() => void addRow()}
            className="flex items-center gap-1.5 self-end rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> 직원 추가
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-3.5 py-2.5">
          <p className="text-xs font-medium text-indigo-700/80">한 달 실 이체</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {totals.net.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          <p className="text-[11px] text-slate-400">{totals.count}명</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">급여 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totals.pay.toLocaleString()}</p>
          {/* 인센티브는 달마다 바뀌는 값이라 급여와 갈라 적는다 */}
          <p className="text-[11px] text-slate-400">
            {totals.incentive > 0 ? `인센티브 ${totals.incentive.toLocaleString()} 따로` : '인센티브 없음'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">공제 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {(totals.company + totals.self).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">
            회사 {totals.company.toLocaleString()} · 본인 {totals.self.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">식대 합계 {mealOffset && <span className="text-red-500">상계</span>}</p>
          <p className={`mt-1 text-2xl font-bold ${mealOffset ? 'text-red-600' : 'text-slate-800'}`}>
            {mealOffset && '−'}
            {totals.meal.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">
            {dayjs(month).format('M월')} · {totals.days}일 · 하루 {(meal?.perDay ?? 9000).toLocaleString()}원
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          그만둔 분도 보기
        </label>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${shown.length}명`}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-2.5 py-2.5" />
                <th className="px-2.5 py-2.5 font-medium">이름</th>
                <th className="px-2.5 py-2.5 font-medium">직책</th>
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>급여</th>
                {/* 급여 옆에 둔다 — 둘을 더한 값이 그 달에 나가는 돈이다 */}
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>인센티브</th>
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>회사공제</th>
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>본인공제</th>
                <th className="px-2.5 py-2.5 font-medium">부담</th>
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>식대{mealOffset && <span className="ml-0.5 text-red-500">(−)</span>}</th>
                <th className={`px-2.5 py-2.5 text-right font-medium ${NUM_PAD}`}>실 이체</th>
                <th className="px-2.5 py-2.5 font-medium">메모</th>
                <th className="px-2.5 py-2.5 text-center font-medium">지급중</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-8 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '적어둔 인건비가 없습니다. [직원 추가]로 시작하세요.'}
                  </td>
                </tr>
              )}
              {shown.map(r => (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 last:border-0 ${r.active ? '' : 'bg-slate-50/60 text-slate-400'}`}
                >
                  <td className="px-2.5 py-1.5">
                    <button
                      onClick={() => void removeRow(r)}
                      disabled={busyId === r.id}
                      className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      aria-label="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input
                      defaultValue={r.name}
                      onBlur={e => e.target.value.trim() !== r.name && void patch(r, { name: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-24`}
                    />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input
                      defaultValue={r.position}
                      onBlur={e => e.target.value !== r.position && void patch(r, { position: e.target.value })}
                      disabled={busyId === r.id}
                      placeholder="부장"
                      className={`${INPUT} w-20`}
                    />
                  </td>

                  {(['monthlyPay', 'incentive', 'companyDeduction', 'selfDeduction'] as const).map(field => (
                    <td key={field} className="px-2.5 py-1.5 text-right">
                      <input
                        defaultValue={withCommas(String(r[field] || ''))}
                        onBlur={e => {
                          const next = Number(digitsOnly(e.target.value)) || 0;
                          if (next !== r[field]) void patch(r, { [field]: next });
                        }}
                        disabled={busyId === r.id}
                        inputMode="numeric"
                        placeholder="0"
                        className={`${INPUT} ${MONEY_W} text-right`}
                      />
                    </td>
                  ))}

                  <td className="px-2.5 py-1.5">
                    {/* 종이에 적혀 있던 말 그대로 둔다 — '본인all' 같은 표현이 뜻을 더 잘 담는다 */}
                    <input
                      defaultValue={r.burden}
                      onBlur={e => e.target.value !== r.burden && void patch(r, { burden: e.target.value })}
                      disabled={busyId === r.id}
                      list="payroll-burdens"
                      placeholder="공제없음"
                      className={`${INPUT} w-32`}
                    />
                  </td>

                  {/*
                    식대는 근태에서 낸다 — 9:30까지 찍고 18시를 넘겨 찍은 날만 하루치다.

                    그래도 고칠 수 있게 둔다. 찍고 나가서 손님과 밖에서 먹은 날이나 찍는
                    걸 잊은 날처럼 찍힌 것과 먹은 것이 안 맞는 달이 있다.

                    며칠치인지 같이 띄운다 — 금액만 보면 왜 저 값인지 물어볼 데가 없다.
                  */}
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                    <input
                      key={`meal-${month}-${r.id}`}
                      defaultValue={withCommas(String(mealOf(r.name).amount || ''))}
                      onBlur={e => {
                        const next = e.target.value.trim() === '' ? -1 : Number(digitsOnly(e.target.value)) || 0;
                        if (next !== mealOf(r.name).amount) void saveMeal(r.name, e.target.value);
                      }}
                      inputMode="numeric"
                      placeholder={String(mealOf(r.name).autoAmount ?? 0)}
                      title="비우면 근태로 낸 값으로 돌아갑니다"
                      className={`${INPUT} ${MONEY_W} text-right ${
                        mealOf(r.name).edited ? 'border-amber-300 bg-amber-50/60 font-semibold text-amber-800' : ''
                      }`}
                    />
                    <p className="text-[10px] text-slate-400">
                      근태 {mealOf(r.name).days}일
                      {/* 손으로 고친 줄은 원래 얼마였는지 같이 — 말없이 바뀌면 안 된다 */}
                      {mealOf(r.name).edited && (
                        <span className="ml-1 text-amber-600">
                          · 고침(근태 {(mealOf(r.name).autoAmount ?? 0).toLocaleString()})
                        </span>
                      )}
                    </p>
                  </td>

                  {/* 실 이체는 적는 칸이 아니다 — 위 숫자를 고치면 따라온다 */}
                  <td className={`whitespace-nowrap px-2.5 py-1.5 text-right font-bold text-indigo-700 ${NUM_PAD}`}>
                    {netOf(r, mealOf(r.name).amount, mealOffset).toLocaleString()}
                  </td>

                  <td className="px-2.5 py-1.5">
                    <input
                      defaultValue={r.memo}
                      onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                      disabled={busyId === r.id}
                      className={`${INPUT} w-40`}
                    />
                  </td>

                  <td className="px-2.5 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={e => void patch(r, { active: e.target.checked })}
                      disabled={busyId === r.id}
                      className="size-4 accent-indigo-600"
                      aria-label="지급중"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="payroll-burdens">
        {BURDENS.map(b => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <p className="mt-2 text-[11px] text-slate-400">
        칸을 고치고 <b>칸 밖을 누르면 바로 저장</b>됩니다. <b>실 이체 = 급여 + 인센티브 − 회사공제 − 본인공제 +
        식대</b> 로 자동 계산되니 그 칸은 적지 않습니다. 인센티브는 급여와 갈라 적습니다 — 섞어 두면 다음 달에
        어디까지가 기본급이었는지 되짚을 수가 없습니다.
        <br />
        <b>식대</b>는 근태에서 저절로 나오지만 고칠 수 있습니다 — 고친 줄은 노랗게 뜨고, <b>칸을 비우면</b> 다시
        근태로 낸 값으로 돌아갑니다. 달마다 따로 남으니 지난 달 값은 안 움직입니다.
        <br />
        <b>식대</b>도 적는 칸이 아닙니다 — 근태에서 냅니다. {meal?.inBy ?? '09:30'}까지 찍고 {meal?.outFrom ?? '18:00'}을
        넘겨 찍은 날만 하루 {(meal?.perDay ?? 9000).toLocaleString()}원으로 세고, 한쪽만 찍힌 날은 세지 않습니다.
        <br />
        그만둔 분은 지우지 말고 <b>지급중 체크를 풀어</b> 주세요 — 지난 달 인건비도 기록입니다.
      </p>
    </div>
  );
}
