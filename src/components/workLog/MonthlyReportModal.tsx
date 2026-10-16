import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import type { WorkLog } from '../../types';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 업무일지 월말 보고.
 *
 * 달이 끝나면 누가 무엇을 얼마나 했는지 추려야 하는데, 지금은 주간 보드를 네 번 넘겨
 * 가며 눈으로 센다. 세는 사람마다 숫자가 다르고, 세고 나면 그걸 다시 엑셀에 옮긴다.
 *
 * 여기서 한 번에 낸다. 화면에서 바로 보고 그대로 엑셀로 내린다 — 화면에 보이는 숫자와
 * 받은 파일의 숫자가 같아야 한다. 따로 만들면 반드시 어긋난다.
 *
 * 세는 기준은 사람이다. 한 달 치를 통째로 더하면 '많이 적은 달'인지 '몇 사람이 많이
 * 적은 달'인지 갈리지 않는다.
 */

interface Props {
  onClose: () => void;
}

interface Row {
  employeeId: string;
  name: string;
  position: string;
  department: string;
  total: number;
  done: number;
  /** 일지를 한 줄이라도 적은 날 */
  activeDays: number;
  /** 적은 날 기준 하루 평균 — 안 적은 날까지 나누면 쉰 사람이 성실해 보인다 */
  perDay: number;
  /** 주차별 건수 — 달 안에서 언제 몰렸는지 본다 */
  byWeek: number[];
}

/** 노션 업무일지와 같은 세는 법 — 1일이 낀 주가 그 달의 1주차 */
function weekOf(date: string): number {
  const d = dayjs(date);
  return Math.ceil((d.date() + d.startOf('month').day()) / 7);
}

