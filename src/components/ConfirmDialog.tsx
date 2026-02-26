'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog replacing native window.confirm().
 * Follows the existing framer-motion modal pattern used in the app.
 * Focus defaults to the Cancel button to prevent accidental deletion.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onCancel}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-sm rounded-3xl bg-surface p-6 shadow-xl border border-zen-200"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 rounded-full bg-red-100 p-2">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="confirm-dialog-title"
                  className="text-base font-semibold text-zen-900"
                >
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-sm text-zen-600">{description}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm font-medium text-zen-700 bg-zen-100 hover:bg-zen-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-400"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
