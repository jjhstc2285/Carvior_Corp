import { useAuth } from '../../authStore';
import { useStore } from '../../store';

export default function LinkEmployeeStep() {
  const { user, linkEmployee, logout } = useAuth();
  const { state } = useStore();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-base font-bold text-slate-800">{user?.name}님, 반가워요</h1>
        <p className="mt-1 text-sm text-slate-500">{user?.provider === 'kakao' ? '카카오' : '네이버'} 계정을 처음 연결하시네요. 사내 직원 목록에서 본인을 선택해주세요.</p>

        <div className="mt-4 space-y-1.5">
          {state.employees.map(e => (
            <button
              key={e.id}
              onClick={() => linkEmployee(e.id, e.name)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-left text-sm hover:border-indigo-200 hover:bg-indigo-50/50"
            >
              <span className="font-medium text-slate-700">{e.name}</span>
              <span className="text-xs text-slate-400">{e.department} · {e.position}</span>
            </button>
          ))}
        </div>

        <button onClick={logout} className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600">
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
