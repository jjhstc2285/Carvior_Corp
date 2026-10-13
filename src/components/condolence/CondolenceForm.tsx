import { useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { moneyToNumber, toMoneyValue, withCommas } from '../../lib/money';
import {
  DEFAULT_WREATH,
  KINDS,
  KIND_LABEL,
  parseEventDate,
  QUICK_AMOUNTS,
  SUBJECTS,
  type Condolence,
  type CondolenceKind,
} from './condolence';

/**
 * 경조사 한 건 적기.
 *
 * 대표님이 카톡에 던지시는 말이 그대로 들어가야 한다 — "김재웅 부친 20만원 플러스
 * 화환", "공덕규대표 결혼식 30만원". 이름·구분·금액·화환 넷이면 대개 끝난다.
 * 나머지(장소·메모)는 부고 문자에 있는 것을 옮겨 두는 칸이라 비어 있어도 된다.
 *
 * 화환은 켜고 끄는 단추로 둔다. 늘 45,000원이라 금액을 매번 치게 하면 안 켠다.
 */

const INPUT = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

interface Props {
  editing: Condolence | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function CondolenceForm({ editing, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<CondolenceKind>(editing?.kind ?? 'WEDDING');
  const [person, setPerson] = useState(editing?.person ?? '');
  const [relation, setRelation] = useState(editing?.relation ?? '');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [eventOn, setEventOn] = useState(editing?.eventOn ?? dayjs().format('YYYY-MM-DD'));
  /* 날짜는 치는 대로 읽는다 — 달력을 띄워 고르는 건 지난 날짜로 갈 때 품이 많이 든다 */
  const [dateText, setDateText] = useState(() => dayjs(editing?.eventOn ?? undefined).format('M/D'));
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [wreath, setWreath] = useState(editing?.wreath ?? false);
  const [wreathPrice, setWreathPrice] = useState(String(editing?.wreathPrice || DEFAULT_WREATH));
  const [place, setPlace] = useState(editing?.place ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = moneyToNumber(amount) + (wreath ? moneyToNumber(wreathPrice) : 0);

  /* 보내고 나서 닫는다 — 안 기다리고 닫으면 실패해도 저장된 것처럼 보인다 */
  const submit = async () => {
    if (!person.trim()) {
      setError('누구 일인지 적어 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        kind,
        person: person.trim(),
        relation: relation.trim(),
        subject,
        eventOn,
        phone: phone.trim(),
        amount: moneyToNumber(amount),
        wreath,
        wreathPrice: wreath ? moneyToNumber(wreathPrice) : 0,
        place: place.trim(),
        memo: memo.trim(),
      };
      if (editing) await api(`/condolences/${editing.id}`, { method: 'PATCH', body });
      else await api('/condolences', { method: 'POST', body });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">{editing ? '경조사 수정' : '경조사 등록'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* 구분부터 — 무슨 자리인지가 정해져야 나머지 칸이 읽힌다 */}
        <div className="mt-4 flex gap-1.5">
          {KINDS.map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors ${
                kind === k
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            누구 <span className="text-red-400">*</span>
            <input
              value={person}
              onChange={e => setPerson(e.target.value)}
              placeholder="김재웅"
              className={`mt-1 ${INPUT}`}
            />
          </label>
          <label className="text-xs text-slate-500">
            연락처 <span className="text-slate-300">(선택)</span>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="010-0000-0000"
              className={`mt-1 ${INPUT}`}
            />
          </label>
          <label className="text-xs text-slate-500">
            소속 <span className="text-slate-300">(선택)</span>
            <input
              value={relation}
              onChange={e => setRelation(e.target.value)}
              placeholder="거래처 대표 · 직원 · 타상사"
              className={`mt-1 ${INPUT}`}
            />
          </label>

          <label className="text-xs text-slate-500">
            관계
            <select value={subject} onChange={e => setSubject(e.target.value)} className={`mt-1 ${INPUT}`}>
              <option value="">— 없음 —</option>
              {SUBJECTS.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {/*
            일자는 치는 대로 읽는다.

            '10/13'·'1013'·'26-10-13' 다 된다. 읽은 날짜를 옆에 적어 보여 주므로 잘못
            읽었으면 바로 안다. 달력이 필요하면 옆 칸을 쓴다 — 치는 쪽이 대개 빠르다.
          */}
          {/*
            일자는 치는 대로 읽는다 — 칸 하나다.

            달력을 옆에 같이 뒀더니 그쪽이 자리를 다 먹고 치는 칸이 손가락만 하게 남았다.
            치는 쪽이 빠르고, 읽은 날짜를 바로 아래 적어 주므로 달력이 없어도 틀릴 일이 없다.

            '10/13'·'1013'·'1/5'·'26-10-13' 다 된다. 해를 안 적으면 올해로 본다.
          */}
          <label className="text-xs text-slate-500">
            일자
            <input
              value={dateText}
              onChange={e => {
                setDateText(e.target.value);
                const read = parseEventDate(e.target.value);
                if (read) setEventOn(read);
              }}
              inputMode="numeric"
              placeholder="10/13"
              className={`mt-1 ${INPUT}`}
            />
            <span className="mt-0.5 block text-[11px] text-slate-400">
              {parseEventDate(dateText) || !dateText.trim()
                ? dayjs(eventOn).format('YYYY년 M월 D일 (ddd)')
                : '못 읽었습니다 — 10/13 처럼'}
            </span>
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <label className="text-xs text-slate-500">
            금액
            <input
              value={withCommas(amount)}
              onChange={e => setAmount(toMoneyValue(e.target.value))}
              inputMode="numeric"
              placeholder="200,000"
              className={`mt-1 ${INPUT}`}
            />
          </label>
          {/*
            자주 내는 금액은 눌러서 넣는다.

            20만원을 치려고 0을 다섯 번 누르면 하나 더 치거나 덜 치기 쉽다. 경조사비는
            몇 가지로 거의 정해져 있어서 눌러 넣는 쪽이 빠르고 덜 틀린다.
          */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK_AMOUNTS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  moneyToNumber(amount) === v
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {v / 10000}만
              </button>
            ))}
            {moneyToNumber(amount) > 0 && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="rounded-full px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100"
              >
                지우기
              </button>
            )}
          </div>

          {/*
            화환은 켜고 끄는 단추다. 늘 45,000원이라 금액을 매번 치게 하면 안 켠다 —
            안 켜면 "화환 추가"라는 말이 어디에도 안 남는다.
          */}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => setWreath(v => !v)}
              className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                wreath ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {wreath ? '✓ 화환 보냄' : '화환'}
            </button>
            {wreath && (
              <input
                value={withCommas(wreathPrice)}
                onChange={e => setWreathPrice(toMoneyValue(e.target.value))}
                inputMode="numeric"
                className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:border-indigo-400"
              />
            )}
            <span className="ml-auto text-xs text-slate-500">
              합계 <b className="text-sm text-indigo-700">{withCommas(String(total))}</b>원
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className="text-xs text-slate-500">
            장소 <span className="text-slate-300">(선택)</span>
            <input
              value={place}
              onChange={e => setPlace(e.target.value)}
              placeholder="수원중앙병원 장례식장"
              className={`mt-1 ${INPUT}`}
            />
          </label>
          <label className="text-xs text-slate-500">
            메모 <span className="text-slate-300">(선택)</span>
            <input
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="故 임영순님 · 12/27 더 바실리움"
              className={`mt-1 ${INPUT}`}
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
