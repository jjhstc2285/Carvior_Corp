import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Download, Phone, Trophy, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 판매를 많이 해 준 딜러 순위.
 *
 * 상조회비를 어디에 계속 낼지 정하려면 '안 파는 곳'만큼 '잘 파는 곳'도 봐야 한다.
 * 이름과 건수는 카비어에 접수된 그대로 세고, 연락처는 우리 장부에서 이름을 짝지어 붙인다.
 *
 * 카비어는 딜러 연락처를 안 준다 — 파트너 API가 내주는 칸은 차량·계약 쪽뿐이고
 * 딜러는 이름 한 줄이 전부다(2026-09 확인). 그래서 장부에 없는 곳은 번호가 빈다.
 *
 * 장부에 적힌 담당자 이름을 같이 보여준다. 카비어에 적힌 사람과 장부에 적힌 사람이
 * 다를 수 있어서, 누구 번호인지 모르고 걸면 엉뚱한 사람에게 간다.
 *
 * 같은 사람이 "기아비제이조윤식" / "기아 비제이 조윤식"처럼 여러 꼴로 접수돼 오므로
 * 띄어쓰기·직함을 걷어내 한 줄로 묶는다. 합친 건 이름 옆에 +N 으로 알린다.
 */

interface Ranking {
  rows: {
    name: string;
    /** 같은 사람인데 다르게 적혀 온 이름들 — 합쳐서 셌다는 표시 */
    aliases: string[];
    count: number;
    completed: number;
    lastAt: string | null;
    ledger: { id: string; dealerName: string; managerName: string; managerPhone: string; monthlyFee: number } | null;
  }[];
  missingPhone: number;
}

export default function DealerRankingModal({ onClose }: { onClose: () => void }) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [data, setData] = useState<Ranking | null>(null);
  const [onlyPhone, setOnlyPhone] = useState(false);

  useEffect(() => {
    void api<Ranking>('/dealer-fees/ranking')
      .then(setData)
      .catch(e => void alertError('순위를 불러오지 못했습니다', e instanceof ApiError ? e.message : ''));
  }, []);

  const rows = (data?.rows ?? []).filter(r => !onlyPhone || r.ledger?.managerPhone);

  const handleExport = () => {
    const sheet = rows.map((r, i) => ({
      순위: i + 1,
      딜러: r.name,
      판매: r.count,
      거래완료: r.completed,
      '최근 판매': r.lastAt ?? '',
      '합친 이름': r.aliases.join(', '),
      '장부 업체명': r.ledger?.dealerName ?? '',
      담당자: r.ledger?.managerName ?? '',
      연락처: r.ledger?.managerPhone ?? '',
      '매달 회비': r.ledger?.monthlyFee ?? 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), '딜러순위');
    XLSX.writeFile(wb, `딜러판매순위_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800">
              <Trophy size={16} className="text-amber-500" /> 딜러 판매 순위
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              카비어에 접수된 이름 그대로 셉니다. 연락처는 우리 장부에서 이름을 짝지어 붙입니다 —
              카비어는 딜러 연락처를 주지 않습니다.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {!data ? (
          <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                딜러 {data.rows.length}명
              </span>
              {data.missingPhone > 0 && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  연락처 없음 {data.missingPhone}명
                </span>
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={onlyPhone}
                  onChange={e => setOnlyPhone(e.target.checked)}
                  className="size-3.5 accent-indigo-600"
                />
                연락처 있는 곳만
              </label>
              <button
                onClick={handleExport}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Download size={13} /> 엑셀
              </button>
            </div>

            <div className="mt-2.5 max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full whitespace-nowrap text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2.5 py-2 font-medium">순위</th>
                    <th className="px-2.5 py-2 font-medium">딜러 (카비어 접수명)</th>
                    <th className="px-2.5 py-2 text-right font-medium">판매</th>
                    <th className="px-2.5 py-2 font-medium">최근</th>
                    <th className="px-2.5 py-2 font-medium">장부 담당자</th>
                    <th className="px-2.5 py-2 font-medium">연락처</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                        접수된 판매가 없습니다.
                      </td>
                    </tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.name} className="border-t border-slate-50">
                      <td className="px-2.5 py-1.5 font-bold text-slate-400">{i + 1}</td>
                      <td className="px-2.5 py-1.5 font-semibold text-slate-700">
                        {r.name}
                        {/* 띄어쓰기·직함이 달라 여러 꼴로 접수된 건 합쳐서 센다 — 합친 걸 모르면 숫자를 못 믿는다 */}
                        {r.aliases.length > 0 && (
                          <span
                            className="ml-1 cursor-help rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500"
                            title={`같은 사람으로 합쳤습니다: ${r.aliases.join(', ')}`}
                          >
                            +{r.aliases.length}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-slate-700">
                        {r.count}
                        {/* 접수만 되고 거래로 안 간 건이 있어 둘을 갈라 보여준다 */}
                        {r.completed !== r.count && (
                          <span className="ml-1 text-[11px] text-slate-400">(완료 {r.completed})</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-400">{r.lastAt ?? '—'}</td>
                      <td className="px-2.5 py-1.5 text-slate-500">
                        {r.ledger ? (
                          <>
                            {r.ledger.managerName || <span className="text-slate-300">이름 없음</span>}
                            <span className="ml-1 text-[11px] text-slate-400">{r.ledger.dealerName}</span>
                          </>
                        ) : (
                          <span className="text-amber-700">장부에 없음</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {r.ledger?.managerPhone ? (
                          // 휴대폰에서 바로 걸 수 있게 — 사무실에서는 그냥 보고 적는다
                          <a
                            href={`tel:${r.ledger.managerPhone.replace(/[^\d+]/g, '')}`}
                            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                          >
                            <Phone size={11} /> {r.ledger.managerPhone}
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[11px] text-slate-400">
              연락처가 비어 있으면 장부에 그 업체가 없거나 담당연락처를 안 적어둔 것입니다 — 장부에 적으면 여기도 채워집니다.
            </p>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