export default function MonthlyReportModal({ onClose }: Props) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const { state } = useStore();
  const [month, setMonth] = useState(() => dayjs().subtract(1, 'month').startOf('month'));
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = month.format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 관리자는 employeeId 를 비우면 전원이 온다
      setLogs(await api<WorkLog[]>(`/work-logs?from=${from}&to=${to}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : '업무일지를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekCount = useMemo(() => weekOf(to), [to]);

  const rows = useMemo<Row[]>(() => {
    const byPerson = new Map<string, WorkLog[]>();
    for (const log of logs) {
      const bucket = byPerson.get(log.employeeId);
      if (bucket) bucket.push(log);
      else byPerson.set(log.employeeId, [log]);
    }

    return [...byPerson.entries()]
      .map(([employeeId, mine]) => {
        const employee = state.employees.find(e => e.id === employeeId);
        const done = mine.filter(l => l.done).length;
        const activeDays = new Set(mine.map(l => l.date)).size;
        const byWeek = Array.from({ length: weekCount }, (_, i) => mine.filter(l => weekOf(l.date) === i + 1).length);
        return {
          employeeId,
          name: employee?.name ?? '(퇴사/삭제)',
          position: employee?.position ?? '',
          department: employee?.department ?? '',
          total: mine.length,
          done,
          activeDays,
          perDay: activeDays > 0 ? Math.round((mine.length / activeDays) * 10) / 10 : 0,
          byWeek,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [logs, state.employees, weekCount]);

  const sum = useMemo(
    () => ({
      total: rows.reduce((s, r) => s + r.total, 0),
      done: rows.reduce((s, r) => s + r.done, 0),
      people: rows.length,
    }),
    [rows],
  );

  const rate = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

  /**
   * 엑셀로 내린다 — 장을 셋으로 나눈다.
   *
   * 요약만 있으면 "왜 이 사람이 적나" 를 물었을 때 답할 데가 없고, 내역만 있으면 수백
   * 줄을 사람이 다시 센다. 요약·주차별·내역을 같이 넣어 두면 보고 받는 자리에서 바로
   * 파고들 수 있다.
   */
  const download = () => {
    const wb = XLSX.utils.book_new();

    const summary = rows.map((r, i) => ({
      순번: i + 1,
      이름: r.name,
      직급: r.position,
      소속: r.department,
      '작성 건수': r.total,
      완료: r.done,
      미완료: r.total - r.done,
      '완료율(%)': rate(r.done, r.total),
      '작성한 날': r.activeDays,
      '하루 평균': r.perDay,
    }));
    summary.push({
      순번: '' as never,
      이름: '합계',
      직급: '',
      소속: '',
      '작성 건수': sum.total,
      완료: sum.done,
      미완료: sum.total - sum.done,
      '완료율(%)': rate(sum.done, sum.total),
      '작성한 날': '' as never,
      '하루 평균': '' as never,
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), '개인별 요약');

    const weekly = rows.map(r => {
      const row: Record<string, string | number> = { 이름: r.name, 소속: r.department };
      r.byWeek.forEach((n, i) => (row[`${i + 1}주차`] = n));
      row['합계'] = r.total;
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekly), '주차별');

    const detail = [...logs]
      .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder)
      .map(l => ({
        날짜: l.date,
        요일: ['일', '월', '화', '수', '목', '금', '토'][dayjs(l.date).day()],
        주차: `${weekOf(l.date)}주차`,
        이름: state.employees.find(e => e.id === l.employeeId)?.name ?? '',
        내용: l.content,
        완료: l.done ? 'O' : '',
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), '전체 내역');

    XLSX.writeFile(wb, `업무일지_월말보고_${month.format('YYYYMM')}.xlsx`);
  };

  const move = (step: number) => setMonth(prev => prev.add(step, 'month'));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">업무일지 월말 보고</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1 py-0.5">
            <button onClick={() => move(-1)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-24 text-center text-sm font-bold text-slate-700">{month.format('YYYY년 M월')}</span>
            <button
              onClick={() => move(1)}
              disabled={month.isSame(dayjs(), 'month')}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:text-slate-200"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={download}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            <Download size={14} /> 엑셀로 저장
          </button>

          {!loading && rows.length > 0 && (
            <span className="ml-auto text-xs text-slate-500">
              {sum.people}명 · {sum.total.toLocaleString()}건 · 완료 {rate(sum.done, sum.total)}%
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        {loading && <p className="mt-6 text-center text-sm text-slate-400">불러오는 중…</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">{month.format('M월')}에 적힌 업무일지가 없습니다.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-2.5 py-2 font-medium">이름</th>
                  <th className="px-2.5 py-2 font-medium">소속</th>
                  <th className="px-2.5 py-2 text-right font-medium">건수</th>
                  <th className="px-2.5 py-2 text-right font-medium">완료</th>
                  <th className="px-2.5 py-2 font-medium" title="완료 / 작성 건수">
                    완료율
                  </th>
                  <th className="px-2.5 py-2 text-right font-medium" title="일지를 한 줄이라도 적은 날">
                    적은 날
                  </th>
                  <th className="px-2.5 py-2 text-right font-medium" title="적은 날 기준 — 안 적은 날은 안 나눈다">
                    하루 평균
                  </th>
                  {Array.from({ length: weekCount }, (_, i) => (
                    <th key={i} className="px-2 py-2 text-right text-xs font-medium text-slate-400">
                      {i + 1}주
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.employeeId} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-slate-700">
                      {r.name}
                      {r.position && <span className="ml-1 text-xs text-slate-400">{r.position}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-slate-500">{r.department}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-slate-800">{r.total}</td>
                    <td className="px-2.5 py-1.5 text-right text-slate-600">{r.done}</td>
                    <td className="px-2.5 py-1.5">
                      {/* 막대로 같이 보여 준다 — 숫자만 스무 줄이면 견줘 읽기가 어렵다 */}
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`block h-full rounded-full ${
                              rate(r.done, r.total) >= 80
                                ? 'bg-emerald-500'
                                : rate(r.done, r.total) >= 50
                                  ? 'bg-amber-400'
                                  : 'bg-red-400'
                            }`}
                            style={{ width: `${rate(r.done, r.total)}%` }}
                          />
                        </span>
                        <span className="text-xs text-slate-500">{rate(r.done, r.total)}%</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-slate-600">{r.activeDays}</td>
                    <td className="px-2.5 py-1.5 text-right text-slate-600">{r.perDay}</td>
                    {r.byWeek.map((n, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right text-xs ${n === 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                        {n || '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-bold text-slate-800">
                <tr>
                  <td className="px-2.5 py-2">합계</td>
                  <td />
                  <td className="px-2.5 py-2 text-right">{sum.total}</td>
                  <td className="px-2.5 py-2 text-right">{sum.done}</td>
                  <td className="px-2.5 py-2 text-xs">{rate(sum.done, sum.total)}%</td>
                  <td colSpan={2 + weekCount} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          엑셀은 장이 셋입니다 — <b>개인별 요약</b> · <b>주차별</b> · <b>전체 내역</b>. 화면에 보이는 숫자와 받은 파일의
          숫자는 같습니다.
          <br />
          &lsquo;하루 평균&rsquo;은 <b>적은 날</b>로만 나눕니다. 안 적은 날까지 나누면 쉰 사람이 성실해 보입니다.
        </p>
      </div>
    </div>
  );
}
