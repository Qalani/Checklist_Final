'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

type FormatType = 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered';

interface RichTextTextareaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  rows?: number;
  placeholder?: string;
  spellCheck?: boolean;
}

const COMMAND_MAP: Record<FormatType, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  bullet: 'insertUnorderedList',
  numbered: 'insertOrderedList',
};

export default function RichTextTextarea({
  value,
  onChange,
  className,
  helperText = 'Use the toolbar to add emphasis, bullet points, or numbers.',
  rows = 4,
  placeholder = 'Add details...',
  spellCheck = true,
  style,
  ...rest
}: RichTextTextareaProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [htmlValue, setHtmlValue] = useState(() => markdownToHtml(value));
  const lastSyncedMarkdownRef = useRef(value);
  const initialHtmlRef = useRef(htmlValue);

  const isEditorEmpty = useMemo(() => isHtmlContentEmpty(htmlValue), [htmlValue]);

  const minHeight = useMemo(() => {
    if (!rows) return undefined;
    const lineHeightRem = 1.5;
    return `${rows * lineHeightRem}rem`;
  }, [rows]);

  const synchroniseValues = useCallback((options?: { applyToDom?: boolean }) => {
    const editor = editorRef.current;
    if (!editor) return;

    const normalisedHtml = normaliseEditorHtml(editor.innerHTML);
    if (options?.applyToDom && editor.innerHTML !== normalisedHtml) {
      editor.innerHTML = normalisedHtml || '';
    }
    setHtmlValue(prev => (prev !== normalisedHtml ? normalisedHtml : prev));

    const markdown = htmlToMarkdown(normalisedHtml);
    if (markdown !== lastSyncedMarkdownRef.current) {
      lastSyncedMarkdownRef.current = markdown;
      onChange(markdown);
    }
  }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.innerHTML = initialHtmlRef.current || '';
  }, []);

  useEffect(() => {
    if (value === lastSyncedMarkdownRef.current) {
      return;
    }

    const nextHtml = markdownToHtml(value);
    lastSyncedMarkdownRef.current = value;
    setHtmlValue(prev => (prev === nextHtml ? prev : nextHtml));
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml || '';
    }
  }, [value]);

  const applyFormatting = (type: FormatType) => {
    const editor = editorRef.current;
    if (!editor || typeof document === 'undefined') return;

    editor.focus();
    const command = COMMAND_MAP[type];
    document.execCommand(command);
    synchroniseValues();
  };

  const handleInput = () => {
    synchroniseValues();
  };

  const handleBlur = () => {
    synchroniseValues({ applyToDom: true });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (typeof document === 'undefined') return;

    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    synchroniseValues();
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-zen-200 bg-white/80 focus-within:border-sage-500 transition-colors">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zen-100 bg-zen-50/60 rounded-t-[calc(theme(borderRadius.xl)-2px)]">
          <span className="text-xs font-medium text-zen-500">Formatting</span>
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => applyFormatting('bold')} label="Bold">
              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => applyFormatting('italic')} label="Italic">
              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => applyFormatting('underline')} label="Underline">
              <Underline className="w-4 h-4" />
            </ToolbarButton>
            <div className="w-px h-5 bg-zen-200" aria-hidden />
            <ToolbarButton onClick={() => applyFormatting('bullet')} label="Bulleted list">
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => applyFormatting('numbered')} label="Numbered list">
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
          </div>
        </div>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onPaste={handlePaste}
          spellCheck={spellCheck}
          className={`relative w-full px-4 py-3 rounded-b-[calc(theme(borderRadius.xl)-2px)] bg-transparent focus:outline-none focus:ring-0 text-sm text-zen-900 leading-relaxed ${
            className ?? ''
          } before:pointer-events-none before:absolute before:left-4 before:top-3 before:text-sm before:text-zen-400 before:opacity-60 before:transition-opacity before:content-[attr(data-placeholder)] data-[empty=false]:before:opacity-0`}
          data-placeholder={placeholder}
          data-empty={isEditorEmpty}
          style={{
            minHeight,
            outline: 'none',
            whiteSpace: 'pre-wrap',
            ...(style ?? {}),
          }}
          {...rest}
        />
      </div>
      {helperText && <p className="text-xs text-zen-500">{helperText}</p>}
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  label: string;
  children: ReactNode;
}

