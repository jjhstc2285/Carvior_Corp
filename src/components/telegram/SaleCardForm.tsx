import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Send, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useEscClose } from '../../lib/useEscClose';

/**
 * 입금방에 올릴 쪽지를 적는 창.
 *
 * 지금까지는 카톡에 손으로 쳤다. 차 한 대에 여덟 줄인데, 적는 사람마다 줄 순서도
 * 띄어쓰기도 달랐다 — 읽는 쪽은 그 방을 보고 입금을 넣는 자리라 눈으로 훑어야 한다.
 *
 * 칸으로 받고 양식은 서버가 짠다. 코드가는 광고가+90, 입금은 -90 이 늘 맞아서 저절로
 * 채운다 — 받아 적게만 해 두면 백 건에 한 건은 틀린다. 그래도 고칠 수는 있게 둔다.
 *
 * 적는 대로 아래에 쪽지가 보인다. 올리기 전에 방에 뜰 꼴 그대로를 본다.
 *
 * 고칠 때는 방에 뜬 그 줄을 고친다 — 새로 올리지 않는다. 다시 올리면 같은 차가 두 줄이
 * 되고, 읽는 사람은 어느 쪽이 맞는지를 시각으로 가려야 한다.
 */

/** 서버에 보내는 칸 — DTO 와 이름이 같아야 한다(서버가 모르는 칸은 물린다) */
export interface SaleCardFields {
  dealer: string;
  vehicleNumber: string;
  vehicleName: string;
  /** 만원 */
  purchasePrice: number;
  brokerFee: number;
  adPrice: number;
  codePrice: number;
  deposit: number;
  platform: string;
  note: string;
}

/** 코드가 — 광고가에 늘 이만큼 붙는다(만원) */
const CODE_GAP = 90;

/** 입금 — 늘 같은 값(만원) */
const DEPOSIT = -90;

export const EMPTY_CARD: SaleCardFields = {
  dealer: '',
  vehicleNumber: '',
  vehicleName: '',
  purchasePrice: 0,
  brokerFee: 0,
  adPrice: 0,
  codePrice: 0,
  deposit: DEPOSIT,
  platform: '',
  note: '',
};

