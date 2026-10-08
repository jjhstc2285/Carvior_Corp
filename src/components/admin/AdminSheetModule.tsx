import { useState } from 'react';
import { ExternalLink, RefreshCw, Table2 } from 'lucide-react';

/**
 * 플랫폼 매물 점검 — 구글 시트를 앱 안에서 본다.
 *
 * 엔카·차차차에 올라간 값이 우리 값과 같은지 보는 시트다. 값이 수식으로 들어오고
 * (엔카 화면에서 긁어 붙인 원본을 수식이 먹는다) 장이 일곱 장이라, 테이블로 떠 오는
 * 것보다 시트를 그대로 보는 쪽이 낫다 — 한 번 떠 봤다가 되돌렸다.
 *
 * 메뉴에 두는 이유는, 따로 띄워 두고 오가면 어느 창이 어느 장인지 헷갈리고 링크를
 * 모르는 사람은 매번 묻기 때문이다.
 *
 * 들어올 수 있는 자리는 화면에서 가린다(대표·광고팀). 다만 그건 메뉴를 감추는 것이지
 * 시트를 잠그는 게 아니다 — 시트를 실제로 누가 보느냐는 구글 공유 설정이 정한다.
 * 링크를 아는 사람은 주소창에 치면 열린다. 공유 설정을 같이 좁혀야 한다.
 *
 * 로그인한 구글 계정으로 열린다. 회사 계정으로 안 들어와 있으면 빈 화면이나 권한
 * 안내가 뜨는데, 그건 우리 화면 문제가 아니라서 새 창으로 여는 길을 같이 둔다.
 */

/** 보는 시트 — 바뀌면 여기 한 줄만 고친다 */
const SHEET_ID = '1mddXpb3V5BbDj4IVY4Z5SSJynlngApt8aULN-tRbT_E';
const SHEET_GID = '1128555042';

/** 새 창에서 열 주소 — 평소 쓰는 그 화면 그대로다 */
const OPEN_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;

/**
 * 안에 띄울 주소.
 *
 * rm=minimal 로 구글 메뉴줄을 걷어낸다 — 안에서는 어차피 좁아서 메뉴가 두 줄로 접힌다.
 * 장을 옮기는 아래 탭은 그대로 있어 일곱 장을 다 오간다.
 */
const EMBED_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?rm=minimal&gid=${SHEET_GID}`;

export default function AdminSheetModule() {
  /** 다시 불러오기 — 시트를 고치고 와서 새로 보고 싶을 때. 키를 바꿔 틀을 다시 만든다 */
  const [nonce, setNonce] = useState(0);

  return (
    <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-slate-900">
          <Table2 size={18} className="text-emerald-600" /> 플랫폼 매물 점검
        </h1>
        <p className="text-xs text-slate-400">
          엔카·차차차에 올라간 값을 보는 시트입니다 — 고치면 시트에 바로 저장됩니다
        </p>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setNonce(n => n + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={15} /> 다시 불러오기
          </button>
          {/* 안에서 안 열리는 경우가 있다 — 그때는 이걸로 간다 */}
          <a
            href={OPEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <ExternalLink size={15} /> 새 창에서 열기
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <iframe
          key={nonce}
          src={EMBED_URL}
          title="플랫폼 매물 점검"
          className="h-[78vh] w-full"
          /* 구글이 자기 화면 안에서 쓰는 것들 — 막으면 저장이나 복사가 안 된다 */
          allow="clipboard-read; clipboard-write"
        />
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        시트가 안 보이면 구글에 <b>회사 계정으로 로그인</b>돼 있는지 보세요 — 다른 계정으로 들어가 있으면 권한 안내만
        뜹니다. 그래도 안 되면 <b>새 창에서 열기</b>로 보시면 됩니다.
      </p>
    </div>
  );
}