function ToolbarButton({ onClick, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zen-500 hover:text-sage-600 hover:bg-sage-50 transition-colors"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function normaliseEditorHtml(rawHtml: string) {
  if (!rawHtml) {
    return '';
  }

  if (typeof document === 'undefined') {
    return rawHtml;
  }

  const container = document.createElement('div');
  container.innerHTML = rawHtml;

  const cleaned = Array.from(container.childNodes)
    .map(node => normaliseBlockNode(node))
    .filter(Boolean)
    .join('');

  return cleaned;
}

function normaliseBlockNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return text.trim() ? `<p>${escapeHtml(text)}</p>` : '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const element = node as HTMLElement;
  if (element.tagName === 'DIV') {
    return Array.from(element.childNodes)
      .map(child => normaliseBlockNode(child))
      .join('');
  }

  if (element.tagName === 'P' || element.tagName === 'BR') {
    return element.outerHTML;
  }

  if (element.tagName === 'UL' || element.tagName === 'OL') {
    return element.outerHTML;
  }

  if (element.tagName === 'LI') {
    return element.outerHTML;
  }

  return `<p>${serializeInline(element)}</p>`;
}

function serializeInline(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const children = Array.from(node.childNodes).map(child => serializeInline(child)).join('');

  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return `<strong>${children}</strong>`;
    case 'EM':
    case 'I':
      return `<em>${children}</em>`;
    case 'U':
      return `<u>${children}</u>`;
    case 'BR':
      return '<br />';
    default:
      return children;
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isHtmlContentEmpty(html: string) {
  if (!html) {
    return true;
  }

  const withoutBreaks = html.replace(/<br\s*\/?>(\s|&nbsp;)*/gi, '').replace(/<p>\s*<\/p>/gi, '');
  const stripped = withoutBreaks.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return stripped.length === 0;
}

function markdownToHtml(markdown: string): string {
  if (!markdown) {
    return '';
  }

  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    html.push(`<${currentList.type}>${currentList.items.join('')}</${currentList.type}>`);
    currentList = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const unorderedMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    if (unorderedMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      continue;
    }

    flushList();

    if (!trimmed) {
      html.push('<p><br></p>');
      continue;
    }

    html.push(`<p>${formatInline(line)}</p>`);
  }

  flushList();
  return html.join('');
}

function formatInline(text: string): string {
  let result = text;
  result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  result = result.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>');
  return result;
}

function htmlToMarkdown(html: string): string {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const blocks: string[] = [];
  doc.body.childNodes.forEach(node => {
    const serialised = serialiseBlock(node);
    if (serialised != null) {
      blocks.push(serialised);
    }
  });

  return blocks
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function serialiseBlock(node: ChildNode): string | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return text.trim() ? text : null;
  }

  if (!(node instanceof HTMLElement)) {
    return null;
  }

  switch (node.tagName) {
    case 'P': {
      const content = serialiseInlineChildren(node);
      return content.trim() ? content : '';
    }
    case 'UL': {
      const items = Array.from(node.children)
        .map(child => `- ${serialiseInlineChildren(child as HTMLElement)}`)
        .join('\n');
      return items;
    }
    case 'OL': {
      const children = Array.from(node.children);
      return children
        .map((child, index) => `${index + 1}. ${serialiseInlineChildren(child as HTMLElement)}`)
        .join('\n');
    }
    case 'LI': {
      return serialiseInlineChildren(node);
    }
    case 'BR': {
      return '';
    }
    default: {
      const content = serialiseInlineChildren(node);
      return content.trim() ? content : '';
    }
  }
}

function serialiseInlineChildren(element: HTMLElement | ChildNode): string {
  const nodes = element instanceof HTMLElement ? Array.from(element.childNodes) : [element];
  return nodes
    .map(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        return child.textContent ?? '';
      }

      if (!(child instanceof HTMLElement)) {
        return '';
      }

      switch (child.tagName) {
        case 'STRONG':
        case 'B':
          return `**${serialiseInlineChildren(child)}**`;
        case 'EM':
        case 'I':
          return `_${serialiseInlineChildren(child)}_`;
        case 'U':
          return `<u>${serialiseInlineChildren(child)}</u>`;
        case 'BR':
          return '\n';
        case 'LI':
          return serialiseInlineChildren(child);
        case 'P':
          return serialiseInlineChildren(child);
        default:
          return serialiseInlineChildren(child);
      }
    })
    .join('')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
