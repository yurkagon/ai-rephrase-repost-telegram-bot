import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Italic, Link, Code, Underline } from 'lucide-react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension, Mark, Node } from '@tiptap/core';
const TelegramAttributes = Extension.create({
  name: 'telegramAttributes',
  addGlobalAttributes: () => [
    {
      types: ['blockquote'],
      attributes: {
        expandable: {
          default: false,
          parseHTML: (element) => element.hasAttribute('expandable'),
          renderHTML: (attributes) => (attributes.expandable === true ? { expandable: '' } : {}),
        },
      },
    },
  ],
});
const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML: () => [{ tag: 'tg-spoiler' }, { tag: 'span.tg-spoiler' }],
  renderHTML: () => ['tg-spoiler', {}, 0],
});
const Emoji = Node.create({
  name: 'telegramEmoji',
  group: 'inline',
  inline: true,
  content: 'text*',
  addAttributes: () => ({
    id: { default: '', parseHTML: (element) => element.getAttribute('emoji-id') },
  }),
  parseHTML: () => [{ tag: 'tg-emoji' }],
  renderHTML: ({ node }) => ['tg-emoji', { 'emoji-id': node.attrs.id }, 0],
});
function editorHtml(html: string) {
  return html
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/p>(?=.)/g, '\n')
    .replace(/<\/p>$/g, '')
    .replace(/<br\s*\/?>/g, '\n');
}
export function RichEditor({
  html,
  onChange,
  disabled,
}: {
  html: string;
  onChange: (html: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
        link: { openOnClick: false, HTMLAttributes: { target: null, rel: null, class: null } },
        trailingNode: false,
      }),
      TelegramAttributes,
      Spoiler,
      Emoji,
    ],
    content: html
      .split(/(<pre\b[^>]*>[\s\S]*?<\/pre>)/gi)
      .map((part) => (/^<pre\b/i.test(part) ? part : part.replace(/\n/g, '<br>')))
      .join(''),
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': t('draft'), 'aria-multiline': 'true' },
    },
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editorHtml(editor.getHTML())),
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  if (!editor) return null;
  return (
    <div className="rich-editor">
      <div className="editor-toolbar">
        <button
          type="button"
          disabled={disabled}
          aria-label={t('bold')}
          aria-pressed={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('italic')}
          aria-pressed={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={17} />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={17} />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('link')}
          onClick={() => {
            const href = window.prompt(
              t('linkPrompt'),
              (editor.getAttributes('link').href as string) ?? 'https://',
            );
            if (href === '') editor.chain().focus().unsetLink().run();
            else if (href && /^https?:\/\//i.test(href))
              editor.chain().focus().setLink({ href }).run();
          }}
        >
          <Link size={17} />
        </button>
      </div>
      <EditorContent editor={editor} aria-label={t('draft')} />
    </div>
  );
}
