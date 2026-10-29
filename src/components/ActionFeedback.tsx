'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface ActionFeedbackOptions {
  kind: 'complete' | 'archive' | 'restore';
  message: string;
  detail?: string;
  origin?: { x: number; y: number };
}

const ActionFeedbackContext = createContext<(options: ActionFeedbackOptions) => void>(() => {});

function ActionGlyph({ kind }: Pick<ActionFeedbackOptions, 'kind'>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'complete' ? (
        <>
          <circle cx="16" cy="16" r="12" />
          <path className="action-feedback-check" d="m10 16 4 4 8-8" />
        </>
      ) : (
        <>
          <path className={`action-feedback-paper action-feedback-paper--${kind}`} d="M11 14V6h10v8M14 9h4" />
          <path d="M6 16h20v11H6zM13 21h6" />
          <path className="action-feedback-lid" d="M5 12h22v4H5z" />
        </>
      )}
    </svg>
  );
}

/** Action-triggered feedback lives outside cards, which may disappear on completion. */
export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<(ActionFeedbackOptions & { id: number }) | null>(null);
  const sequence = useRef(0);

  const celebrate = useCallback((options: ActionFeedbackOptions) => {
    setFeedback({ ...options, id: ++sequence.current });
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return (
    <ActionFeedbackContext.Provider value={celebrate}>
      {children}
      <div className="action-feedback-dock" role="status" aria-live="polite" aria-atomic="true">
        {feedback && (
          <div key={feedback.id} className="action-feedback-toast">
            <span className="action-feedback-icon" aria-hidden="true"><ActionGlyph kind={feedback.kind} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zen-900">{feedback.message}</span>
              {feedback.detail && <span className="block truncate text-xs text-zen-600">{feedback.detail}</span>}
            </span>
          </div>
        )}
      </div>
      {feedback?.origin && (
        <div
          key={feedback.id}
          className="action-feedback-burst"
          style={{ left: feedback.origin.x, top: feedback.origin.y }}
          aria-hidden="true"
        >
          <span className="action-feedback-ripple" />
          <span className="action-feedback-mark"><ActionGlyph kind={feedback.kind} /></span>
          {[[-19, -17], [20, -14], [19, 18], [-18, 19]].map(([x, y], index) => (
            <span
              key={index}
              className="action-feedback-spark"
              style={{ '--spark-x': `${x}px`, '--spark-y': `${y}px`, '--spark-delay': `${index * 18}ms` } as CSSProperties}
            />
          ))}
        </div>
      )}
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  return useContext(ActionFeedbackContext);
}
