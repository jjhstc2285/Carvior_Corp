import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Smartphone, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { dedupe, downloadVCard, isPhone, type Contact } from '../../lib/vcard';
import type { Vendor } from '../../types';

/**
 * 연락처를 휴대폰에 넣을 파일로 내려받는다.
 *
 * 번호는 다 시스템에 있는데 정작 전화를 걸 때는 휴대폰이다. 지금은 화면에서 보고 손으로
 * 눌러 건다 — 한 자리 틀리면 엉뚱한 데로 가고, 저장된 이름이 없으니 다시 걸려 와도
 * 누군지 모른다.
 *
 * 무엇을 넣을지는 고르게 한다. 손님 번호까지 개인 휴대폰에 들어가는 일이라, 켜 두고
 * 잊는 게 아니라 누를 때마다 정하는 게 맞다.
 */

type GroupKey = 'vendor' | 'dealerFee' | 'keyDealer' | 'customer';

interface Group {
  key: GroupKey;
  label: string;
  hint: string;
  /** 연락처 이름 앞에 붙는 표 — 휴대폰에서 내 연락처와 섞이지 않게 */
  tag: string;
}

const GROUPS: Group[] = [
  { key: 'vendor', label: '거래처', hint: '거래처 대장의 업체와 담당자', tag: '거래처' },
  { key: 'dealerFee', label: '신차영업소', hint: '상조회비 대장의 담당자', tag: '영업소' },
  { key: 'keyDealer', label: '키 가져간 딜러', hint: '키 불출 이력에 남은 딜러', tag: '딜러' },
  { key: 'customer', label: '손님', hint: '상담에 적힌 손님 번호', tag: '손님' },
];

interface KeyRow {
  dealer: string;
  phone: string;
  company: string;
}

interface DealerFee {
  dealerName: string;
  managerName: string;
  managerPhone: string;
}

export default function ContactExportModal({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const [picked, setPicked] = useState<Set<GroupKey>>(new Set(['vendor']));
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [keyRows, setKeyRows] = useState<KeyRow[]>([]);
  const [dealerFees, setDealerFees] = useState<DealerFee[]>([]);
  const [prefix, setPrefix] = useState('애니원');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 막히는 곳이 있어도 나머지는 내려받을 수 있어야 한다
      const [v, k, d] = await Promise.all([
        api<Vendor[]>('/vendors').catch(() => [] as Vendor[]),
        api<{ rows?: KeyRow[] }>('/parkboard/keys?limit=0')
          .then(r => r.rows ?? [])
          .catch(() => [] as KeyRow[]),
        api<DealerFee[]>('/dealer-fees').catch(() => [] as DealerFee[]),
      ]);
      setVendors(v);
      setKeyRows(k);
      setDealerFees(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 갈래마다 연락처를 한 벌씩 만들어 둔다.
   *
   * 고른 것만 합쳐서 내려받고, 개수는 갈래별로 그대로 보여준다. 예전에는 합치는 셈과
   * 세는 셈을 따로 두었는데, 두 벌이면 한쪽만 고쳤을 때 화면의 숫자와 받은 파일의
   * 숫자가 달라진다.
   */
  const byGroup = useMemo(() => {
    const mark = (tag: string, name: string) => `[${prefix}${tag}] ${name}`.trim();

    const vendor: Contact[] = [];
    for (const v of vendors.filter(x => x.active)) {
      if (isPhone(v.phone)) vendor.push({ name: mark('거래처', v.name), phone: v.phone, org: v.category, note: v.memo });
      if (isPhone(v.phone2)) vendor.push({ name: mark('거래처', `${v.name} 2`), phone: v.phone2, org: v.category });
      // 대표 번호 말고 더 있는 사람들 — 실제로 전화하는 건 이쪽이 많다
      for (const c of v.contacts ?? []) {
        if (isPhone(c.phone)) vendor.push({ name: mark('거래처', `${v.name} ${c.name}`), phone: c.phone, org: v.category });
      }
    }

    const dealerFee: Contact[] = dealerFees
      .filter(d => isPhone(d.managerPhone))
      .map(d => ({
        name: mark('영업소', `${d.dealerName} ${d.managerName}`),
        phone: d.managerPhone,
        org: d.dealerName,
      }));

    const keyDealer: Contact[] = keyRows
      .filter(k => isPhone(k.phone) && k.dealer)
      .map(k => ({
        name: mark('딜러', `${k.dealer}${k.company ? ` ${k.company}` : ''}`),
        phone: k.phone,
        org: k.company,
      }));

    const customer: Contact[] = state.consultations
      .filter(c => isPhone(c.customerPhone))
      .map(c => ({
        // 차명을 같이 적는다 — 다시 걸려 왔을 때 무슨 차로 문의했는지가 먼저 떠올라야 한다
        name: mark('손님', c.customerName || c.vehicleName || c.vehicleNumber || '문의'),
        phone: c.customerPhone,
        note: `${c.vehicleNumber} ${c.vehicleName}`.trim(),
      }));

    return { vendor: dedupe(vendor), dealerFee: dedupe(dealerFee), keyDealer: dedupe(keyDealer), customer: dedupe(customer) };
  }, [vendors, dealerFees, keyRows, state.consultations, prefix]);

  const contacts = useMemo(
    () => dedupe(GROUPS.filter(g => picked.has(g.key)).flatMap(g => byGroup[g.key])),
    [byGroup, picked],
  );

  const toggle = (key: GroupKey) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = () => downloadVCard(contacts, `연락처_${new Date().toISOString().slice(0, 10)}`);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-800">
            <Smartphone size={16} className="text-slate-400" /> 휴대폰에 연락처 넣기
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          고른 번호를 <b>.vcf</b> 파일로 내려받습니다. 그 파일을 휴대폰에서 열면 연락처에 한 번에 들어갑니다
          (아이폰·안드로이드 둘 다 됩니다).
        </p>

        <div className="mt-3 space-y-1.5">
          {GROUPS.map(g => {
            const on = picked.has(g.key);
            const n = loading ? 0 : byGroup[g.key].length;
            return (
              <button
                key={g.key}
                onClick={() => toggle(g.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="checkbox" checked={on} readOnly className="size-4 accent-indigo-600" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{g.label}</span>
                  <span className="block text-[11px] text-slate-400">{g.hint}</span>
                </span>
                <span className="text-xs font-bold text-slate-500">{loading ? '…' : `${n}명`}</span>
              </button>
            );
          })}
        </div>

        <label className="mt-3 block text-xs text-slate-500">
          이름 앞에 붙일 표
          <input
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            placeholder="애니원"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            휴대폰에 <b className="font-mono">[{prefix}거래처] 금강유리</b> 로 저장됩니다 — 내 연락처와 섞이지 않고,
            나중에 지울 때도 한 번에 찾습니다.
          </span>
        </label>

        {picked.has('customer') && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            손님 번호가 개인 휴대폰에 저장됩니다. 퇴사하거나 휴대폰을 바꿀 때 지워야 하는 것이니, 꼭 필요한 사람만
            넣으세요.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">
            모두 <b className="text-sm text-slate-800">{loading ? '…' : contacts.length}</b>명
            <span className="ml-1 text-slate-400">(같은 번호는 하나로)</span>
          </span>
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            닫기
          </button>
          <button
            onClick={save}
            disabled={loading || contacts.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            내려받기
          </button>
        </div>
      </div>
    </div>
  );
}
