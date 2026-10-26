import TelegramLogCard from './TelegramLogCard';
import TelegramTestCard from './TelegramTestCard';

/**
 * 텔레그램 기록 — 방에 무엇이 나갔나.
 *
 * 관리자 대시보드 안에 넣어 뒀더니 아무도 못 찾았다. 그 화면은 '출퇴근 관리'를 눌러야
 * 나오는 자리라, 텔레그램을 보려고 근태 메뉴를 누를 사람이 없다 — 왼쪽 메뉴로 뺀다.
 *
 * 연결 확인도 같이 둔다. 쪽지가 안 왔을 때 보는 자리가 둘로 나뉘어 있으면, 방이 끊긴
 * 건지 보낼 일이 없었던 건지를 두 화면을 오가며 맞춰 봐야 한다.
 */
export default function TelegramLogModule() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">텔레그램 기록</h1>
        <p className="mt-1 text-sm text-slate-500">
          입금방·매입방·공지방으로 나간 것을 그대로 남깁니다. 못 보낸 것도 같이 뜹니다 — 안 간 걸 모르는 게 제일
          나쁩니다.
        </p>
      </div>

      <div className="space-y-5">
        <TelegramLogCard />
        {/* 쪽지가 안 오면 방부터 본다 — 번호 찾기도 여기 있다 */}
        <TelegramTestCard />
      </div>
    </div>
  );
}
