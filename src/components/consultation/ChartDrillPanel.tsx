import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { effectiveKind } from '../../lib/consultationStats';
import { canonPlatform, platformTone } from '../../lib/platformTone';
import { useEscClose } from '../../lib/useEscClose';
import ConsultationDetailModal from './ConsultationDetailModal';
import {
  CONSULTATION_KIND_COLOR,
  CONSULTATION_KIND_LABEL,
  CONSULTATION_STATUS_LABEL,
  type ConsultationRecord,
} from '../../types';

/**
 * 그래프 한 조각을 누르면 뜨는 목록.
 *
 * 비율만 보면 "판매로 41대"까지만 알고 그게 어느 차인지는 모른다. 숫자가 이상할 때
 * 확인할 데가 없으면 그래프 자체를 안 믿게 된다 — 41을 누르면 그 41대가 뜬다.
 *
 * 세는 자리에서 거른 줄을 그대로 넘겨받는다. 여기서 다시 거르면 그래프와 목록이
 * 어긋날 수 있고, 그러면 어느 쪽이 맞는지 알 수 없다.
 *
 * 읽기만 한다 — 고칠 일이면 줄을 눌러 상세로 넘어간다.
 */
export default function ChartDrillPanel({
  title,
  hint,
  rows,
  onClose,
}: {
  title: string;
  hint?: string;
  rows: ConsultationRecord[];
  onClose: () => void;
}) {
  useEscClose(onClose);

  const { state } = useStore();
  const [open, setOpen] = useState<ConsultationRecord | null>(null);
  const nameOf = (id: string) => state.employees.find(e => e.id === id)?.name ?? '(퇴사자)';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {title}
              <span className="ml-2 text-sm font-medium text-slate-400">{rows.length}건</span>
            </h3>
            {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">해당하는 건이 없습니다.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">상담일</th>
                  <th className="py-1.5 pr-2 font-semibold">종류</th>
                  <th className="py-1.5 pr-2 font-semibold">유입 경로</th>
                  <th className="py-1.5 pr-2 font-semibold">차량번호</th>
                  <th className="py-1.5 pr-2 font-semibold">차명</th>
                  <th className="py-1.5 pr-2 font-semibold">손님번호</th>
                  <th className="py-1.5 pr-2 font-semibold">담당</th>
                  <th className="py-1.5 pr-2 font-semibold">상태</th>
                  <th className="py-1.5 font-semibold">상담 내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => {
                  const k = effectiveKind(c);
                  const route = canonPlatform(c.platform);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setOpen(c)}
                      title="눌러서 상담 상세 보기"
                      className="cursor-pointer border-b border-slate-50 hover:bg-indigo-50/40"
                    >
                      <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-slate-500">
                        {dayjs(c.date).format('YY.MM.DD')}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${CONSULTATION_KIND_COLOR[k].chip}`}>
                          {CONSULTATION_KIND_LABEL[k]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-2">
                        {route ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${platformTone(route).chip}`}>
                            {route}
                          </span>
                        ) : (
                          <span className="text-slate-300">안 적음</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-2 font-bold text-slate-700">{c.vehicleNumber || '—'}</td>
                      <td className="max-w-[14rem] truncate py-1.5 pr-2 text-slate-600" title={c.vehicleName}>
                        {c.vehicleName}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-slate-500">{c.customerPhone}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500">{nameOf(c.employeeId)}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500">
                        {CONSULTATION_STATUS_LABEL[c.status]}
                      </td>
                      {/* 내용이 길다 — 한 줄로 자르고 올려두면 전부 보인다. 줄을 누르면 상세가 뜬다 */}
                      <td className="max-w-[20rem] truncate py-1.5 text-slate-400" title={c.content}>
                        {c.content}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5">
          <p className="text-[11px] text-slate-400">줄을 누르면 상담 상세가 뜹니다.</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 겹쳐 뜬다 — ESC 는 맨 위 창만 닫는다(useEscClose 가 쌓아 둔다) */}
      {open && <ConsultationDetailModal consultation={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
