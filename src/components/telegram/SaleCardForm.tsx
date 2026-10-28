import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Search, Send, X } from 'lucide-react';
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
 * 여덟 줄 중 여섯 줄은 이미 어딘가에 적혀 있다. 차명은 차량 관리에, 매입가와 구전은
 * 매입 정산에, 담당자와 유입경로는 상담에 있다 — 차량번호 몇 자만 치면 그걸 다 끌어온다.
 * 다시 손으로 치게 하면 한 자씩 틀리고, 틀린 채로 올라가면 그 숫자로 입금이 들어간다.
 *
 * 적는 대로 아래에 쪽지가 보인다. 올리기 전에 방에 뜰 꼴 그대로를 본다.
 *
 * 고칠 때도 여덟 줄을 통째로 다시 올린다. 방에 뜬 줄을 조용히 고치는 길도 있었는데,
 * 그러면 알림이 안 울려서 그새 읽고 간 사람은 옛 숫자를 들고 있게 된다 — 그 방을 보고
 * 입금을 넣는 자리라, 바뀐 걸 모르는 쪽이 더 나쁘다.
 *
 * 바뀐 줄은 방에서 굵게 뜨고 지난 값이 취소선으로 뒤에 붙는다. 텔레그램 봇은 글자에
 * 색을 못 넣는다 — 쓸 수 있는 건 굵게·기울임·취소선·밑줄뿐이다. 색은 목록에서 칠한다.
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
  /** 고쳐 올리는 것이면 지난 쪽지 — 서버가 그것과 견줘 바뀐 줄을 굵게 적는다 */
  basedOn?: string;
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
  /*
    비고 — 맨 아래 괄호 한 줄. 콜론이 없어서 위에서 안 걸린다.

    맨 끝줄만 보면 안 된다. 고쳐 올린 쪽지에는 그 아래 '※ … 수정' 한 줄이 더 붙어서,
    끝줄만 집으면 그 줄이 비고 칸으로 딸려 들어간다.
  */
  const note =
    text
      .trim()
      .split('\n')
      .reverse()
      .map(line => line.trim().match(/^\((.+)\)$/)?.[1])
      .find(Boolean) ?? '';

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

/** 차량번호로 끌어온 칸 — 서버가 만원으로 내려준다 */
interface Fill {
  vehicleNumber: string;
  vehicleName: string;
  dealer: string;
  purchasePrice: number;
  brokerFee: number;
  adPrice: number;
  platform: string;
}

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
  editing: { id: string; text: string; ok: boolean; reason: string; sentBy: string; createdAt: string } | null;
  /** 지금까지 쓰인 유입경로 — 고르면 띄어쓰기가 안 엇갈린다 */
  platforms: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [card, setCard] = useState<SaleCardFields>(() => (editing ? cardOf(editing.text) : EMPTY_CARD));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    차량번호를 치면 맞는 차를 찾아 둔다.

    한 글자 칠 때마다 서버에 묻지 않는다 — 번호는 예닐곱 자라 그만큼 묻게 되고, 늦게
    온 답이 먼저 온 답을 덮어써서 엉뚱한 차가 뜬다. 손이 멈추면 그때 한 번 묻는다.
  */
  const [found, setFound] = useState<Fill[]>([]);
  const [picking, setPicking] = useState(false);
  /** 끌어온 차 — 어디서 왔는지 한 줄로 적어 준다 */
  const [pulled, setPulled] = useState<string | null>(null);
  const plate = card.vehicleNumber;

  useEffect(() => {
    const key = plate.replace(/\s+/g, '').trim();
    if (!picking || key.length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void api<Fill[]>(`/telegram/sale/cards?q=${encodeURIComponent(key)}`)
        .then(rows => live && setFound(rows))
        .catch(() => live && setFound([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [plate, picking]);

  /** 고른 차로 칸을 채운다 — 적는 사람이 보고 적을 것은 광고가뿐이다 */
  const pick = (f: Fill) => {
    setCard(prev => ({
      ...prev,
      vehicleNumber: f.vehicleNumber,
      vehicleName: f.vehicleName || prev.vehicleName,
      dealer: f.dealer || prev.dealer,
      purchasePrice: f.purchasePrice || prev.purchasePrice,
      brokerFee: f.brokerFee || prev.brokerFee,
      // 광고가는 시스템에 적힌 차량판매가다 — 비어 있으면 손으로 적는다
      adPrice: f.adPrice || prev.adPrice,
      platform: f.platform || prev.platform,
    }));
    setPulled(f.vehicleNumber);
    setPicking(false);
    setFound([]);
  };

  const box = useRef<HTMLDivElement>(null);

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
      await api('/telegram/sale', {
        method: 'POST',
        body: { ...card, vehicleNumber: card.vehicleNumber.trim(), basedOn: editing?.id },
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
          <h3 className="text-base font-bold text-slate-800">{editing ? '고쳐 다시 올리기' : '입금방에 올리기'}</h3>
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
              고치면 <b>방에 통째로 다시</b> 올라갑니다 — 바뀐 줄은 굵게, 지난 값은 취소선으로 뒤에 붙습니다.
            </>
          )}
        </p>
        {/* 못 갔던 줄이면 까닭을 먼저 — 고쳐 올리면 이 줄을 다시 쓴다 */}
        {editing && !editing.ok && (
          <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            이 쪽지는 방에 못 올라갔습니다{editing.reason ? ` — ${editing.reason}` : ''}.
          </p>
        )}
        {editing && (
          <p className="mt-0.5 text-xs text-slate-400">
            고치는 쪽지 — {dayjs(editing.createdAt).format('YYYY-MM-DD HH:mm')} 올림
            {editing.sentBy && ` · ${editing.sentBy}`}
          </p>
        )}

        {/* 무엇이 저절로 채워졌는지 한 줄로 — 안 적으면 손으로 친 값과 구분이 안 된다 */}
        {pulled && (
          <p className="mt-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
            <b>{pulled}</b> 의 차명 · 담당자 · 매입가 · 구전 · 유입경로를 불러왔습니다. 광고가와 코드가만 보고 적으세요.
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
            <Field label="차량번호" hint="치면 차명 · 담당자 · 매입가를 끌어옵니다">
              <div ref={box} className="relative">
                <input
                  value={card.vehicleNumber}
                  onChange={e => {
                    set('vehicleNumber', e.target.value);
                    setPicking(true);
                    setPulled(null);
                  }}
                  onFocus={() => setPicking(true)}
                  /* 고르기 전에 닫히면 안 된다 — 누르는 동안 흐림이 먼저 온다 */
                  onBlur={() => setTimeout(() => setPicking(false), 150)}
                  className={BOX}
                  placeholder="82무6564"
                />
                <Search size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-300" />

                {picking && found.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {found.map(f => (
                      <li key={f.vehicleNumber}>
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => pick(f)}
                          className="block w-full px-3 py-1.5 text-left hover:bg-indigo-50"
                        >
                          <span className="text-sm font-bold text-slate-800">{f.vehicleNumber}</span>
                          <span className="ml-1.5 text-xs text-slate-500">{f.vehicleName || '(차명 없음)'}</span>
                          <span className="block text-[11px] text-slate-400">
                            {f.dealer || '담당자 없음'}
                            {f.purchasePrice > 0 && ` · 매입 ${f.purchasePrice.toLocaleString()}만`}
                            {f.adPrice > 0 && ` · 광고 ${f.adPrice.toLocaleString()}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
            {busy ? '올리는 중…' : editing ? '고쳐 다시 올리기' : '방에 올리기'}
          </button>
        </div>
      </div>
    </div>
  );
}
