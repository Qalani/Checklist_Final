'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ImportResult {
  imported: number;
  skipped: number;
  truncated: number;
  errors: string[];
}

interface ImportTasksModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportTasksModal({ open, onClose, onImported }: ImportTasksModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleClose() {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setImporting(false);
    onClose();
  }

  function handleFileChange(file: File | null) {
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!selectedFile) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError('You must be signed in to import tasks.');
        return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/tasks/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? 'Import failed. Please try again.');
        return;
      }

      setResult(json as ImportResult);
      onImported();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-3xl bg-surface border border-zen-200 shadow-lift p-6 space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center text-white shadow-soft">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zen-900">Import tasks</h2>
                  <p className="text-sm text-zen-500">From a JSON or CSV file</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl text-zen-400 hover:text-zen-600 hover:bg-zen-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format guide */}
            {!result && (
              <div className="rounded-2xl bg-zen-50 border border-zen-100 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zen-400">Supported formats</p>
                <div className="space-y-2 text-sm text-zen-600">
                  <p>
                    <strong className="text-zen-800">JSON</strong> — array of objects with{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">title</code>,{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">description</code>,{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">priority</code> (low/medium/high),{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">category</code>,{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">due_date</code>,{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">completed</code>
                  </p>
                  <p>
                    <strong className="text-zen-800">CSV</strong> — rows with a{' '}
                    <code className="bg-zen-100 rounded px-1 text-xs">title</code> header column (others optional)
                  </p>
                </div>
                <p className="text-xs text-zen-400">Up to 200 tasks per import. Only <strong>title</strong> is required.</p>
              </div>
            )}

            {/* File drop zone */}
            {!result && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Select a file to import"
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                  dragging
                    ? 'border-sage-400 bg-sage-50'
                    : selectedFile
                      ? 'border-sage-300 bg-sage-50/50'
                      : 'border-zen-200 hover:border-zen-300 hover:bg-zen-50/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileChange(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-8 h-8 text-sage-500" />
                    <p className="font-medium text-zen-800">{selectedFile.name}</p>
                    <p className="text-xs text-zen-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-zen-300" />
                    <p className="text-sm font-medium text-zen-600">Drop a file here, or click to browse</p>
                    <p className="text-xs text-zen-400">.json or .csv</p>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success result */}
            {result && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-sage-600" />
                  <span>
                    Imported <strong>{result.imported}</strong> task{result.imported !== 1 ? 's' : ''} successfully.
                    {result.skipped > 0 && ` ${result.skipped} skipped.`}
                    {result.truncated > 0 && ` ${result.truncated} omitted (200-task limit).`}
                  </span>
                </div>
                {result.errors.length > 0 && (
                  <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <summary className="text-sm font-medium text-amber-800 cursor-pointer">
                      {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-amber-700 list-disc list-inside">
                      {result.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
              >
                {result ? 'Done' : 'Cancel'}
              </button>
              {!result && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!selectedFile || importing}
                  className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'Importing…' : 'Import tasks'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
