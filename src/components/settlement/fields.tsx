import { toManwonValue, toMoneyValue, withCommas, withManwonCommas, wonToManwon } from '../../lib/money';

// 알선/매입 정산 폼이 같이 쓰는 입력 조각 — 컬럼이 많아서 매번 같은 마크업을 반복하지 않으려고 뺐다.
const INPUT_CLASS = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400';

export function TextField({ label, value, onChange, placeholder, required, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}{required && ' *'}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={INPUT_CLASS} />
    </div>
  );
}

export function DateField({ label, value, onChange, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLASS} />
    </div>
  );
}

/**
 * 금액 입력.
 *
 * type="number"로는 쉼표를 못 넣어서 text로 받는다. 화면에는 세 자리마다 쉼표를 붙이고
 * onChange로는 숫자만 넘긴다 — 쓰는 쪽 코드는 예전과 똑같이 Number()로 받으면 된다.
 *
 * decimal을 켜면 소수점을 받는다(3.5 = 35,000원). 매입 정산이 그렇게 쓴다 —
 * 만원으로 안 떨어지는 비용이 흔해서 만원 정수로는 담을 수가 없다.
 */
export function MoneyField({ label, value, onChange, required, decimal, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  decimal?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}{required && ' *'}</label>
      <input
        value={decimal ? withManwonCommas(value) : withCommas(value)}
        onChange={e => onChange(decimal ? toManwonValue(e.target.value) : toMoneyValue(e.target.value))}
        inputMode="decimal"
        placeholder="0"
        className={`${INPUT_CLASS} text-right`}
      />
    </div>
  );
}

// 자동계산 결과 한 줄 — 어떤 식으로 나온 값인지 같이 보여줘서 나중에 계산식을 검증하기 쉽게 함
export function CalcRow({ label, formula, value, strong, won }: {
  label: string;
  formula: string;
  value: number;
  strong?: boolean;
  /** value가 '원' 단위일 때 켠다 — 만원으로 환산해 보여준다(매입 정산). */
  won?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3.5 py-2 ${strong ? 'bg-indigo-50' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${strong ? 'text-indigo-700' : 'text-slate-600'}`}>{label}</p>
        <p className="truncate text-[11px] text-slate-400">{formula}</p>
      </div>
      <span className={`shrink-0 font-bold ${strong ? 'text-lg' : 'text-base'} ${value >= 0 ? (strong ? 'text-indigo-700' : 'text-slate-700') : 'text-red-600'}`}>
        {won ? wonToManwon(value) : value.toLocaleString()}<span className="ml-0.5 text-xs font-medium text-slate-400">만원</span>
      </span>
    </div>
  );
}

export function EmployeeField({ label, value, onChange, employees, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  employees: { id: string; name: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
}

export function StatusField({ value, onChange, className }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-500">정산 상태</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="IN_PROGRESS">진행중</option>
        <option value="COMPLETED">정산완료</option>
      </select>
    </div>
  );
}
