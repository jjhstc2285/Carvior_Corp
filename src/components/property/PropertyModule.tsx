import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlarmClock, Coins, FileText, GripVertical, Lock, Phone, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, getPropertyPass, setPropertyPass } from '../../lib/api';
import { alertError, confirmDanger } from '../../lib/alert';
import { digitsOnly, withCommas } from '../../lib/money';
import { PROPERTY_SIDES, PROPERTY_USAGES, type Property, type PropertyCost } from '../../types';
import LeaseContractModal from './LeaseContractModal';
import PropertyCostModal from './PropertyCostModal';

/**
 * 부동산 정보.
 *
 * 사무실·주차장·창고로 쓰는 자리를 한곳에 모은다. 대표와 관리자만 본다 —
 * 보증금·월세·임대인 연락처가 들어 있어 전 직원이 볼 값이 아니다.
 *
 * 월세 내는 날과 계약 끝나는 날을 같이 둔다. 둘 다 놓치면 돈이 드는 일이라
 * 한 화면에서 봐야 한다 — 만료가 가까운 자리를 위로 올리고 색으로 알린다.
 *
 * 칸을 고치면 바로 저장된다. 따로 [저장]을 누르게 하면 고쳐놓고 안 누르는 일이 생긴다.
 */

/*
  칸마다 너비를 따로 준다 — 여기에 w-full 을 같이 넣으면 둘이 부딪쳐서, 칸이 눌려
  한 글자도 안 보이게 찌그러진다(무엇이 이기는지는 Tailwind 가 만든 차례를 탄다).
*/
const INPUT =
  'rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 disabled:opacity-50';

/** 계약 만료까지 며칠. 안 적혔으면 null */
function daysLeft(endOn: string | null): number | null {
  if (!endOn) return null;
  return dayjs(endOn).startOf('day').diff(dayjs().startOf('day'), 'day');
}

/** 열 차례를 기억해 두는 곳 — 이 브라우저에만 남는다 */
const COL_ORDER_KEY = 'propertyColOrder';

/**
 * 표의 칸들.
 *
 * 제목과 그리는 방법을 한 벌로 묶어 둔다 — 차례를 바꿀 수 있으려면 제목과 내용이
 * 따로 놀면 안 된다. 칸을 새로 만들 때도 여기 한 줄만 더한다.
 */
const COLUMNS: { key: string; label: string; align?: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'docs', label: '계약서 · 비용' },
  { key: 'side', label: '우리 위치' },
  { key: 'usage', label: '용도' },
  { key: 'address', label: '주소' },
  { key: 'ownerName', label: '상대방' },
  { key: 'ownerPhone', label: '연락처' },
  { key: 'deposit', label: '보증금', align: 'text-right' },
  { key: 'monthlyRent', label: '월세', align: 'text-right' },
  { key: 'payDay', label: '내는 날', align: 'text-center' },
  { key: 'startOn', label: '계약 시작' },
  { key: 'endOn', label: '계약 만료' },
  { key: 'memo', label: '메모' },
  { key: 'active', label: '계약중', align: 'text-center' },
];

