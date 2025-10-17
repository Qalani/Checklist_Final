'use client';

import { useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

type FormatType = 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered';

interface RichTextTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}

const PLACEHOLDER_TEXT = {
  bold: 'bold text',
  italic: 'italic text',
  underline: 'underlined text',
  bullet: 'List item',
  numbered: 'Numbered item',
} satisfies Record<Exclude<FormatType, 'bullet' | 'numbered'> | 'bullet' | 'numbered', string>;

export default function RichTextTextarea({
  value,
  onChange,
  className,
  helperText = 'Use the toolbar to add emphasis, bullet points, or numbers.',
  ...rest
}: RichTextTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const baseTextareaClasses =
    'w-full px-4 py-3 rounded-b-[calc(theme(borderRadius.xl)-2px)] bg-transparent focus:outline-none focus:ring-0 resize-none text-sm text-zen-900 placeholder:text-zen-400';

  const applyFormatting = (type: FormatType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const result = formatText(value, selectionStart, selectionEnd, type);
    onChange(result.newValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
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
        <textarea
          ref={textareaRef}
          value={value}
          onChange={event => onChange(event.target.value)}
          className={className ? `${baseTextareaClasses} ${className}` : baseTextareaClasses}
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

function formatText(value: string, selectionStart: number, selectionEnd: number, type: FormatType) {
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  switch (type) {
    case 'bold': {
      const content = selected || PLACEHOLDER_TEXT.bold;
      const formatted = `**${content}**`;
      const start = before.length + 2;
      return {
        newValue: `${before}${formatted}${after}`,
        selectionStart: start,
        selectionEnd: start + content.length,
      };
    }
    case 'italic': {
      const content = selected || PLACEHOLDER_TEXT.italic;
      const formatted = `_${content}_`;
      const start = before.length + 1;
      return {
        newValue: `${before}${formatted}${after}`,
        selectionStart: start,
        selectionEnd: start + content.length,
      };
    }
    case 'underline': {
      const content = selected || PLACEHOLDER_TEXT.underline;
      const formatted = `<u>${content}</u>`;
      const start = before.length + 3;
      return {
        newValue: `${before}${formatted}${after}`,
        selectionStart: start,
        selectionEnd: start + content.length,
      };
    }
    case 'bullet': {
      if (!selected) {
        const placeholder = `- ${PLACEHOLDER_TEXT.bullet}`;
        const start = before.length + 2;
        return {
          newValue: `${before}${placeholder}${after}`,
          selectionStart: start,
          selectionEnd: start + PLACEHOLDER_TEXT.bullet.length,
        };
      }

      const lines = selected.split(/\r?\n/);
      const formattedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) {
          return '- ';
        }
        if (/^[-*]\s/.test(trimmed)) {
          return line;
        }
        const indentation = line.match(/^\s*/)?.[0] ?? '';
        return `${indentation}- ${trimmed}`;
      });
      const formatted = formattedLines.join('\n');
      const start = before.length;
      return {
        newValue: `${before}${formatted}${after}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    }
    case 'numbered': {
      if (!selected) {
        const placeholder = `1. ${PLACEHOLDER_TEXT.numbered}`;
        const start = before.length + 3;
        return {
          newValue: `${before}${placeholder}${after}`,
          selectionStart: start,
          selectionEnd: start + PLACEHOLDER_TEXT.numbered.length,
        };
      }

      const lines = selected.split(/\r?\n/);
      const formattedLines = lines.map((line, index) => {
        const indentation = line.match(/^\s*/)?.[0] ?? '';
        const content = line.trim().replace(/^\d+\.\s*/, '') || PLACEHOLDER_TEXT.numbered;
        return `${indentation}${index + 1}. ${content}`;
      });
      const formatted = formattedLines.join('\n');
      const start = before.length;
      return {
        newValue: `${before}${formatted}${after}`,
        selectionStart: start,
        selectionEnd: start + formatted.length,
      };
    }
    default:
      return {
        newValue: value,
        selectionStart,
        selectionEnd,
      };
  }
}
