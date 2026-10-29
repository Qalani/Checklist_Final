'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CheckSquare, Circle, Square } from 'lucide-react';
import { useActionFeedback } from './ActionFeedback';

interface CompletionToggleProps {
  completed: boolean;
  onToggle: () => void | boolean | Promise<void | boolean>;
  label: string;
  subject?: 'task' | 'item';
  shape?: 'circle' | 'square';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

export default function CompletionToggle({
  completed, onToggle, label, subject = 'task', shape = 'circle', size = 'md', className = '', disabled = false,
}: CompletionToggleProps) {
  const celebrate = useActionFeedback();
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const Icon = shape === 'square' ? (completed ? CheckSquare : Square) : (completed ? CheckCircle2 : Circle);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  return (
    <button
      type="button"
      aria-label={`Mark ${subject} as ${completed ? 'incomplete' : 'complete'}`}
      aria-pressed={completed}
      aria-busy={busy}
      disabled={disabled || busy}
      className={`completion-toggle mt-0.5 flex-shrink-0 text-sage-600 hover:text-sage-700 disabled:cursor-default disabled:opacity-50 ${className}`}
      onClick={async event => {
        if (pending.current || disabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const scroll = { x: window.scrollX, y: window.scrollY };
        pending.current = true;
        setBusy(true);
        try {
          const accepted = await onToggle();
          if (!completed && accepted !== false) {
            const stayedInPlace = scroll.x === window.scrollX && scroll.y === window.scrollY;
            celebrate({ kind: 'complete', message: label, origin: stayedInPlace ? origin : undefined });
          }
        } catch {
          // Mutation handlers surface their own errors; failed actions never celebrate.
        } finally {
          pending.current = false;
          if (mounted.current) setBusy(false);
        }
      }}
    >
      <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden="true" />
    </button>
  );
}
