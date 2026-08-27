import Swal from 'sweetalert2';

/**
 * 알림창.
 *
 * 브라우저 기본 alert/confirm은 문구를 꾸밀 수 없고 모바일에서 도메인이 먼저 뜬다.
 * sweetalert2를 쓰되 색·모서리는 앱과 맞춰 한곳에서만 정한다 —
 * 화면마다 따로 부르면 버튼 색이 제각각이 된다.
 */

const BRAND = '#4f46e5'; // indigo-600 — 앱의 기본 버튼 색
const DANGER = '#dc2626'; // red-600

const base = Swal.mixin({
  buttonsStyling: true,
  confirmButtonColor: BRAND,
  cancelButtonColor: '#94a3b8', // slate-400
  customClass: { popup: 'rounded-2xl' },
  // 실수로 바깥을 눌러 닫히면 무슨 일이 있었는지 모른 채 지나간다.
  allowOutsideClick: false,
});

export function alertSuccess(title: string, text?: string) {
  return base.fire({ icon: 'success', title, text, confirmButtonText: '확인' });
}

export function alertInfo(title: string, text?: string) {
  return base.fire({ icon: 'info', title, text, confirmButtonText: '확인' });
}

/**
 * 안 되는 이유를 알리는 창.
 * hint는 "그래서 뭘 해야 하는지"를 적는 자리다 — 이유만 알려주고 끝내면 다시 물어보게 된다.
 */
export function alertError(title: string, text?: string, hint?: string) {
  return base.fire({
    icon: 'error',
    title,
    html: hint ? `${escapeHtml(text ?? '')}<div class="mt-2 text-sm text-slate-500">${escapeHtml(hint)}</div>` : undefined,
    text: hint ? undefined : text,
    confirmButtonText: '확인',
  });
}

/** 되돌리기 어려운 동작을 묻는다. 확인을 누르면 true. */
export async function confirmDanger(title: string, text?: string, confirmText = '삭제') {
  const result = await base.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonColor: DANGER,
    confirmButtonText: confirmText,
    cancelButtonText: '취소',
  });
  return result.isConfirmed;
}

/** html에 그대로 넣기 전에 꺾쇠를 막는다 — 서버 문구에 사용자 입력이 섞여 들어올 수 있다. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
