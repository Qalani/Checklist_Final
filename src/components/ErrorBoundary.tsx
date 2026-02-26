'use client';

import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Page-level React Error Boundary.
 * Catches unhandled render errors in the component tree below it and
 * displays a friendly recovery UI instead of a blank screen.
 */
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 px-4 text-center">
          <div className="max-w-md rounded-3xl border border-zen-200/70 bg-white/90 p-10 shadow-large">
            <h1 className="text-2xl font-semibold text-zen-900">Something went wrong</h1>
            {this.state.message && (
              <p className="mt-2 text-sm text-zen-600">{this.state.message}</p>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="rounded-full bg-sage-500 px-5 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-sage-600"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-full border border-zen-200 bg-white/80 px-5 py-2 text-sm font-semibold text-zen-700 shadow-soft transition-colors hover:border-zen-400 hover:text-zen-900"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
