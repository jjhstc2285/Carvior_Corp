import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import { api, ApiError } from '../../lib/api';
import { alertError } from '../../lib/alert';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  ImagePlus,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

/**
 * 공지 적는 칸 — 글자를 꾸밀 수 있게.
 *
 * 그냥 textarea 였다. 공지는 줄만 나누면 되는 글이 아니다 — 날짜를 굵게, 할 일을 목록으로,
 * 참고 링크를 걸어야 읽힌다. 그걸 못 하니 느낌표와 별표로 대신하게 된다.
 *
 * TipTap 을 쓴다(MIT, 공짜). 적는 쪽과 보는 쪽이 같은 HTML 을 쓰므로, 적은 그대로 뜬다.
 *
 * 꾸미는 단추는 열두 개만 둔다. 다 넣으면 워드가 되고, 그러면 아무도 안 쓴다 —
 * 공지에 필요한 건 굵게·목록·링크 정도다.
 */

const BTN = 'rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30';

/**
 * 사진 한 장을 올리고 주소를 받는다.
 *
 * 글 안에 사진을 통째로 박지 않는다(data: 로 넣으면 2MB 사진이 글 2.7MB 가 된다).
 * 서버에 올려 주소만 박는다 — 글은 가볍고, 같은 사진을 두 번 열어도 한 번만 내려받는다.
 */
async function uploadImage(file: File): Promise<string | null> {
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await api<{ url: string }>('/notices/images', { method: 'POST', formData: form });
    return res.url;
  } catch (e) {
    void alertError('사진을 올리지 못했습니다', e instanceof ApiError ? e.message : '');
    return null;
  }
}
const ON = 'bg-indigo-50 text-indigo-600';

/**
 * 적은 글을 보여줄 때 쓰는 세척.
 *
 * 관리자만 적지만, 남이 쓴 글을 그대로 그리는 자리다. 어디선가 복사해 붙인 글에
 * 스크립트가 섞여 들어올 수 있다 — 한 번 걸러서 그린다.
 */
export function cleanHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** 꾸밈을 걷어낸 맨 글자 — 목록에서 한 줄로 보여줄 때 쓴다 */
export function plainText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = cleanHtml(html);
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export default function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Underline,
      // 링크는 눌러서 열리게 둔다. 새 창으로 띄운다 — 공지를 보다 딴 데로 가면 돌아오기 번거롭다
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noreferrer' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // 글 폭에 맞춰 줄인다 — 원본 그대로 두면 사진 한 장이 화면을 넘긴다
      Image.configure({ HTMLAttributes: { class: 'notice-img' } }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose-notice min-h-[260px] w-full px-3 py-2.5 text-sm leading-relaxed outline-none',
      },
      /*
        붙여넣기와 끌어다 놓기로도 들어간다.

        캡처를 떠서 Ctrl+V 로 붙이는 게 제일 흔한 길이다. 단추로만 넣게 두면 캡처를
        파일로 저장했다가 다시 고르게 된다 — 두 번 일이다.
      */
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  /** 고른 사진을 차례로 올려 글에 박는다 */
  const insertFiles = async (files: File[]) => {
    for (const file of files) {
      const url = await uploadImage(file);
      if (url) editor?.chain().focus().setImage({ src: url }).run();
    }
  };

  // 고치기로 열 때 이미 적힌 글을 넣어준다 — 처음 만들 때 한 번만
  useEffect(() => {
    if (!editor) return;
    if (value && editor.isEmpty) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 focus-within:border-indigo-400">
      <Toolbar editor={editor} onPickImages={insertFiles} />
      <EditorContent editor={editor} />
      {editor.isEmpty && placeholder && (
        <p className="pointer-events-none -mt-[244px] px-3 text-sm text-slate-300">{placeholder}</p>
      )}
    </div>
  );
}

function Toolbar({ editor, onPickImages }: { editor: Editor; onPickImages: (files: File[]) => Promise<void> }) {
  const btn = (on: boolean) => `${BTN} ${on ? ON : ''}`;

  const setLink = () => {
    const before = (editor.getAttributes('link').href as string) ?? '';
    const url = window.prompt('링크 주소', before);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/70 px-1.5 py-1">
      <button type="button" title="굵게" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
        <Bold size={15} />
      </button>
      <button type="button" title="기울임" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
        <Italic size={15} />
      </button>
      <button type="button" title="밑줄" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}>
        <UnderlineIcon size={15} />
      </button>
      <button type="button" title="취소선" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
        <Strikethrough size={15} />
      </button>

      <span className="mx-1 h-4 w-px bg-slate-200" />

      {/* 제목은 두 단계만 — 공지에 세 단계까지 쓸 일이 없다 */}
      <button
        type="button"
        title="큰 제목"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`${btn(editor.isActive('heading', { level: 2 }))} px-2 text-xs font-bold`}
      >
        제목
      </button>
      <button
        type="button"
        title="작은 제목"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`${btn(editor.isActive('heading', { level: 3 }))} px-2 text-[11px] font-bold`}
      >
        소제목
      </button>

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <button type="button" title="글머리표" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
        <List size={15} />
      </button>
      <button type="button" title="번호 목록" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
        <ListOrdered size={15} />
      </button>
      <button type="button" title="인용" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}>
        <Quote size={15} />
      </button>
      <button type="button" title="링크" onClick={setLink} className={btn(editor.isActive('link'))}>
        <Link2 size={15} />
      </button>
      <label title="사진 넣기 — 붙여넣기(Ctrl+V)와 끌어다 놓기도 됩니다" className={`${BTN} cursor-pointer`}>
        <ImagePlus size={15} />
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => {
            const files = [...(e.target.files ?? [])];
            // 같은 사진을 다시 골라도 열리게 비워 둔다
            e.target.value = '';
            void onPickImages(files);
          }}
        />
      </label>

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <button type="button" title="왼쪽" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))}>
        <AlignLeft size={15} />
      </button>
      <button type="button" title="가운데" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))}>
        <AlignCenter size={15} />
      </button>
      <button type="button" title="오른쪽" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))}>
        <AlignRight size={15} />
      </button>

      <span className="ml-auto flex items-center gap-0.5">
        <button type="button" title="되돌리기" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={BTN}>
          <Undo2 size={15} />
        </button>
        <button type="button" title="다시" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={BTN}>
          <Redo2 size={15} />
        </button>
      </span>
    </div>
  );
}
