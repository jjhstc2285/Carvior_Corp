import dayjs from 'dayjs';
import type { ApprovalDocument } from '../../types';

/**
 * 시말서 — 회사 종이 양식 그대로.
 *
 * 뽑아서 결재를 받는 종이라 화면과 종이가 달라서는 안 된다. 받는 쪽이 매번 "우리
 * 양식이 아닌데"가 되고, 그러면 결국 한글 파일을 따로 띄워 옮겨 적게 된다.
 *
 * 도장은 안 넣는다. 결재란을 비워서 뽑고 손으로 찍는다 — 화면에서 찍은 도장은
 * 종이에 찍은 것과 뜻이 다르다.
 *
 * 칸은 비어 있어도 그린다. 네모가 사라지면 종이 생김새가 달라지고, 적을 자리가 비어
 * 있다는 것 자체도 보는 사람에게는 뜻이 있다.
 */

/** 2026-10-19 → "2026 년 10 월 19 일". 양식이 그렇게 적혀 있다 */
function korDate(day?: string | null): string {
  if (!day) return '20      년        월        일';
  const d = dayjs(day);
  return `${d.format('YYYY')} 년  ${d.format('M')} 월  ${d.format('D')} 일`;
}

const CELL = 'border border-slate-800 px-3 py-2 align-top';
const HEAD = `${CELL} bg-slate-50 text-center font-bold whitespace-nowrap print:bg-white`;

function Section({ no, title, hint, body }: { no: number; title: string; hint: string; body: string }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="mb-1.5 text-center text-[15px] font-bold text-slate-900">
        {no}. {title}
      </h3>
      <div className="min-h-28 whitespace-pre-wrap border border-slate-800 px-4 py-3 text-[13px] leading-relaxed text-slate-900">
        {/* 안 적은 칸에는 양식의 안내문을 흐리게 남긴다 — 무엇을 적는 자리인지는 남아야 한다 */}
        {body || <span className="text-slate-400">{hint}</span>}
      </div>
    </section>
  );
}

export default function IncidentReportPaper({ doc }: { doc: ApprovalDocument }) {
  return (
    <div className="text-slate-900">
      {/* 머리 — 왼쪽에 회사 이름, 오른쪽에 결재란(비워서 뽑는다) */}
      <div className="flex items-start justify-between gap-4">
        <p className="pt-3 text-base font-bold">애니원모터스</p>
        <table className="border-collapse text-xs">
          <tbody>
            <tr>
              {['담당', '관리자', '대표이사'].map(t => (
                <th key={t} className="w-20 border border-slate-800 px-2 py-1 text-center font-bold">
                  {t}
                </th>
              ))}
            </tr>
            <tr>
              {['담당', '관리자', '대표이사'].map(t => (
                <td key={t} className="h-14 border border-slate-800" />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-center text-3xl font-bold tracking-[0.5em] text-slate-900">시 말 서</h2>

      <table className="mt-6 w-full border-collapse text-[13px]">
        <tbody>
          <tr>
            <th className={`${HEAD} w-28`}>소속 부서</th>
            <td className={CELL}>{doc.department || ''}</td>
            <th className={`${HEAD} w-28`}>직위 / 직책</th>
            <td className={CELL}>{doc.position || ''}</td>
          </tr>
          <tr>
            <th className={HEAD}>성명</th>
            <td className={CELL}>{doc.name}</td>
            <th className={HEAD}>작성일자</th>
            <td className={CELL}>{korDate(doc.writtenOn)}</td>
          </tr>
          <tr>
            <th className={HEAD}>발생 일시</th>
            <td className={CELL}>
              {korDate(doc.occurredOn)}
              {doc.occurredTime ? `  ${doc.occurredTime}` : '  시'}
            </td>
            <th className={HEAD}>발생 장소</th>
            <td className={CELL}>{doc.occurredPlace || ''}</td>
          </tr>
        </tbody>
      </table>

      <Section no={1} title="사건 및 경위" hint="발생한 상황과 사실관계를 구체적으로 작성해 주십시오." body={doc.content} />
      <Section no={2} title="발생 원인 및 사유" hint="원인 및 관련 사유를 작성해 주십시오." body={doc.cause ?? ''} />
      <Section no={3} title="조치 사항" hint="발생 이후 취한 조치와 처리 결과를 작성해 주십시오." body={doc.action ?? ''} />
      <Section no={4} title="재발 방지 대책" hint="향후 개선 및 예방 계획을 작성해 주십시오." body={doc.prevention ?? ''} />

      {/* 맺음 — 날짜와 서명. 서명은 손으로 한다 */}
      <div className="mt-8 flex flex-wrap items-baseline justify-center gap-x-10 gap-y-2 text-[13px]">
        <span>{korDate(doc.writtenOn)}</span>
        <span>
          작성자 : <b className="font-bold">{doc.name}</b>
        </span>
        <span className="text-slate-500">(서명)</span>
      </div>

      <p className="mt-6 text-center text-sm font-bold">애니원모터스 귀중</p>
    </div>
  );
}
