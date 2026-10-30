import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Lock, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { api, ApiError, getPayrollPass, setPayrollPass } from '../../lib/api';

/**
 * 애니원모터스 모니터링 — 상사에 달마다 얼마가 들어오고 얼마가 나가는가.
 *
 * 차 한 대를 팔면 매도비가 상사로 들어오고, 인건비·월세는 달마다 그대로 나간다.
 * 지금까지 그 둘을 한자리에서 본 적이 없다 — 인건비는 인건비 화면에, 월세는 부동산
 * 화면에, 판 대수는 매입 관리에 있어서, 달이 끝나고 남았는지 모자랐는지를 대표가
 * 머릿속으로 더해야 했다.
 *
 * 대표만 본다. 번호는 인건비와 같다 — 여기 나가는 돈의 절반이 인건비라, 외울 번호를
 * 둘로 늘릴 까닭이 없다.
 *
 * 고정비는 지금 적혀 있는 값으로 센다. 인건비·월세는 달마다 따로 적어 두는 자리가
 * 아니라서 지난 달도 지금 값으로 셈한다 — 그걸 화면에 적어 둔다. 안 적어 두면 지난
 * 달 숫자가 왜 어제와 다른지 묻게 된다.
 */

interface Month {
  month: string;
  cars: { own: number; brokerage: number; export: number; total: number };
  income: { saleFee: number; margin: number; brokerage: number; rent: number; total: number };
  outgo: {
    payroll: number;
    meal: number;
    rent: number;
    etc: number;
    ad: number;
    platform: number;
    share: number;
    total: number;
  };
  net: number;
}

const NUM = (n: number) => n.toLocaleString();

/** 원 → 만원. 억대 숫자는 원으로 늘어놓으면 자릿수를 세게 된다 */
const MAN = (n: number) => `${Math.round(n / 10_000).toLocaleString()}만`;

