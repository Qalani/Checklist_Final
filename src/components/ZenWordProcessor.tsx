'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { extractPlainText, sanitizeNoteHtml } from '@/features/notes/noteUtils';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'blockquote';
type AlignOption = 'left' | 'center' | 'right' | 'justify';

type ZenWordProcessorProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  readOnly?: boolean;
};

const ALIGN_COMMANDS: Record<AlignOption, string> = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
};

const BLOCK_OPTIONS: Array<{ value: BlockType; label: string; command: string }> = [
  { value: 'paragraph', label: 'Paragraph', command: 'P' },
  { value: 'h1', label: 'Heading 1', command: 'H1' },
  { value: 'h2', label: 'Heading 2', command: 'H2' },
  { value: 'h3', label: 'Heading 3', command: 'H3' },
  { value: 'blockquote', label: 'Quote', command: 'BLOCKQUOTE' },
];

export default function ZenWordProcessor({
  value,
  onChange,
  className,
  placeholder = 'Begin capturing your thoughts…',
  helperText = 'Use the toolbar to format your note just like a document.',
  readOnly = false,
  ...rest
}: ZenWordProcessorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>('');
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [alignment, setAlignment] = useState<AlignOption>('left');
  const isContentEmpty = useMemo(() => isHtmlEmpty(value), [value]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleSelectionChange = () => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !editor.contains(anchorNode)) {
        return;
      }

      const block = findBlockAncestor(anchorNode, editor);
      if (block) {
        const tag = block.tagName.toUpperCase();
        switch (tag) {
          case 'H1':
            setBlockType('h1');
            break;
          case 'H2':
            setBlockType('h2');
            break;
          case 'H3':
            setBlockType('h3');
            break;
          case 'BLOCKQUOTE':
            setBlockType('blockquote');
            break;
          default:
            setBlockType('paragraph');
            break;
        }
      }

      if (document.queryCommandState('justifyCenter')) {
        setAlignment('center');
      } else if (document.queryCommandState('justifyRight')) {
        setAlignment('right');
      } else if (document.queryCommandState('justifyFull')) {
        setAlignment('justify');
      } else {
        setAlignment('left');
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (value === lastValueRef.current) {
      return;
    }

    lastValueRef.current = value;
    const sanitised = sanitizeNoteHtml(value);
    if (editor.innerHTML !== sanitised) {
      editor.innerHTML = sanitised || '';
    }
  }, [value]);

  const runCommand = (command: string, value?: string) => {
    if (readOnly) return;
    const editor = editorRef.current;
    if (!editor || typeof document === 'undefined') {
      return;
    }

    editor.focus();
    document.execCommand(command, false, value ?? undefined);
    handleInput();
  };

  const handleBlockChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value as BlockType;
    setBlockType(nextValue);
    const option = BLOCK_OPTIONS.find(option => option.value === nextValue);
    if (!option) return;
    runCommand('formatBlock', option.command);
  };

  const handleAlignChange = (targetAlign: AlignOption) => {
    setAlignment(targetAlign);
    runCommand(ALIGN_COMMANDS[targetAlign]);
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const html = editor.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  };

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const sanitised = sanitizeNoteHtml(editor.innerHTML);
    if (sanitised !== editor.innerHTML) {
      editor.innerHTML = sanitised || '';
    }
    lastValueRef.current = sanitised;
    onChange(sanitised);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (typeof document === 'undefined') {
      return;
    }

    event.preventDefault();
    const htmlData = event.clipboardData.getData('text/html');
    const textData = event.clipboardData.getData('text/plain');
    const payload = htmlData || wrapPlainText(textData);
    const sanitised = sanitizeNoteHtml(payload);
    document.execCommand('insertHTML', false, sanitised || wrapPlainText(textData));
    handleInput();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    if (readOnly) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'b':
        event.preventDefault();
        runCommand('bold');
        break;
      case 'i':
        event.preventDefault();
        runCommand('italic');
        break;
      case 'u':
        event.preventDefault();
        runCommand('underline');
        break;
      case 'z':
        event.preventDefault();
        runCommand(event.shiftKey ? 'redo' : 'undo');
        break;
      case 'y':
        event.preventDefault();
        runCommand('redo');
        break;
      default:
        break;
    }
  };

  return (
    <div className={`space-y-3 ${className ?? ''}`} {...rest}>
      <div className="rounded-2xl border-2 border-zen-200 bg-surface/90 shadow-soft focus-within:border-sage-500">
        <div className="flex flex-wrap items-center gap-2 border-b border-zen-100 bg-zen-50/80 px-3 py-2 rounded-t-[calc(theme(borderRadius.2xl)-2px)]">
          <ToolbarButton onClick={() => runCommand('undo')} label="Undo" disabled={readOnly}>
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('redo')} label="Redo" disabled={readOnly}>
            <Redo className="h-4 w-4" />
          </ToolbarButton>
          <div className="h-6 w-px bg-zen-200" aria-hidden />
          <div className="relative inline-flex items-center">
            <Pilcrow className="absolute left-2 h-4 w-4 text-zen-400" aria-hidden />
            <select
              value={blockType}
              onChange={handleBlockChange}
              disabled={readOnly}
              className="appearance-none rounded-xl border border-zen-200 bg-surface pl-8 pr-8 py-1.5 text-xs font-medium text-zen-600 shadow-soft focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-100"
            >
              {BLOCK_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-zen-400">▾</span>
          </div>
          <div className="h-6 w-px bg-zen-200" aria-hidden />
          <ToolbarButton onClick={() => runCommand('bold')} label="Bold" disabled={readOnly}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('italic')} label="Italic" disabled={readOnly}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('underline')} label="Underline" disabled={readOnly}>
            <Underline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('strikeThrough')} label="Strikethrough" disabled={readOnly}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <div className="h-6 w-px bg-zen-200" aria-hidden />
          <ToolbarButton onClick={() => runCommand('insertUnorderedList')} label="Bulleted list" disabled={readOnly}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('insertOrderedList')} label="Numbered list" disabled={readOnly}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => runCommand('formatBlock', 'BLOCKQUOTE')} label="Quote" disabled={readOnly}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <div className="h-6 w-px bg-zen-200" aria-hidden />
          <ToolbarButton
            onClick={() => handleAlignChange('left')}
            label="Align left"
            disabled={readOnly}
            active={alignment === 'left'}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => handleAlignChange('center')}
            label="Align center"
            disabled={readOnly}
            active={alignment === 'center'}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => handleAlignChange('right')}
            label="Align right"
            disabled={readOnly}
            active={alignment === 'right'}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => handleAlignChange('justify')}
            label="Justify"
            disabled={readOnly}
            active={alignment === 'justify'}
          >
            <span className="h-4 w-4 text-[10px] font-semibold leading-4 text-zen-600">J</span>
          </ToolbarButton>
          <div className="h-6 w-px bg-zen-200" aria-hidden />
          <ToolbarButton
            onClick={() => {
              runCommand('removeFormat');
              runCommand('formatBlock', 'P');
            }}
            label="Clear formatting"
            disabled={readOnly}
          >
            <span className="text-[10px] font-semibold text-zen-600">Clear</span>
          </ToolbarButton>
        </div>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="relative min-h-[320px] w-full rounded-b-[calc(theme(borderRadius.2xl)-2px)] bg-transparent px-4 py-4 text-base leading-relaxed text-zen-900 focus:outline-none focus:ring-0 prose prose-sm max-w-none before:pointer-events-none before:absolute before:left-4 before:top-4 before:text-base before:text-zen-400 before:opacity-60 before:transition-opacity before:content-[attr(data-placeholder)] data-[empty=false]:before:opacity-0 [&_a]:text-sage-600 [&_blockquote]:border-l-4 [&_blockquote]:border-sage-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:text-3xl [&_h2]:text-2xl [&_h3]:text-xl [&_[style*='text-align:center']]:text-center [&_[style*='text-align:right']]:text-right [&_[style*='text-align:justify']]:text-justify"
          data-placeholder={placeholder}
          data-empty={isContentEmpty}
        />
      </div>
      {helperText ? <p className="text-xs text-zen-500">{helperText}</p> : null}
    </div>
  );
}

type ToolbarButtonProps = {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
};

function ToolbarButton({ onClick, label, disabled = false, active = false, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={event => event.preventDefault()}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-zen-500 transition-colors ${
        active ? 'bg-sage-100 text-sage-700 shadow-soft' : 'hover:bg-sage-50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function isHtmlEmpty(html: string) {
  if (!html) {
    return true;
  }

  const sanitised = sanitizeNoteHtml(html);
  const plainText = extractPlainText(sanitised);

  return plainText.length === 0;
}

function wrapPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<p>${escaped}</p>`;
}

function findBlockAncestor(node: Node | null, editor: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== editor) {
    if (current instanceof HTMLElement) {
      const tag = current.tagName.toUpperCase();
      if (['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'PRE'].includes(tag)) {
        return current;
      }
    }
    current = current.parentNode;
  }
  return null;
}
