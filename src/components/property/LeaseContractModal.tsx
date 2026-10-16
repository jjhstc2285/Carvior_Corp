import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarPlus, Eye, FileDown, FileText, Loader2, Plus, Printer, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { LEASE_KINDS, LEASE_RENT_TYPES, type LeaseContract, type Property } from '../../types';
import { leaseContractHtml } from './leaseContractPrint';
import { downloadPdf, fillLeaseContractPdf, openPdf } from './leaseContractPdf';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 부동산 임대차·전대차 계약서.
 *
 * 양식을 손으로 채워 인쇄하던 걸 옮겼다. 한 자리에 여러 장이 붙는다 — 갱신할 때마다
 * 새로 쓰고, 지난 장은 그대로 남는다.
 *
 * 새로 만들면 부동산에 적어둔 값(소재지·보증금·월세·기간·임대인)이 미리 들어간다.
 * 같은 값을 두 번 치게 두지 않는다.
 *
 * 주민등록번호·법인등록번호 칸은 두지 않았다. 인쇄물에 손으로 적으면 되는 값이라
 * 전산에 쌓아둘 이유가 없다 — 담는 순간 지켜야 할 것이 늘어난다.
 */

const INPUT =
  'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export default function LeaseContractModal({
  property,
  onClose,
  onRenewed,
}: {
  property: Property;
  onClose: () => void;
  /** 연장하면 부동산 쪽 기간도 바뀐다 — 뒤에 있는 표를 다시 받아야 한다 */
  onRenewed?: () => void;
}) {
  /* ESC 로 닫는다 — 겹쳐 뜬 창은 맨 위만 닫힌다 */
  useEscClose(onClose);
  const [rows, setRows] = useState<LeaseContract[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<LeaseContract[]>(`/properties/${property.id}/leases`);
      setRows(list);
      setCurrentId(prev => prev ?? list[0]?.id ?? null);
    } catch (e) {
      void alertError('계약서를 불러오지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setLoading(false);
    }
  }, [property.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = rows.find(r => r.id === currentId) ?? null;

  /** 칸을 벗어날 때만 저장한다 — 한 글자 칠 때마다 보내면 지우는 도중에도 저장된다 */
  const patch = async (body: Partial<LeaseContract>) => {
    if (!current) return;
    setSaving(true);
    try {
      await api(`/properties/leases/${current.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addContract = async () => {
    try {
      const made = await api<LeaseContract>(`/properties/${property.id}/leases`, {
        method: 'POST',
        body: { writtenOn: dayjs().format('YYYY-MM-DD') },
      });
      setCurrentId(made.id);
      await load();
    } catch (e) {
      void alertError('만들지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 연장 — 지금 장을 베껴 다음 기간짜리 새 장을 만든다.
   *
   * 조건이 그대로인 채 기간만 미는 일이 대부분이라 처음부터 다시 치게 두지 않는다.
   * 지난 장은 그대로 남는다 — 언제 얼마로 몇 년을 살았는지가 기록이다.
   */
  const renew = async (months: number) => {
    if (!current) return;
    setSaving(true);
    try {
      const made = await api<LeaseContract>(`/properties/leases/${current.id}/renew`, {
        method: 'POST',
        body: { months },
      });
      setCurrentId(made.id);
      await load();
      onRenewed?.();
    } catch (e) {
      void alertError('연장하지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setSaving(false);
    }
  };

  const removeContract = async () => {
    if (!current) return;
    const ok = await confirmDanger('이 계약서를 지울까요?', '되돌릴 수 없습니다.');
    if (!ok) return;
    try {
      await api(`/properties/leases/${current.id}`, { method: 'DELETE' });
      setCurrentId(null);
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  /**
   * 원본 양식 PDF.
   *
   * 사무장님이 쓰던 한글 양식을 PDF로 깔고 빈칸에 값만 얹는다 — 우리가 다시 그린
   * 서식이 아니라 쓰던 종이 그대로라, 받아 보는 쪽이 다시 확인할 일이 없다.
   */
  const makePdf = async (mode: 'open' | 'download') => {
    if (!current) return;
    setPdfBusy(true);
    try {
      const bytes = await fillLeaseContractPdf(current);
      if (mode === 'open') openPdf(bytes);
      else downloadPdf(bytes, `${property.name}_${current.kind}계약서_${current.writtenOn ?? dayjs().format('YYYY-MM-DD')}.pdf`);
    } catch (e) {
      void alertError('PDF를 만들지 못했습니다', e instanceof Error ? e.message : '');
    } finally {
      setPdfBusy(false);
    }
  };

  /**
   * 인쇄.
   *
   * 화면 CSS와 싸우지 않게 새 창에 계약서만 그려서 인쇄한다 — 화면에 맞춘 여백·색이
   * 종이에 그대로 따라가면 양식이 틀어진다.
   */
  const print = () => {
    if (!current) return;
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      void alertError('인쇄 창을 열지 못했습니다', '브라우저에서 팝업을 허용해 주세요.');
      return;
    }
    win.document.write(leaseContractHtml(current));
    win.document.close();
    win.focus();
  };

  /** 글자 칸 — 칸 밖을 누르면 저장 */
  const text = (key: keyof LeaseContract, placeholder = '') => (
    <input
      key={`${current?.id}-${key}`}
      defaultValue={String(current?.[key] ?? '')}
      onBlur={e => e.target.value !== String(current?.[key] ?? '') && void patch({ [key]: e.target.value })}
      disabled={saving}
      placeholder={placeholder}
      className={INPUT}
    />
  );

  /** 돈 칸 — 원 단위, 쉼표를 붙여 보여준다 */
  const money = (key: keyof LeaseContract) => (
    <input
      key={`${current?.id}-${key}`}
      defaultValue={withCommas(String(current?.[key] || ''))}
      onBlur={e => {
        const next = Number(digitsOnly(e.target.value)) || 0;
        if (next !== current?.[key]) void patch({ [key]: next });
      }}
      disabled={saving}
      inputMode="numeric"
      placeholder="0"
      className={`${INPUT} text-right`}
    />
  );

  const date = (key: keyof LeaseContract) => (
    <input
      type="date"
      value={String(current?.[key] ?? '') || ''}
      onChange={e => void patch({ [key]: e.target.value || null })}
      disabled={saving}
      className={INPUT}
    />
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800">
              <FileText size={16} className="text-indigo-600" /> 부동산 계약서 — {property.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              적은 대로 <b>원본 양식 PDF</b>에 채워집니다. 주민등록번호·도장은 출력한 뒤 손으로 적고 찍으세요.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* 한 자리에 여러 장 — 갱신할 때마다 새로 쓴다 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {rows.map(r => (
            <button
              key={r.id}
              onClick={() => setCurrentId(r.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                r.id === currentId
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {r.kind} {r.writtenOn ? dayjs(r.writtenOn).format('YY.M.D') : '작성일 없음'}
            </button>
          ))}
          <button
            onClick={() => void addContract()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Plus size={12} /> 계약서 만들기
          </button>
          {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>

        {loading && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}

        {!loading && !current && (
          <p className="py-10 text-center text-sm text-slate-400">
            아직 계약서가 없습니다. [계약서 만들기]를 누르면 부동산에 적어둔 값이 채워진 채로 열립니다.
          </p>
        )}

        {current && (
          <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">종류</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="계약 종류">
                  <select value={current.kind} onChange={e => void patch({ kind: e.target.value })} className={INPUT}>
                    {LEASE_KINDS.map(k => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="전세 / 월세">
                  <select value={current.rentType} onChange={e => void patch({ rentType: e.target.value })} className={INPUT}>
                    {LEASE_RENT_TYPES.map(k => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="작성일">{date('writtenOn')}</Field>
                <Field label="중개보수 (%)">{text('brokerageRate', '0.4')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">1. 부동산의 표시</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="소재지" className="col-span-2 sm:col-span-4">
                  {text('address')}
                </Field>
                <Field label="토지 지목">{text('landCategory', '대')}</Field>
                <Field label="토지 면적(㎡)">{text('landArea')}</Field>
                <Field label="건물 구조·용도">{text('buildingStructure', '철근콘크리트 / 근린생활시설')}</Field>
                <Field label="건물 면적(㎡)">{text('buildingArea')}</Field>
                <Field label="임대할 부분">{text('leasedPart', '5층 519호')}</Field>
                <Field label="임대할 면적(㎡)">{text('leasedArea')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">2. 보증금 및 지급시기 (원)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="보증금">{money('deposit')}</Field>
                <Field label="계약금">{money('downPayment')}</Field>
                <Field label="중도금">{money('interimPayment')}</Field>
                <Field label="중도금 지급일">{date('interimOn')}</Field>
                <Field label="잔금">{money('balance')}</Field>
                <Field label="잔금 지급일">{date('balanceOn')}</Field>
                <Field label="차임(월세)">{money('monthlyRent')}</Field>
                <Field label="매월 지급일">{text('payDay', '5')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">3. 존속기간</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="인도일">{date('handoverOn')}</Field>
                <Field label="임대차 시작">{date('startOn')}</Field>
                <Field label="임대차 종료">{date('endOn')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">특약사항</p>
              <textarea
                key={`${current.id}-special`}
                defaultValue={current.special}
                onBlur={e => e.target.value !== current.special && void patch({ special: e.target.value })}
                rows={3}
                placeholder="줄바꿈 그대로 인쇄됩니다"
                className={`${INPUT} resize-y`}
              />
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">임대인 {current.kind === '전대차' && '(전대인)'}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="성명">{text('lessorName')}</Field>
                <Field label="전화">{text('lessorPhone')}</Field>
                <Field label="주소" className="col-span-2">
                  {text('lessorAddress')}
                </Field>
                <Field label="대리인">{text('lessorAgent')}</Field>
                <Field label="대리인 전화">{text('lessorAgentPhone')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">임차인 {current.kind === '전대차' && '(전차인)'}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="성명">{text('lesseeName')}</Field>
                <Field label="전화">{text('lesseePhone')}</Field>
                <Field label="주소" className="col-span-2">
                  {text('lesseeAddress')}
                </Field>
                <Field label="대리인">{text('lesseeAgent')}</Field>
                <Field label="대리인 전화">{text('lesseeAgentPhone')}</Field>
              </div>
            </section>

            <section>
              <p className="mb-1.5 text-xs font-bold text-slate-600">개업공인중개사 (없으면 비워두세요)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="사무소 명칭">{text('brokerOffice')}</Field>
                <Field label="대표">{text('brokerName')}</Field>
                <Field label="사무소 소재지" className="col-span-2">
                  {text('brokerAddress')}
                </Field>
                <Field label="등록번호">{text('brokerRegNo')}</Field>
                <Field label="전화">{text('brokerPhone')}</Field>
              </div>
            </section>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          {current ? (
            <button
              onClick={() => void removeContract()}
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 hover:bg-red-50"
            >
              <Trash2 size={13} /> 이 계약서 지우기
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {current && (
              <>
                <span className="text-[11px] text-slate-400">연장</span>
                {[12, 24].map(m => (
                  <button
                    key={m}
                    onClick={() => void renew(m)}
                    disabled={saving}
                    title={`지금 계약서를 베껴 ${m / 12}년짜리 새 계약서를 만듭니다. 부동산 계약 기간도 같이 밀립니다`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <CalendarPlus size={13} /> {m / 12}년
                  </button>
                ))}
              </>
            )}
            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
              닫기
            </button>
            {/* 우리가 다시 그린 서식 — 원본이 안 열릴 때를 위해 남겨 둔다 */}
            <button
              onClick={print}
              disabled={!current}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer size={15} /> 간이 인쇄
            </button>
            <button
              onClick={() => void makePdf('open')}
              disabled={!current || pdfBusy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} 양식 PDF 보기
            </button>
            <button
              onClick={() => void makePdf('download')}
              disabled={!current || pdfBusy}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF 받기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