export default function MonitoringModule() {
  const [locked, setLocked] = useState(!getPayrollPass());
  const [denied, setDenied] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [perCar, setPerCar] = useState(440_000);
  const [rows, setRows] = useState<Month[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [span, setSpan] = useState(6);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ perCar: number; months: Month[] }>(`/monitoring?months=${span}`);
      setPerCar(res.perCar);
      setRows(res.months);
    } catch (e) {
      /* 통행증이 시간 지나 막히면 다시 잠근다 — 안 그러면 화면만 열린 채 빈칸이 된다 */
      if (e instanceof ApiError && e.code === 'PAYROLL_LOCKED') {
        setPayrollPass(null);
        setLocked(true);
      } else if (e instanceof ApiError && e.status === 403) {
        setDenied(true);
      } else {
        setError(e instanceof ApiError ? e.message : '가져오지 못했습니다.');
      }
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [span]);

  useEffect(() => {
    if (locked || denied) return;
    void load();
  }, [locked, denied, load]);

  const unlock = async () => {
    setUnlocking(true);
    setCodeError(null);
    try {
      const res = await api<{ pass: string }>('/payroll/unlock', { method: 'POST', body: { code } });
      setPayrollPass(res.pass);
      setCode('');
      setLocked(false);
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.message : '열지 못했습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Lock size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">모니터링은 대표님만 볼 수 있습니다.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Lock size={26} className="mx-auto text-indigo-500" />
          <h1 className="mt-3 text-base font-bold text-slate-800">애니원모터스 모니터링</h1>
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

  /* 맨 위가 이번 달이다 — 서버가 최근 달부터 내려준다 */
  const now = rows[0];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">애니원모터스 모니터링</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            차 한 대를 팔면 매도비 <b className="text-slate-600">{NUM(perCar)}원</b>이 상사로 들어옵니다 · 인건비와
            월세는 달마다 그대로 나갑니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            {[6, 12, 24].map(n => (
              <button
                key={n}
                onClick={() => setSpan(n)}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  span === n ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                {n}개월
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* 이번 달 — 셋만 크게. 그 아래에 무엇이 더해졌는지 적는다 */}
      {now && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3.5">
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-700/80">
              <TrendingUp size={13} /> {dayjs(now.month).format('M월')} 들어온 돈
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{NUM(now.income.total)}</p>
            <p className="mt-0.5 text-[11px] text-emerald-700/70">
              매도비 {MAN(now.income.saleFee)} ({now.cars.total}대) · 판매마진 {MAN(now.income.margin)} · 알선수익금{' '}
              {MAN(now.income.brokerage)} · 임대 {MAN(now.income.rent)}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 px-4 py-3.5">
            <p className="flex items-center gap-1 text-xs font-medium text-rose-700/80">
              <TrendingDown size={13} /> {dayjs(now.month).format('M월')} 나간 돈
            </p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{NUM(now.outgo.total)}</p>
            <p className="mt-0.5 text-[11px] text-rose-700/70">
              인건비 {MAN(now.outgo.payroll + now.outgo.meal)} · 월세 {MAN(now.outgo.rent)} · 광고비{' '}
              {MAN(now.outgo.ad)} · 부대 {MAN(now.outgo.etc)} · 매입플랫폼 {MAN(now.outgo.platform)} · 알선정산{' '}
              {MAN(now.outgo.share)}
            </p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-3.5 ${
              now.net >= 0 ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <p className="text-xs font-medium text-slate-500">{dayjs(now.month).format('M월')} 남은 돈</p>
            <p className={`mt-1 text-2xl font-bold ${now.net >= 0 ? 'text-indigo-700' : 'text-slate-700'}`}>
              {NUM(now.net)}
            </p>
            {/* 몇 대를 더 팔아야 본전인지 — '얼마 모자라다'보다 이쪽이 바로 움직일 수 있는 말이다 */}
            <p className="mt-0.5 text-[11px] text-slate-400">
              {now.net >= 0
                ? '들어온 돈이 더 많습니다'
                : `본전까지 ${Math.ceil(-now.net / perCar).toLocaleString()}대 더`}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-3 font-medium">달</th>
                <th className="px-3 py-3 text-right font-medium">매도 대수</th>
                <th className="px-3 py-3 text-right font-medium">매도비</th>
                <th className="px-3 py-3 text-right font-medium" title="매입 정산의 판매수익 — 그 차가 나간 달로 셉니다">
                  판매마진
                </th>
                <th className="px-3 py-3 text-right font-medium" title="현금 수수료 + 할부 피 + 보험 피 + 차대금업">
                  알선수익금
                </th>
                <th className="px-3 py-3 text-right font-medium">임대 수입</th>
                <th className="px-3 py-3 text-right font-semibold text-emerald-700">들어온 돈</th>
                <th className="px-3 py-3 text-right font-medium">인건비</th>
                <th className="px-3 py-3 text-right font-medium">식대</th>
                <th className="px-3 py-3 text-right font-medium">월세</th>
                <th className="px-3 py-3 text-right font-medium">부대비용</th>
                <th className="px-3 py-3 text-right font-medium" title="엔카 약정(대당 × 그 달 올린 대수) + 달마다 적는 채널">
                  광고비
                </th>
                <th className="px-3 py-3 text-right font-medium" title="헤이딜러 · 경매장 · 카비어처럼 차를 사 오는 데 든 수수료">
                  매입플랫폼
                </th>
                <th className="px-3 py-3 text-right font-medium" title="알선 수익금 중 담당자에게 돌아가는 몫">
                  알선정산
                </th>
                <th className="px-3 py-3 text-right font-semibold text-rose-700">나간 돈</th>
                <th className="px-3 py-3 text-right font-bold text-slate-700">남은 돈</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !busy && (
                <tr>
                  <td colSpan={16} className="px-5 py-10 text-center text-sm text-slate-400">
                    볼 달이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map(m => (
                <tr key={m.month} className="border-b border-slate-50 tabular-nums last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-bold text-slate-800">{dayjs(m.month).format('YYYY년 M월')}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold text-slate-700">{m.cars.total}</span>
                    {/* 어디서 나온 대수인지 — 출고·알선·수출을 한 줄로 */}
                    <span className="ml-1 text-[11px] text-slate-400">
                      출고 {m.cars.own} · 알선 {m.cars.brokerage} · 수출 {m.cars.export}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.income.saleFee)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.income.margin)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.income.brokerage)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.income.rent)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{NUM(m.income.total)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.payroll)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.meal)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.rent)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.etc)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.ad)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.platform)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{NUM(m.outgo.share)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-rose-700">{NUM(m.outgo.total)}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-bold ${m.net >= 0 ? 'text-indigo-700' : 'text-red-600'}`}
                  >
                    {NUM(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        어디서 온 숫자인지 적어 둔다.

        특히 고정비가 '지금 값'이라는 걸 안 적으면, 사람이 들고 나거나 월세가 바뀐 다음
        날 지난 달 숫자가 왜 어제와 다른지 묻게 된다.
      */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        <p>
          <b className="text-slate-700">매도 대수</b>는 그 달에 출고한 우리 차 + 알선 + 수출입니다. 같은 차가 두 군데에
          걸려 있으면 한 번만 셉니다 — 매도비가 두 번 붙으면 안 됩니다.
        </p>
        <p className="mt-0.5">
          <b className="text-slate-700">인건비 · 월세 · 부대비용은 지금 적혀 있는 값</b>입니다. 달마다 따로 적어 두는
          자리가 아니라서 지난 달도 지금 값으로 셉니다 — 사람이 들고 나거나 월세가 바뀌면 지난 달 숫자도 같이
          움직입니다. 인건비 화면과 부동산 화면에서 고치면 여기도 바뀝니다.
        </p>
        <p className="mt-0.5">
          <b className="text-slate-700">식대 · 광고비 · 매입플랫폼 · 판매마진 · 알선수익금</b>은 달마다 다릅니다.
          식대는 그 달 근태를 세어 내고(인건비 화면과 같은 자), 광고비는 엔카 약정(대당 × 그 달 올린 대수)에 달마다
          적는 채널(구글 애즈 · 114 · 알바천국 …)을 더합니다. 매입플랫폼은 헤이딜러 · 경매장 · 카비어처럼 차를 사 오는
          데 든 수수료입니다.
        </p>
        <p className="mt-0.5">
          <b className="text-slate-700">판매마진</b>은 매입 정산의 판매수익입니다 — 매입가 · 이전비 · 구전 · 상품화 ·
          차량비용을 다 뺀 값이라 여기서 다시 세지 않습니다. <b className="text-slate-700">그 차가 나간 달</b>로
          셉니다(정산에 적힌 날은 사온 날이라 8월에 사서 10월에 판 차가 8월에 얹히면 안 됩니다).
        </p>
        <p className="mt-0.5">
          <b className="text-slate-700">알선수익금</b>은 현금 수수료 + 할부 피 + 보험 피 + 차대금업이고, 그중 담당자
          몫(정산받을금액)은 나간 돈의 <b className="text-slate-700">알선정산</b>에 들어갑니다 — 번 돈이 들어오고
          그중 일부가 나갑니다.
        </p>
      </div>
    </div>
  );
}