export default function PropertyModule() {
  const [rows, setRows] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** 번호를 아직 안 넣었거나, 통행증이 시간 지나 막힌 상태 */
  const [locked, setLocked] = useState(() => !getPropertyPass());
  const [code, setCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** 계약서를 펼쳐 둔 부동산 */
  const [contractFor, setContractFor] = useState<Property | null>(null);
  /** 빌려 쓰는 자리만 / 빌려준 자리만 보기 */
  const [sideFilter, setSideFilter] = useState<string>('all');
  /** 달마다 나가는 돈을 펼쳐 둔 자리 */
  const [costFor, setCostFor] = useState<Property | null>(null);

  const load = useCallback(async () => {
    if (!getPropertyPass()) {
      setLocked(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await api<Property[]>(`/properties?includeInactive=${includeInactive}`));
      setDenied(false);
      setLocked(false);
    } catch (e) {
      // 통행증이 시간 지나 막힌 것과, 아예 볼 수 없는 계정을 갈라 본다
      if (e instanceof ApiError && e.code === 'PROPERTY_LOCKED') {
        setPropertyPass(null);
        setLocked(true);
      } else if (e instanceof ApiError && e.status === 403) {
        setDenied(true);
      } else {
        void alertError('불러오지 못했습니다', e instanceof ApiError ? e.message : '');
      }
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  /** 번호를 넣어 통행증을 받는다 — 맞는지는 서버가 본다 */
  const unlock = async () => {
    setUnlocking(true);
    setCodeError(null);
    try {
      const res = await api<{ pass: string }>('/properties/unlock', { method: 'POST', body: { code } });
      setPropertyPass(res.pass);
      setCode('');
      setLocked(false);
      await load();
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.message : '열지 못했습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: Property, body: Partial<Property>) => {
    setBusyId(row.id);
    try {
      await api(`/properties/${row.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      void alertError('저장하지 못했습니다', e instanceof ApiError ? e.message : '');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = async () => {
    try {
      await api('/properties', {
        method: 'POST',
        body: { name: '새 부동산', usage: PROPERTY_USAGES[0], side: sideFilter === 'all' ? '임차' : sideFilter },
      });
      await load();
    } catch (e) {
      void alertError('추가하지 못했습니다', e instanceof ApiError ? e.message : '');
    }
  };

  const removeRow = async (row: Property) => {
    const ok = await confirmDanger(
      `${row.name}을(를) 지울까요?`,
      '계약이 끝난 자리면 지우지 말고 [계약중] 체크를 풀어 주세요 — 지난 계약도 기록입니다.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api(`/properties/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      void alertError('지우지 못했습니다', e instanceof ApiError ? e.message : '');
    } finally {
      setBusyId(null);
    }
  };

  /*
    사무실 부대비용 — 자리에 매이지 않고 매달 자동이체로 빠져나가는 것.

    관리비·인터넷·정수기처럼 어느 건물 것도 아닌 돈이 있다. 아무 자리 밑에 넣어두면 그
    자리 고정비가 부풀어 자리끼리 비교가 안 된다. 따로 세서 한 달 고정비에만 더한다.
  */
  const [officeOpen, setOfficeOpen] = useState(false);
  const [officeCost, setOfficeCost] = useState(0);
  const loadOffice = useCallback(async () => {
    try {
      const list = await api<PropertyCost[]>('/properties/office-costs');
      setOfficeCost(list.filter(r => r.active).reduce((sum, r) => sum + r.amount, 0));
    } catch {
      // 못 받아도 자리 목록은 보여준다 — 잠금 화면에서도 불리는 길이다
      setOfficeCost(0);
    }
  }, []);

  useEffect(() => {
    // 잠금이 풀린 뒤라야 읽힌다 — 통행증이 있어야 열리는 길이다
    if (!locked) void loadOffice();
  }, [locked, loadOffice]);

  const totals = useMemo(() => {
    const live = rows.filter(r => r.active);
    // 빌려 쓰는 자리는 나가는 돈, 빌려준 자리는 들어오는 돈이다. 섞어 더하면 뜻이 없다
    const out = live.filter(r => r.side !== '임대');
    const income = live.filter(r => r.side === '임대');
    return {
      count: live.length,
      rent: out.reduce((sum, r) => sum + r.monthlyRent, 0),
      rentIn: income.reduce((sum, r) => sum + r.monthlyRent, 0),
      deposit: out.reduce((sum, r) => sum + r.deposit, 0),
      // 월세만 보면 실제로 나가는 돈보다 한참 적다 — 관리비·주차 임대료까지 더해야 한 달 고정비다
      fixed: out.reduce((sum, r) => sum + r.monthlyRent + (r.monthlyCost ?? 0), 0) + officeCost,
      depositIn: income.reduce((sum, r) => sum + r.deposit, 0),
      // 석 달 안에 끝나는 계약 — 미리 알아야 옮기든 연장하든 한다
      soon: live.filter(r => {
        const d = daysLeft(r.endOn);
        return d !== null && d <= 90;
      }).length,
    };
  }, [rows, officeCost]);

  /**
   * 곧 끝나거나 이미 지난 계약.
   *
   * 표 안에서 색만 칠해두면 아래로 스크롤해야 보인다. 놓치면 돈이 드는 일이라
   * 맨 위에 따로 올리고, 거기서 바로 임대인에게 걸고 연장 계약서까지 만들게 한다.
   */
  const expiring = rows
    .filter(r => r.active)
    .map(r => ({ row: r, left: daysLeft(r.endOn) }))
    .filter((x): x is { row: Property; left: number } => x.left !== null && x.left <= 90)
    .sort((a, b) => a.left - b.left);

  if (locked && !denied) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Lock size={22} className="mx-auto text-slate-400" />
          <h1 className="mt-2 text-base font-bold text-slate-800">부동산 정보</h1>
          <p className="mt-1 text-xs text-slate-500">
            대외비 화면입니다. 로그인과 별개로 <b>번호</b>를 한 번 더 넣어야 열립니다.
          </p>
          <input
            type="password"
            inputMode="numeric"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void unlock()}
            placeholder="번호"
            autoFocus
            className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-indigo-400"
          />
          {codeError && <p className="mt-2 text-xs text-red-500">{codeError}</p>}
          <button
            onClick={() => void unlock()}
            disabled={unlocking || !code.trim()}
            className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {unlocking ? '확인 중…' : '열기'}
          </button>
          <p className="mt-3 text-[11px] text-slate-400">
            창을 닫으면 다시 번호를 넣어야 합니다. 자리를 비울 때 화면이 열린 채로 남지 않게 하려는 것입니다.
          </p>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-slate-500">부동산 정보는 정해진 분만 볼 수 있습니다.</p>
      </div>
    );
  }

  /*
    열 차례는 사람마다 다르다.

    누구는 월세부터 보고 누구는 만료일부터 본다. 제목을 잡아 끌어 옮기면 그 차례로
    기억한다 — 이 브라우저에만 남는다. 칸을 새로 만들면 기억해 둔 차례 뒤에 붙는다.
  */
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_ORDER_KEY) ?? '[]') as string[];
      const known = saved.filter(k => COLUMNS.some(c => c.key === k));
      return [...known, ...COLUMNS.map(c => c.key).filter(k => !known.includes(k))];
    } catch {
      return COLUMNS.map(c => c.key);
    }
  });
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** 지금 지나가고 있는 칸 — 그 칸 어느 쪽에 놓이는지 선으로 보여준다 */
  const [overKey, setOverKey] = useState<string | null>(null);

  /**
   * 잡은 칸을 놓은 자리로 옮긴다.
   *
   * 오른쪽으로 끌면 그 칸 뒤에, 왼쪽으로 끌면 그 칸 앞에 놓는다 — 늘 앞에만 넣으면
   * 오른쪽으로 옮길 때 한 칸 덜 간 것처럼 보인다.
   */
  const moveColumn = (from: string, to: string) => {
    if (from === to) return;
    setOrder(prev => {
      const after = prev.indexOf(from) < prev.indexOf(to);
      const next = prev.filter(k => k !== from);
      next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
      localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetOrder = () => {
    localStorage.removeItem(COL_ORDER_KEY);
    setOrder(COLUMNS.map(c => c.key));
  };

  /*
    화면을 넓게 쓴다 — 이 화면은 사무실 PC 에서만 본다. 가운데 좁게 모아 두면 칸이
    스무 개 가까운 표가 옆으로 잘려 매번 밀어 봐야 한다.
  */
  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">부동산 정보</h1>
          <p className="mt-1 text-sm text-slate-500">
            사무실 · 주차장 · 창고로 쓰는 자리를 모아둡니다. <b>대외비</b> — 정해진 분만 번호를 넣고 봅니다.
          </p>
        </div>
        <button
          onClick={() => void addRow()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> 부동산 추가
        </button>
      </div>

      {expiring.length > 0 && (
        <section className="mb-3 rounded-2xl border border-red-200 bg-red-50/60 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <AlarmClock size={15} className="text-red-600" />
            <h2 className="text-sm font-bold text-red-800">곧 끝나는 계약 {expiring.length}건</h2>
            <span className="text-[11px] text-red-700/70">
              연장하려면 임대인에게 먼저 연락하고, [계약서]에서 연장 계약서를 만드세요
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {expiring.map(({ row, left }) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="font-bold text-slate-800">{row.name}</span>
                <span className="text-slate-400">{row.usage}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-bold ${left < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {left < 0 ? `만료 ${-left}일 지남` : `${left}일 남음`}
                </span>
                <span className="text-slate-500">{row.endOn} 만료</span>
                {row.monthlyRent > 0 && (
                  <span className="text-slate-400">월세 {row.monthlyRent.toLocaleString()}원</span>
                )}

                <span className="ml-auto flex items-center gap-1.5">
                  {row.ownerPhone ? (
                    // 연장은 전화 한 통으로 시작한다 — 번호를 찾으러 표를 뒤지지 않게
                    <a
                      href={`tel:${row.ownerPhone.replace(/[^\d+]/g, '')}`}
                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      <Phone size={11} /> {row.ownerName || '임대인'} {row.ownerPhone}
                    </a>
                  ) : (
                    <span className="text-slate-400">임대인 번호 없음</span>
                  )}
                  <button
                    onClick={() => setContractFor(row)}
                    className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 font-semibold text-white hover:bg-slate-800"
                  >
                    <FileText size={11} /> 계약서
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">계약중</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totals.count}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-3.5 py-2.5">
          <p className="text-xs font-medium text-indigo-700/80">매달 나가는 월세</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {totals.rent.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {/* 관리비까지 더한 값이 실제로 통장에서 빠지는 돈이다 */}
          {totals.fixed > totals.rent && (
            <p className="text-[11px] font-semibold text-indigo-700">
              관리비 등 포함 {totals.fixed.toLocaleString()}원
            </p>
          )}
          {totals.rentIn > 0 && (
            <p className="text-[11px] font-semibold text-emerald-700">
              받는 월세 {totals.rentIn.toLocaleString()}원
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <p className="text-xs font-medium text-slate-400">맡긴 보증금</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totals.deposit.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-slate-400">원</span>
          </p>
          {totals.depositIn > 0 && (
            <p className="text-[11px] font-semibold text-emerald-700">
              받은 보증금 {totals.depositIn.toLocaleString()}원
            </p>
          )}
        </div>
        {/* 계약 끝나는 걸 놓치면 옮길 자리를 못 구한다 */}
        <div
          className={`rounded-2xl border px-3.5 py-2.5 ${
            totals.soon > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
          }`}
        >
          <p className={`text-xs font-medium ${totals.soon > 0 ? 'text-amber-800' : 'text-slate-400'}`}>
            3개월 안에 만료
          </p>
          <p className={`mt-1 text-2xl font-bold ${totals.soon > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
            {totals.soon}
            <span className="ml-1 text-sm font-medium text-slate-400">곳</span>
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* 빌려 쓰는 자리와 빌려준 자리는 보는 눈이 다르다 — 갈라 볼 수 있게 한다 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {[['all', '전체'], ...PROPERTY_SIDES.map(s => [s, s === '임차' ? '빌려 쓰는 자리' : '빌려준 자리'])].map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setSideFilter(key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  sideFilter === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          계약 끝난 곳도 보기
        </label>

        {/* 자리에 안 붙는 돈 — 사무장이 매달 자동이체로 내는 것들 */}
        <button
          onClick={() => setOfficeOpen(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          title="관리비·인터넷·정수기처럼 자리에 매이지 않고 매달 자동이체로 나가는 돈"
        >
          <Coins size={13} className="text-indigo-600" /> 사무실 부대비용 자동이체
          <span className="text-slate-300">{officeOpen ? '▲' : '▼'}</span>
          {officeCost > 0 && (
            <span className="rounded-full bg-indigo-50 px-1.5 text-[11px] font-bold text-indigo-700">
              월 {Math.round(officeCost / 10000).toLocaleString()}만
            </span>
          )}
        </button>
        <button
          onClick={resetOrder}
          title="제목줄을 끌어 옮긴 차례를 처음으로 되돌립니다"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          열 순서 초기화
        </button>
        <span className="ml-auto text-xs text-slate-400">{loading ? '불러오는 중…' : `${rows.length}곳`}</span>
      </div>

      {/* 창으로 덮지 않고 자리에 깐다 — 스무 줄짜리 표라 뒤 화면과 같이 봐야 한다 */}
      {officeOpen && (
        <PropertyCostModal property={null} inline onClose={() => setOfficeOpen(false)} onChanged={() => void loadOffice()} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                {/* 제목을 잡아 끌어 옮기면 그 차례로 기억한다 */}
                <th className="px-2 py-2.5" />
                {order.map(key => {
                  const col = COLUMNS.find(c => c.key === key);
                  if (!col) return null;

                  /*
                    놓일 자리를 선으로 그린다.

                    잡은 칸보다 오른쪽이면 그 칸의 오른쪽에, 왼쪽이면 왼쪽에 들어간다 —
                    어디로 가는지 모르면 옮겨 놓고 나서야 알게 된다. 테두리 대신 안쪽
                    그림자로 그려 칸이 밀리지 않게 한다.
                  */
                  const dragging = dragKey === key;
                  const hovering = !!dragKey && overKey === key && !dragging;
                  const after = hovering && order.indexOf(dragKey) < order.indexOf(key);
                  const mark = !hovering
                    ? ''
                    : after
                      ? 'shadow-[inset_-3px_0_0_0_#4f46e5]'
                      : 'shadow-[inset_3px_0_0_0_#4f46e5]';

                  return (
                    <th
                      key={key}
                      draggable
                      onDragStart={e => {
                        setDragKey(key);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (overKey !== key) setOverKey(key);
                      }}
                      onDragLeave={() => setOverKey(prev => (prev === key ? null : prev))}
                      onDrop={() => {
                        if (dragKey) moveColumn(dragKey, key);
                        setDragKey(null);
                        setOverKey(null);
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        setOverKey(null);
                      }}
                      title="끌어서 순서를 바꿉니다"
                      className={`select-none px-2.5 py-2.5 font-medium transition-colors ${col.align ?? ''} ${mark} ${
                        dragging
                          ? 'cursor-grabbing bg-indigo-50 text-indigo-400 opacity-60'
                          : hovering
                            ? 'cursor-grabbing bg-indigo-50/70 text-indigo-700'
                            : 'cursor-grab hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {/* 끌 수 있는 자리라는 표 — 잡기 전에는 흐리게 */}
                        <GripVertical
                          size={11}
                          className={dragKey ? 'text-indigo-400' : 'text-slate-300'}
                        />
                        {col.label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-5 py-8 text-center text-sm text-slate-400">
                    {loading ? '불러오는 중…' : '등록된 부동산이 없습니다.'}
                  </td>
                </tr>
              )}
              {rows
                .filter(r => sideFilter === 'all' || (r.side || '임차') === sideFilter)
                .map(r => {
                const left = daysLeft(r.endOn);
                /** 보증금·월세 — 적는 방법이 같아 한 번만 적는다 */
                const money = (field: 'deposit' | 'monthlyRent') => (
                  <input
                    defaultValue={withCommas(String(r[field] || ''))}
                    onBlur={e => {
                      const next = Number(digitsOnly(e.target.value)) || 0;
                      if (next !== r[field]) void patch(r, { [field]: next });
                    }}
                    disabled={busyId === r.id}
                    inputMode="numeric"
                    className={`${INPUT} w-28 text-right`}
                  />
                );
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${
                      !r.active
                        ? 'bg-slate-50/60 text-slate-400'
                        : left !== null && left < 0
                          ? 'bg-red-50/70'
                          : left !== null && left <= 90
                            ? 'bg-amber-50/60'
                            : ''
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => void removeRow(r)}
                        disabled={busyId === r.id}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        aria-label="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>

                    {/* 제목줄과 같은 차례로 깐다 — 제목과 내용이 따로 놀면 안 된다 */}
                    {order.map(key => {
                      const cell = {
                        name: (
                          <input
                            defaultValue={r.name}
                            onBlur={e => e.target.value !== r.name && void patch(r, { name: e.target.value })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-36`}
                          />
                        ),
                        // 양식을 손으로 채워 인쇄하던 것과, 달마다 나가는 돈
                        docs: (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => setContractFor(r)}
                              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <FileText size={12} /> 계약서
                            </button>
                            <button
                              onClick={() => setCostFor(r)}
                              title="달마다 나가는 돈 — 월세·관리비·주차 임대료"
                              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                                (r.monthlyCost ?? 0) > 0
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Coins size={12} />
                              {(r.monthlyCost ?? 0) > 0
                                ? `${Math.round((r.monthlyCost ?? 0) / 10000).toLocaleString()}만`
                                : '비용'}
                            </button>
                          </span>
                        ),
                        side: (
                          <select
                            value={r.side}
                            onChange={e => void patch(r, { side: e.target.value })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-24 ${r.side === '임대' ? 'font-bold text-emerald-700' : ''}`}
                          >
                            {[...new Set([...PROPERTY_SIDES, r.side].filter(Boolean))].map(sd => (
                              <option key={sd} value={sd}>
                                {sd === '임차' ? '임차(빌림)' : sd === '임대' ? '임대(빌려줌)' : sd}
                              </option>
                            ))}
                          </select>
                        ),
                        usage: (
                          <select
                            value={r.usage}
                            onChange={e => void patch(r, { usage: e.target.value })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-24`}
                          >
                            {[...new Set([...PROPERTY_USAGES, r.usage].filter(Boolean))].map(u => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        ),
                        address: (
                          <input
                            defaultValue={r.address}
                            onBlur={e => e.target.value !== r.address && void patch(r, { address: e.target.value })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-56`}
                          />
                        ),
                        ownerName: (
                          <input
                            defaultValue={r.ownerName}
                            onBlur={e => e.target.value !== r.ownerName && void patch(r, { ownerName: e.target.value })}
                            disabled={busyId === r.id}
                            placeholder={r.side === '임대' ? '임차인' : '임대인'}
                            className={`${INPUT} w-24`}
                          />
                        ),
                        ownerPhone: (
                          <span className="flex items-center gap-1">
                            <input
                              defaultValue={r.ownerPhone}
                              onBlur={e => e.target.value !== r.ownerPhone && void patch(r, { ownerPhone: e.target.value })}
                              disabled={busyId === r.id}
                              placeholder="010-0000-0000"
                              className={`${INPUT} w-32 font-mono`}
                            />
                            {r.ownerPhone && (
                              <a
                                href={`tel:${r.ownerPhone.replace(/[^\d+]/g, '')}`}
                                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                                aria-label="전화"
                              >
                                <Phone size={12} />
                              </a>
                            )}
                          </span>
                        ),
                        deposit: money('deposit'),
                        monthlyRent: money('monthlyRent'),
                        payDay: (
                          <input
                            defaultValue={r.payDay || ''}
                            onBlur={e => {
                              const next = Math.min(31, Number(digitsOnly(e.target.value)) || 0);
                              if (next !== r.payDay) void patch(r, { payDay: next });
                            }}
                            disabled={busyId === r.id}
                            inputMode="numeric"
                            placeholder="5"
                            className={`${INPUT} w-14 text-center`}
                          />
                        ),
                        startOn: (
                          <input
                            type="date"
                            value={r.startOn ?? ''}
                            onChange={e => void patch(r, { startOn: e.target.value || null })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-36`}
                          />
                        ),
                        endOn: (
                          <span className="flex items-center gap-1">
                            <input
                              type="date"
                              value={r.endOn ?? ''}
                              onChange={e => void patch(r, { endOn: e.target.value || null })}
                              disabled={busyId === r.id}
                              className={`${INPUT} w-36`}
                            />
                            {/* 만료가 가까우면 숫자로 알려준다 — 날짜만 보고는 며칠 남았는지 안 세어진다 */}
                            {r.active && left !== null && left <= 90 && (
                              <span
                                className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                  left < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {left < 0 ? `${-left}일 지남` : `${left}일 남음`}
                              </span>
                            )}
                          </span>
                        ),
                        memo: (
                          <input
                            defaultValue={r.memo}
                            onBlur={e => e.target.value !== r.memo && void patch(r, { memo: e.target.value })}
                            disabled={busyId === r.id}
                            className={`${INPUT} w-48`}
                          />
                        ),
                        active: (
                          <input
                            type="checkbox"
                            checked={r.active}
                            onChange={e => void patch(r, { active: e.target.checked })}
                            disabled={busyId === r.id}
                            className="size-4 accent-indigo-600"
                            aria-label="계약중"
                          />
                        ),
                      }[key];

                      const col = COLUMNS.find(c => c.key === key);
                      return (
                        <td
                          key={key}
                          className={`px-2.5 py-1.5 ${dragKey === key ? 'bg-indigo-50/40' : ''} ${
                            col?.align === 'text-center' ? 'text-center' : ''
                          } ${
                            key === 'docs' || key === 'ownerPhone' ? 'whitespace-nowrap' : ''
                          }`}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {costFor && (
        <PropertyCostModal property={costFor} onClose={() => setCostFor(null)} onChanged={() => void load()} />
      )}

      {contractFor && (
        <LeaseContractModal
          property={contractFor}
          onClose={() => setContractFor(null)}
          onRenewed={() => void load()}
        />
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        <b>제목줄을 잡아 끌면</b> 열 순서를 바꿀 수 있습니다. 끌고 가는 동안 <b>놓일 자리에 파란 선</b>이
        생깁니다 — 선이 오른쪽에 있으면 그 칸 뒤로, 왼쪽에 있으면 앞으로 들어갑니다.
        바꾼 차례는 이 컴퓨터에 기억되고, <b>[열 순서 초기화]</b>로 되돌립니다.
        <br />
        칸을 고치고 <b>칸 밖을 누르면 바로 저장</b>됩니다. 계약이 끝난 자리는 지우지 말고{' '}
        <b>계약중 체크를 풀어</b> 주세요 — 지난 계약도 기록입니다.
        <br />
        만료가 <b>3개월 안</b>으로 들어오면 노란색, <b>지났으면</b> 빨간색으로 표시됩니다.
        <br />
        <b>비용</b> 단추에 월세·관리비·주차 임대료를 적어두면 <b>한 달에 고정으로 나가는 돈</b>이
        위 합계에 잡힙니다. 단추에 적힌 숫자가 그 자리의 한 달 비용(만원)입니다.
        <br />
        <b>우리 위치</b>를 <b>임대(빌려줌)</b>로 두면 그 자리의 보증금·월세는 <b>받는 돈</b>으로 셉니다.
        계약서를 만들 때도 우리가 임대인 자리에 들어가고, 상대가 임차인이 됩니다.
        <br />
        관리비·인터넷처럼 <b>자리에 안 붙는</b> 돈은 위의 <b>[사무실 부대비용 자동이체]</b>에 적어 주세요 —
        건물별 비용과 섞이지 않고, 한 달 고정비에는 같이 잡힙니다.
      </p>



    </div>
  );
}