/** '3,000만원' · '-90' — 쉼표와 '만원'을 떼고 숫자만 집는다 */
const num = (v: string | undefined): number => {
  const n = Number((v ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * 올라간 쪽지를 칸으로 되돌린다.
 *
 * 글을 그대로 남겨 두고 읽는다. 칸마다 따로 저장해 두면 양식이 바뀔 때마다 표가 늘고,
 * 지난 쪽지는 빈칸이 된다.
 *
 * 매입가 줄은 '315만원+45만원' 꼴이다 — 앞이 매입가, 뒤가 구전이다.
 */
export function cardOf(text: string): SaleCardFields {
  const f: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^[▶\s]*([^:]+?)\s*:\s*(.*)$/);
    if (m) f[m[1].trim()] = m[2].trim();
  }
  const [bought, broker] = (f['매입가'] ?? '').split('+');
  // 맨 아래 괄호 한 줄 — 콜론이 없어서 위에서 안 걸린다
  const note = text.trim().split('\n').pop()?.match(/^\((.+)\)$/)?.[1] ?? '';

  return {
    dealer: f['담당자'] ?? '',
    vehicleNumber: f['차량번호'] ?? '',
    vehicleName: f['차량명'] ?? '',
    purchasePrice: num(bought),
    brokerFee: num(broker),
    adPrice: num(f['광고가']),
    codePrice: num(f['코드가']),
    deposit: f['입금'] === undefined ? DEPOSIT : num(f['입금']),
    platform: f['유입경로'] ?? '',
    note,
  };
}

/** 창에서 보는 미리보기 — 서버가 짜는 꼴과 같아야 한다(sale-card.ts) */
function preview(c: SaleCardFields): string {
  const NUM = (n: number) => n.toLocaleString();
  const bought = c.purchasePrice > 0 ? `${NUM(c.purchasePrice)}만원${c.brokerFee > 0 ? `+${NUM(c.brokerFee)}만원` : ''}` : '';
  const code = c.codePrice > 0 ? c.codePrice : c.adPrice + CODE_GAP;
  const lines = [
    `담당자 : ${c.dealer.trim()}`,
    `차량번호 : ${c.vehicleNumber.trim()}`,
    `차량명 : ${c.vehicleName.trim()}`,
    `매입가 : ${bought}`,
    `광고가 : ${NUM(c.adPrice)}`,
    `코드가 : ${NUM(code)}`,
    `입금 : ${NUM(c.deposit)}`,
    `유입경로 : ${c.platform.trim()}`,
  ];
  const note = c.note.trim();
  return note ? `${lines.join('\n')}\n\n(${note})` : lines.join('\n');
}

const BOX = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function SaleCardForm({
  editing,
  platforms,
  onClose,
  onSaved,
}: {
  /** 고치는 중이면 그 쪽지 — 없으면 새로 올린다 */
  editing: {
    id: string;
    text: string;
    ok: boolean;
    reason: string;
    sentBy: string;
    createdAt: string;
    editedAt: string | null;
  } | null;
  /** 지금까지 쓰인 유입경로 — 고르면 띄어쓰기가 안 엇갈린다 */
  platforms: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [card, setCard] = useState<SaleCardFields>(() => (editing ? cardOf(editing.text) : EMPTY_CARD));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscClose(onClose, !busy);

  const text = useMemo(() => preview(card), [card]);
  const set = <K extends keyof SaleCardFields>(key: K, value: SaleCardFields[K]) =>
    setCard(prev => ({ ...prev, [key]: value }));

  /** 숫자 칸 — 비우면 0 이다. '0'이 박혀 있으면 지우고 적어야 해서 성가시다 */
  const number = (key: keyof SaleCardFields, value: number) => (
    <input
      type="number"
      value={value === 0 ? '' : value}
      onChange={e => set(key, e.target.value === '' ? 0 : Number(e.target.value))}
      className={`${BOX} text-right tabular-nums`}
      placeholder="0"
    />
  );

  const save = async () => {
    if (!card.vehicleNumber.trim()) {
      setError('차량번호를 적어 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      /*
        보내 놓고 바로 닫지 않는다 — 기다렸다 닫는다.

        조용히 실패하면 올린 줄 알고 넘어가고, 그 방을 보는 사람은 안 온 쪽지를 기다린다.
      */
      await api(editing ? `/telegram/sale/${editing.id}` : '/telegram/sale', {
        method: editing ? 'PATCH' : 'POST',
        body: { ...card, vehicleNumber: card.vehicleNumber.trim() },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '올리지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '쪽지 고치기' : '입금방에 올리기'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          금액은 <b>만원</b>으로 적습니다 — 590 이면 590만원입니다. 코드가는 비우면 광고가+90 으로, 입금은 -90 으로
          들어갑니다.
          {editing && (
            <>
              {' '}
              고치면 <b>방에 뜬 그 줄</b>이 바뀝니다 — 새로 올리지 않습니다.
            </>
          )}
        </p>
        {/* 못 갔던 줄이면 까닭을 먼저 — 고쳐 올리면 이 줄을 다시 쓴다 */}
        {editing && !editing.ok && (
          <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            이 쪽지는 방에 못 올라갔습니다{editing.reason ? ` — ${editing.reason}` : ''}. 다시 올리면 방에 새로
            올라가고, 목록은 이 줄을 그대로 씁니다.
          </p>
        )}
        {editing && (
          <p className="mt-0.5 text-xs text-slate-400">
            {dayjs(editing.createdAt).format('YYYY-MM-DD HH:mm')} 올림
            {editing.sentBy && ` · ${editing.sentBy}`}
            {editing.editedAt && ` · ${dayjs(editing.editedAt).format('M월 D일 HH:mm')} 고침`}
          </p>
        )}

        <div className="-mr-2 mt-3 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="담당자" hint="타사면 딜러·상사 이름">
              <input
                value={card.dealer}
                onChange={e => set('dealer', e.target.value)}
                className={BOX}
                placeholder="윤재영/JSBC"
              />
            </Field>
            <Field label="차량번호">
              <input
                value={card.vehicleNumber}
                onChange={e => set('vehicleNumber', e.target.value)}
                className={BOX}
                placeholder="82무6564"
              />
            </Field>
            <Field label="차량명" wide>
              <input
                value={card.vehicleName}
                onChange={e => set('vehicleName', e.target.value)}
                className={BOX}
                placeholder="현대 포터 II CRDi 슈퍼캠 초장축 DLX 고급형"
              />
            </Field>

            <Field label="매입가" hint="만원">
              {number('purchasePrice', card.purchasePrice)}
            </Field>
            {/* 매입가 뒤에 '+45만원'으로 붙는 값이다 — 이전비가 아니다 */}
            <Field label="구전" hint="만원 · 매입가 뒤에 붙습니다">
              {number('brokerFee', card.brokerFee)}
            </Field>

            <Field label="광고가" hint="만원">
              {number('adPrice', card.adPrice)}
            </Field>
            <Field label="코드가" hint={`만원 · 비우면 ${(card.adPrice + CODE_GAP).toLocaleString()}`}>
              {number('codePrice', card.codePrice)}
            </Field>

            <Field label="입금" hint="만원">
              <input
                type="number"
                value={card.deposit}
                onChange={e => set('deposit', e.target.value === '' ? 0 : Number(e.target.value))}
                className={`${BOX} text-right tabular-nums`}
              />
            </Field>
            <Field label="유입경로">
              <input
                value={card.platform}
                onChange={e => set('platform', e.target.value)}
                className={BOX}
                list="sale-card-platforms"
                placeholder="차차차 · 엔카 · 기타"
              />
              {/* 쓰던 값에서 고르면 '인스타'와 '인스타그램'으로 갈리지 않는다 */}
              <datalist id="sale-card-platforms">
                {platforms.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>

            <Field label="비고" hint="맨 아래 괄호에 들어갑니다 · 비우면 안 붙습니다" wide>
              <input
                value={card.note}
                onChange={e => set('note', e.target.value)}
                className={BOX}
                placeholder="상담 등록에서 바뀜"
              />
            </Field>
          </div>

          {/* 올리기 전에 방에 뜰 꼴 그대로 — 여덟 줄을 눈으로 훑는 자리다 */}
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-slate-500">방에 이렇게 올라갑니다</p>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">
              {text}
            </pre>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
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
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send size={14} />
            {busy ? '올리는 중…' : editing ? '고쳐 올리기' : '방에 올리기'}
          </button>
        </div>
      </div>
    </div>
  );
}
